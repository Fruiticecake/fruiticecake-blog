---
title: 从三次握手到 TLS 1.3：TCP 建连、挥手与线上排障
display_title: 从[三次握手]到 TLS 1.3
date: 2026-10-27
section: docs
summary: "TCP 怎么建立和关闭连接，TIME_WAIT 和 CLOSE_WAIT 分别说明了什么，重启报 Address already in use 怎么办，以及 TLS 1.3 如何在一个往返里协商出密钥。"
tags: [网络, TCP, TLS, Linux, 排障]
kicker: 技术文档 / 网络 · TCP · TLS
source: "https://www.rfc-editor.org/rfc/rfc9293"
source_label: RFC 9293 · RFC 8446
design: stage
hero: wire
---

::: tldr
TCP 用**三次握手**同步双方的初始序号，用**四次挥手**让两个方向各自关闭。线上看到大量 TIME_WAIT 多半是正常现象，看到大量 **CLOSE_WAIT** 一定是自己的代码没调 `close()`。TLS 1.3 把加密握手压到 **1 个往返**，前提是证书链和主机名都配对了。
:::

这篇是我自己的复习笔记，事实以 RFC 9293（TCP）、RFC 8446（TLS 1.3）和 Linux 内核文档为准，加了图解和线上遇到过的坑。个人站原文里的状态机和时序图可以点着一步步走。

## [NOTE] 一条 HTTPS 请求，先要走几趟

打开一个 `https://` 地址，在发出第一个字节的 HTTP 请求之前，要先完成两次握手：

1. **TCP 握手**：建立一条可靠的字节流，1 个往返（RTT）。
2. **TLS 握手**：在这条字节流上协商密钥、验证对方身份。TLS 1.3 是 1 个 RTT，TLS 1.2 是 2 个 RTT。

所以一个全新的 HTTPS 连接，拿到响应至少要 3 个 RTT（TLS 1.3）或 4 个 RTT（TLS 1.2）。跨洋链路一个 RTT 可能是 150 ms 以上，这就是连接复用、Keep-Alive 和 TLS 会话恢复值得做的原因。

## [TCP] 三次握手：同步两个方向的序号

TCP 是全双工的：两个方向各有一条独立的字节流，每条流都有自己的**初始序号**（ISN）。握手要做的事就是让双方都知道对方的 ISN，并确认对方收到了自己的 ISN。

1. 客户端发 `SYN, seq=x`，进入 `SYN_SENT`。
2. 服务端回 `SYN+ACK, seq=y, ack=x+1`，进入 `SYN_RCVD`。
3. 客户端回 `ACK, ack=y+1`，双方进入 `ESTABLISHED`。

为什么不是两次？两次只能确认「客户端 → 服务端」这个方向。服务端发出的 `y` 有没有被收到，必须靠第三个包确认。另一个原因是防**历史重复的 SYN**：网络里滞留的旧 SYN 到达服务端时，客户端会用 RST 拒绝那个它不认识的 SYN+ACK，连接不会被错误地建立。

::: interactive tcp-flow title="TCP 状态机：握手与挥手" hint="CLICK / ← →" mode="open"
**三次握手**（客户端 ⇄ 服务端）：

1. 客户端 → `SYN seq=x`：客户端 CLOSED → SYN_SENT；服务端处于 LISTEN。
2. 服务端 → `SYN+ACK seq=y ack=x+1`：服务端 LISTEN → SYN_RCVD。
3. 客户端 → `ACK ack=y+1`：双方 → ESTABLISHED。第三个包可以顺带数据。
:::

### 握手在代码里的位置

- 客户端的 `connect()` 发出 SYN，收到 SYN+ACK 并回完 ACK 后返回。
- 服务端的 `listen()` 之后，握手**全部由内核完成**：半连接放在 SYN 队列，握手完成的连接放进 accept 队列。`accept()` 只是从 accept 队列里取一个已经建好的连接。
- `listen(fd, backlog)` 的 `backlog` 限制的是 accept 队列长度（Linux 上还受 `net.core.somaxconn` 约束）。应用 `accept()` 太慢、队列满了，新连接的握手就会失败或被丢弃，客户端表现为连接超时。
- SYN Flood 攻击打的是 SYN 队列。Linux 的 `net.ipv4.tcp_syncookies` 在队列溢出时用 SYN Cookie 兜底，不需要为半连接分配状态。

## [TCP] 四次挥手：两个方向各关各的

因为两个方向独立，关闭也要各关一次。主动关闭的一方（下面以客户端为例，实际上谁先调 `close()` 谁就是主动方）：

1. 主动方发 `FIN`，进入 `FIN_WAIT_1`。
2. 被动方回 `ACK`，进入 **`CLOSE_WAIT`**；主动方收到 ACK 进入 `FIN_WAIT_2`。
3. 被动方的**应用程序调用 `close()`** 后，才发出自己的 `FIN`，进入 `LAST_ACK`。
4. 主动方回 `ACK`，进入 **`TIME_WAIT`**，等 2MSL 后才变成 `CLOSED`；被动方收到 ACK 直接 `CLOSED`。

第 2 步和第 3 步之间隔多久，完全取决于被动方的应用什么时候调 `close()`。如果被动方收到 FIN 时手上刚好也没数据要发，第 2、3 步可以合并成一个 `FIN+ACK`，抓包里看起来就是「三次挥手」。

::: interactive tcp-flow title="四次挥手（可以试试「忘了 close()」）" hint="CLICK / ← →" mode="close"
**四次挥手**（主动方 ⇄ 被动方）：

1. 主动方 → `FIN`：主动方 ESTABLISHED → FIN_WAIT_1。
2. 被动方 → `ACK`：被动方 → CLOSE_WAIT；主动方 → FIN_WAIT_2。
3. 被动方应用调用 `close()`，发出 `FIN`：被动方 → LAST_ACK。
4. 主动方 → `ACK`：主动方 → TIME_WAIT，等待 2MSL 后 CLOSED；被动方 → CLOSED。

如果被动方的代码忘了调 `close()`，第 3 步永远不会发生：被动方一直停在 CLOSE_WAIT，主动方停在 FIN_WAIT_2 直到超时。
:::

### TIME_WAIT 为什么要等 2MSL

MSL 是一个报文在网络里能存活的最长时间。主动关闭方在 TIME_WAIT 多等一会，有两个目的：

- **保证最后一个 ACK 能送到**：如果它丢了，被动方会重发 FIN，主动方还在 TIME_WAIT 才能再回一次 ACK；否则只能回 RST。
- **让旧连接的残留报文消失**：同一个四元组（源 IP、源端口、目的 IP、目的端口）如果马上被新连接复用，上一个连接迟到的报文可能被当成新连接的数据。

Linux 里 TIME_WAIT 的时长是写死在内核里的 60 秒（`TCP_TIMEWAIT_LEN`），不能通过 sysctl 调整。注意：`net.ipv4.tcp_fin_timeout` 管的是孤儿连接在 **FIN_WAIT_2** 的超时，不是 TIME_WAIT。

## [PIT] 坑一：重启服务，bind 报 Address already in use

现象：服务刚停掉就重启，启动日志里出现 `bind: Address already in use`（`EADDRINUSE`），过一分钟左右再启动又好了。

::: quote
端口没有被别的进程占着，是*上一个进程留下的 TIME_WAIT 连接*还占着这个端口。
:::

原因链条是这样的：

1. 服务进程退出时，内核替它关闭所有已建立的连接——这时**服务端是主动关闭方**。
2. 这些连接的本地端口都是 8080，它们进入 TIME_WAIT，要存在 60 秒。
3. 新进程 `bind(:8080)` 时，内核默认认为这个端口「还在用」，于是拒绝。

解决办法是在 `bind()` **之前**设置 `SO_REUSEADDR`。在 Linux 上它的含义是：只要没有另一个处于 LISTEN 状态的 socket 占着同一个地址，就允许绑定到有 TIME_WAIT 连接的端口。它不会让两个进程同时监听同一个端口，所以是安全的。

::: interactive port-restart title="重启模拟：有没有 SO_REUSEADDR" hint="TOGGLE / RESTART"
**重启时发生了什么**：

- 旧进程退出 → 内核主动关闭它的连接 → 这些连接在服务端以 TIME_WAIT 状态保留 60 秒，本地端口都是 8080。
- 未设置 SO_REUSEADDR：新进程 bind(8080) 失败，报 Address already in use，要等 TIME_WAIT 全部过期。
- 设置了 SO_REUSEADDR：新进程 bind(8080) 立即成功；TIME_WAIT 连接照常自然过期，互不影响。
- 如果旧进程其实还活着（还在 LISTEN），即使设置了 SO_REUSEADDR 也会失败——这时该查的是谁占着端口。
:::

各语言的写法：

```python
# Python：必须在 bind() 之前设置
import socket

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("0.0.0.0", 8080))
srv.listen(128)
```

```c
/* C */
int on = 1;
setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof(on));
bind(fd, (struct sockaddr *)&addr, sizeof(addr));
```

```java
// Java：同样要在 bind 之前
ServerSocket ss = new ServerSocket();
ss.setReuseAddress(true);
ss.bind(new InetSocketAddress(8080));
```

几个容易混淆的点：

- **很多框架已经替你设了。** Go 的 `net.Listen`、Nginx、Node.js 的 `net.Server` 在 Linux 上默认就开了 `SO_REUSEADDR`；Python 的 `socketserver` / `http.server` 需要 `allow_reuse_address = True`（`HTTPServer` 已经默认开启）。自己裸写 socket 时最容易漏。
- **`SO_REUSEPORT` 是另一回事**：它允许多个进程同时监听同一个端口，由内核做负载均衡，用于多进程服务，不是解决重启问题的工具。
- **Windows 语义不同**：Windows 上的 `SO_REUSEADDR` 允许别的进程抢占已在监听的端口，有安全风险；服务端应该用 `SO_EXCLUSIVEADDRUSE`。
- **不要用 `SO_LINGER` 设为 0 来「消灭」TIME_WAIT**：这会让 `close()` 直接发 RST，对端可能丢掉还没读完的数据。

### 客户端的 TIME_WAIT 太多怎么办

客户端（比如一个频繁请求下游的服务）是主动关闭方时，TIME_WAIT 会堆在客户端，极端情况下耗尽本地临时端口，报 `Cannot assign requested address`（`EADDRNOTAVAIL`）。优先级从高到低：

1. **复用连接**：HTTP Keep-Alive、连接池。这是根本解法。
2. 扩大临时端口范围：`net.ipv4.ip_local_port_range`。
3. 开启 `net.ipv4.tcp_tw_reuse`：允许新的**出站**连接复用 TIME_WAIT 状态的端口（依赖 TCP 时间戳），对入站连接无效。
4. 不要找 `tcp_tw_recycle`：它在 NAT 环境下会误丢包，已经在 Linux 4.12 里被删除。

## [PIT] 坑二：线上大量 CLOSE_WAIT

现象：`ss` 或 `netstat` 里 CLOSE_WAIT 越来越多，进程的文件描述符一路涨到上限，最后报 `Too many open files`，服务不再接受新连接。

::: quote
CLOSE_WAIT 的意思是：*对方已经关了，内核也回了 ACK，就等你的程序调 close()*。
:::

回到四次挥手：被动方收到 FIN 后进入 CLOSE_WAIT，内核**没有任何超时**会把它推进到下一步，只有应用调用 `close()` 才会发出 FIN。所以 CLOSE_WAIT 堆积不是网络问题，也不是内核参数问题，**是程序 bug**。调大文件描述符上限只能延后爆炸时间。

先定位是谁、连的是哪里：

```bash
# 统计各状态的连接数
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn

# 只看 CLOSE_WAIT，带上进程信息（-p 需要 root 或同用户）
ss -tanp state close-wait

# 按对端地址聚合，看是哪个下游
ss -tan state close-wait | awk 'NR>1 {print $4}' | sort | uniq -c | sort -rn | head

# 进程打开的 fd 数量
ls /proc/<pid>/fd | wc -l
```

对端地址能告诉你是哪段代码：如果 CLOSE_WAIT 的对端是 Redis 或某个 HTTP 下游，就去查调用它的客户端代码；如果是浏览器或上游网关，就查服务端处理请求的代码。

常见的几种写法错误：

```python
# 错误：异常路径上没有关闭
def fetch(host):
    s = socket.create_connection((host, 80))
    s.sendall(b"GET / HTTP/1.0\r\n\r\n")
    data = s.recv(4096)        # 这里抛异常，s 就泄漏了
    s.close()
    return data

# 正确：用上下文管理器，任何路径都会关闭
def fetch(host):
    with socket.create_connection((host, 80)) as s:
        s.sendall(b"GET / HTTP/1.0\r\n\r\n")
        return s.recv(4096)
```

```python
# 错误：recv 返回 b"" 表示对端已经发了 FIN，却没有关闭，继续循环
while True:
    data = conn.recv(4096)
    if not data:
        continue               # 应该 break 并 conn.close()
    handle(data)
```

其他高频来源：

- **HTTP 客户端的响应体没读完或没关闭**：比如 Go 里没 `defer resp.Body.Close()`，Java 里 `CloseableHttpResponse` 没 close，连接回不到池里，也关不掉。
- **连接池配置**：下游已经因为空闲超时关闭了连接，池里的连接却一直没人取用也没人检查，就停在 CLOSE_WAIT。给连接池配上空闲检测或空闲超时，要短于下游的超时。
- **处理线程卡住**：业务线程阻塞在别的锁或下游调用上，走不到关闭那一行。这时配合 `jstack`、`py-spy dump` 看线程栈。

一句话对比两个状态：**TIME_WAIT 在主动关闭方，会自己消失，多数时候是正常的；CLOSE_WAIT 在被动关闭方，不会自己消失，有堆积就是 bug。**

## [TLS] TLS 1.3：一个往返协商出密钥

TCP 只保证字节按顺序送到，不管路上有没有人偷看或篡改。TLS 在 TCP 之上做三件事：

- **加密**：中间人看不到内容；
- **完整性**：内容被改了能发现；
- **身份认证**：通过证书确认对方就是你要连的那个域名。

核心思路是：用**非对称**手段（ECDHE 密钥交换 + 证书签名）安全地协商出一个共享密钥，之后的所有数据用**对称**加密（AES-GCM 或 ChaCha20-Poly1305），因为对称加密快得多。

TLS 1.3 的完整握手：

1. 客户端发 **ClientHello**：支持的版本、密码套件、SNI（要访问的域名）、ALPN（比如 h2），以及**直接附上自己的 ECDHE 公钥**（`key_share`）。
2. 服务端回 **ServerHello**，带上自己的 `key_share`。此时双方已经能算出同一个共享密钥，**后面的握手消息全部加密**：EncryptedExtensions、Certificate（证书链）、CertificateVerify（用私钥对握手记录签名，证明证书真是它的）、Finished。
3. 客户端验证证书和签名，发出自己的 **Finished**，紧接着就可以发 HTTP 请求。

关键在第 1 步：TLS 1.2 要先问「你支持什么」再交换密钥，TLS 1.3 让客户端**先猜**对方支持的曲线（通常是 X25519）并直接把公钥发过去，省掉一个往返。猜错了服务端会回 HelloRetryRequest，多花一个 RTT。

::: interactive tls-compare title="TLS 1.2 vs 1.3：数一数往返" hint="SWITCH VERSION"
**TLS 1.2**（2-RTT）：

1. 客户端 → ClientHello
2. 服务端 → ServerHello、Certificate、ServerKeyExchange、ServerHelloDone
3. 客户端 → ClientKeyExchange、ChangeCipherSpec、Finished
4. 服务端 → ChangeCipherSpec、Finished；此后客户端才能发应用数据

**TLS 1.3**（1-RTT）：

1. 客户端 → ClientHello + key_share
2. 服务端 → ServerHello + key_share，以及加密的 EncryptedExtensions、Certificate、CertificateVerify、Finished
3. 客户端 → Finished + 应用数据

加上 TCP 握手的 1 个 RTT，全新 HTTPS 连接拿到第一个响应：TLS 1.3 需要 3 个 RTT，TLS 1.2 需要 4 个 RTT。
:::

### TLS 1.3 还删掉了什么

- **删掉了 RSA 密钥交换**：1.2 里可以用服务器的 RSA 公钥直接加密预主密钥，一旦私钥泄露，录下来的历史流量全部能解密。1.3 只保留 (EC)DHE，**前向保密**成了强制项。
- **删掉了老算法**：RC4、3DES、CBC 模式、SHA-1、静态 DH、压缩、重协商。密码套件只剩 5 个，全部是 AEAD。
- **0-RTT（Early Data）**：恢复会话时客户端可以在第一个包里就带上数据，但这些数据**可能被重放**。只能用于幂等请求（比如 GET），服务端要明确开启并做防重放。

### 证书校验：客户端到底检查了什么

::: interactive pipeline title="客户端校验证书的步骤" hint="CLICK / ← →"
1. **拼出证书链**（Certificate）：服务端发来叶子证书和中间证书，客户端补上本地信任库里的根证书。→ 一条完整的链
2. **逐级验签**（签名）：每一张证书都要由上一级的私钥签发，一直验到受信任的根。→ 链可信
3. **检查有效期**（时间）：每张证书都必须在 notBefore 和 notAfter 之间，依赖本机时钟准确。→ 未过期
4. **匹配主机名**（SAN）：访问的域名必须出现在叶子证书的 Subject Alternative Name 里，通配符只匹配一级。→ 身份正确
5. **检查吊销**（OCSP）：通过 OCSP Stapling 或 CRL 确认证书没有被吊销，各客户端的严格程度不同。→ 未吊销
6. **验证私钥持有**（CertificateVerify）：服务端用证书对应的私钥对握手记录签名，证明它不是拿着别人的公开证书冒充。→ 握手完成
:::

## [PIT] 坑三：TLS 的常见报错

| 报错 / 现象 | 常见原因 | 怎么查、怎么改 |
|---|---|---|
| 浏览器正常，curl / Java / 手机报 `unable to get local issuer certificate` | 服务端**没有发中间证书**，浏览器靠缓存或 AIA 自己补上了 | 部署时用 fullchain（叶子 + 中间），`openssl s_client -showcerts` 看对方发了几张 |
| `certificate has expired` / `not yet valid` | 证书过期，或客户端机器时钟错了 | `openssl x509 -noout -dates`；嵌入式设备先查 NTP |
| `hostname mismatch` / `doesn't match` | 访问的域名不在 SAN 里；用 IP 访问了只签了域名的证书 | 看证书的 SAN 列表，改访问地址或重签 |
| 一台服务器多个域名，拿到的是别的证书 | 客户端没发 **SNI** | `openssl s_client` 加 `-servername`；老客户端升级 |
| `handshake failure` / `no shared cipher` / `protocol version` | 双方没有共同支持的版本或套件 | 用 `-tls1_2` / `-tls1_3` 分别试；升级老旧客户端 |
| 内网自签证书报错 | 客户端信任库里没有你的 CA | 把内部 CA 加入信任库，**不要**在代码里关闭校验 |

排查命令：

```bash
# 看握手细节、对方发来的证书链、协商出的版本和套件
openssl s_client -connect example.com:443 -servername example.com -showcerts </dev/null

# 指定 TLS 版本测试
openssl s_client -connect example.com:443 -servername example.com -tls1_3 </dev/null

# 看证书有效期和 SAN
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -dates -ext subjectAltName

# curl 的详细握手日志
curl -vI https://example.com
```

::: ledger
- [-] **不要关闭证书校验** `verify=False`、`InsecureSkipVerify: true`、信任所有证书的 TrustManager，等于只剩加密、没有身份认证，中间人可以随意冒充。
- [+] **自动续期** 用 ACME（Let's Encrypt 等）自动签发和续期，并对证书到期时间加监控告警。
- [+] **部署完整链** 服务端配置 fullchain，而不是只有叶子证书。
- [+] **复用连接** 连接池和会话恢复能省掉大部分 TCP + TLS 握手的往返。
:::

## [NOTE] 速查：看到什么状态，想到什么

::: stats
- TCP HANDSHAKE | 1 RTT | 三次握手，第三个包可带数据
- TLS 1.3 | 1 RTT | 1.2 需要 2 RTT
- TIME_WAIT | 60s | Linux 内核写死的 2MSL
:::

::: lessons
1. **先分清谁是主动关闭方。**TIME_WAIT 在主动方，CLOSE_WAIT 在被动方。看到一个状态，先问「这台机器在这条连接里扮演哪个角色」。
2. **CLOSE_WAIT 只有应用能解决。**内核不会替你关闭，调参数没用；按对端地址聚合，找到泄漏的那段代码，用 `with` / `try-finally` / `defer` 保证任何路径都关闭。
3. **服务端监听 socket 一律在 bind 前设 SO_REUSEADDR。**先看框架是不是已经设了，裸写 socket 时别漏。
4. **能复用就别新建。**每个新的 HTTPS 连接都要付出 2～3 个 RTT 和一次非对称运算，连接池和 Keep-Alive 是最便宜的优化。
5. **证书出错时修配置，不要关校验。**大多数 TLS 报错都是链不完整、主机名不匹配或时钟不对。
:::

## [REF] 参考

- [RFC 9293：Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293)——状态机、三次握手、TIME_WAIT
- [RFC 8446：The Transport Layer Security (TLS) Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [RFC 5246：TLS 1.2](https://www.rfc-editor.org/rfc/rfc5246)——用于对比 1.2 的握手流程
- [Linux 内核文档：ip-sysctl](https://docs.kernel.org/networking/ip-sysctl.html)——`tcp_fin_timeout`、`tcp_tw_reuse`、`tcp_syncookies`、`ip_local_port_range`
- `man 7 socket`（SO_REUSEADDR、SO_REUSEPORT）、`man 8 ss`
- 页面中的时序动画为图解，RTT 计数按理想网络计算，不含丢包重传。
