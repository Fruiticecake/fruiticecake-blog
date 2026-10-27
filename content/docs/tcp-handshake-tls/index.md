---
title: 从三次握手到 TLS 1.3：TCP 建连、挥手、双向认证与线上排障
display_title: 从[三次握手]到 TLS 1.3
date: 2026-10-27
section: docs
summary: "TCP 怎么建立和关闭连接，TIME_WAIT 和 CLOSE_WAIT 分别说明了什么，重启报 Address already in use 怎么办；TLS 1.3 如何在一个往返里协商出密钥，单向与双向认证有什么区别，证书里的公钥长什么样。"
tags: [网络, TCP, TLS, mTLS, X.509, Linux, 排障]
kicker: 技术文档 / 网络 · TCP · TLS
source: "https://www.rfc-editor.org/rfc/rfc9293"
source_label: RFC 9293 · RFC 8446
design: stage
hero: wire
---

::: tldr
TCP 用**三次握手**同步双方的初始序号，用**四次挥手**让两个方向各自关闭。线上看到大量 TIME_WAIT 多半是正常现象，看到大量 **CLOSE_WAIT** 一定是自己的代码没调 `close()`。TLS 1.3 把加密握手压到 **1 个往返**，双向认证（mTLS）也不多花往返；证书里的公钥只用来验签，不用来加密数据。
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

## [TLS] 证书里装了什么：公钥在哪个字段

证书校验的每一步都在读证书里的某个字段。TLS 用的证书是 **X.509 v3** 格式，用 ASN.1 描述结构、按 **DER** 二进制编码；我们平时看到的 `-----BEGIN CERTIFICATE-----` 开头的 **PEM** 文件，只是把 DER 做了 Base64 再加上头尾两行。

一张证书分三大块：

1. **`tbsCertificate`**（To Be Signed，待签名的内容）：证书的全部信息都在这里。
2. **`signatureAlgorithm`**：签发者用什么算法签名，比如 `ecdsa-with-SHA256`、`sha256WithRSAEncryption`。
3. **`signatureValue`**：签发者（上一级 CA）用**它自己的私钥**对 `tbsCertificate` 的签名。

`tbsCertificate` 里的字段：

| 字段 | 内容 | 校验时用来干什么 |
|---|---|---|
| `version` | v3（编码值为 2） | v3 才有扩展字段 |
| `serialNumber` | CA 分配的序列号 | 吊销列表（CRL / OCSP）按它查 |
| `issuer` | 签发者的名字 | 找上一级证书，拼证书链 |
| `validity` | `notBefore` / `notAfter` | 检查有效期 |
| `subject` | 持有者的名字，如 `CN=api.example.com` | 客户端证书常用 CN 标识「这是哪个服务 / 设备」 |
| **`subjectPublicKeyInfo`** | **持有者的公钥**：算法 + 公钥本体 | 验证持有者发来的 CertificateVerify 签名 |
| `extensions` | SAN、密钥用途、扩展密钥用途、是否 CA、AKI / SKI、OCSP 地址等 | 主机名匹配、用途检查、拼链 |

所以问题的答案是：**公钥放在 `tbsCertificate` 里的 `subjectPublicKeyInfo`（SPKI）字段**，服务端证书和客户端证书都一样。SPKI 自己又分两部分：

- **`algorithm`**：一个算法标识（OID），加上可选参数。
- **`subjectPublicKey`**：一个 BIT STRING，里面是公钥本体。它的格式取决于算法：

| 算法 | algorithm（OID） | subjectPublicKey 里装的 | SPKI 总长（DER） |
|---|---|---|---|
| RSA 2048 | `rsaEncryption` 1.2.840.113549.1.1.1，参数为 NULL | 又一层 DER：`RSAPublicKey ::= SEQUENCE { modulus n, publicExponent e }`，e 通常是 65537 | 294 字节 |
| ECDSA P-256 | `id-ecPublicKey` 1.2.840.10045.2.1，参数是曲线 `prime256v1` 1.2.840.10045.3.1.7 | 椭圆曲线上的一个点，未压缩格式：`0x04 ‖ X(32 字节) ‖ Y(32 字节)`，共 65 字节 | 91 字节 |
| Ed25519 | `id-Ed25519` 1.3.101.112，无参数 | 32 字节的原始公钥 | 44 字节 |

::: interactive cert-anatomy title="拆开一张证书" hint="CLICK FIELD / SWITCH"
**一张 X.509 v3 证书的结构**（服务端证书和客户端证书结构完全相同，区别只在字段的值）：

- `tbsCertificate`
  - `version`：v3
  - `serialNumber`：序列号
  - `signature`：签名算法（与外层 signatureAlgorithm 相同）
  - `issuer`：签发者
  - `validity`：notBefore / notAfter
  - `subject`：持有者。服务端证书如 `CN=api.example.com`；客户端证书如 `CN=order-service`
  - `subjectPublicKeyInfo`：持有者的公钥 = algorithm（OID + 参数）+ subjectPublicKey（BIT STRING）
  - `extensions`：subjectAltName（服务端证书必须包含域名）、keyUsage（digitalSignature）、extendedKeyUsage（服务端证书是 serverAuth，客户端证书是 clientAuth）、basicConstraints（CA:FALSE）
- `signatureAlgorithm`：如 ecdsa-with-SHA256
- `signatureValue`：上一级 CA 的私钥对 tbsCertificate 的签名
:::

几个容易混淆的点：

- **证书里的公钥不用来加密数据。**TLS 1.3 里它只做一件事：验证对方在 CertificateVerify 里用私钥做的签名，证明「这张证书确实是你的」。真正用来协商密钥的是 `key_share` 里的 **ECDHE 临时公钥**，每次连接都重新生成，用完就扔——这就是前向保密。（TLS 1.2 的 RSA 密钥交换会用证书公钥加密预主密钥，1.3 已删除这种方式。）
- **两种 PEM 公钥文件**：`-----BEGIN PUBLIC KEY-----` 里是完整的 SPKI（带算法标识），`-----BEGIN RSA PUBLIC KEY-----` 是 PKCS#1 格式，只有 RSA 的 n 和 e。
- **证书「固定」（pinning）通常固定的是 SPKI 的哈希**，而不是整张证书：续期时只要不换密钥对，SPKI 不变，固定就不会失效。

动手看一看：

```bash
# 证书的全部字段（Subject Public Key Info 一节就是公钥）
openssl x509 -in server.crt -noout -text

# 只导出公钥，得到 -----BEGIN PUBLIC KEY-----（即 SPKI 的 PEM）
openssl x509 -in server.crt -noout -pubkey > server.pub

# 看 SPKI 的 ASN.1 结构：算法 OID、曲线参数、BIT STRING
openssl asn1parse -in server.pub

# SPKI 的 SHA-256 指纹（pinning 用的就是它）
openssl pkey -pubin -in server.pub -outform der | openssl dgst -sha256 -binary | base64
```

## [TLS] 认证的三个层级：不验证、单向、双向

「加密」和「认证」是两件事：ECDHE 保证了中间没人能偷听，但如果不验证证书，你可能正在和一个中间人加密聊天。按「谁验证谁」，TLS 连接分三个层级：

| 层级 | 谁出示证书 | 谁验证谁 | 典型场景 |
|---|---|---|---|
| **不验证**（`verify=False`） | 服务端出示 | 没人验证 | 只该出现在临时调试里；等于没有身份认证 |
| **单向认证** | 只有服务端 | 客户端验证服务端 | 浏览器访问网站、绝大多数 HTTPS API |
| **双向认证（mTLS）** | 服务端和客户端都出示 | 双方互相验证 | 服务间调用（零信任 / 服务网格）、IoT 设备接入、银行与支付等 B2B 接口 |

单向认证里，服务端怎么确认用户是谁？靠**应用层**：密码、Cookie、Token。双向认证把「你是谁」下沉到**传输层**：没有合法客户端证书的连接，在握手阶段就被拒绝，请求根本到不了业务代码。

### 双向认证在握手里多了什么

TLS 1.3 的双向认证**不增加往返**，还是 1-RTT，只是多了三条消息：

1. 服务端在 EncryptedExtensions 之后发 **CertificateRequest**：要求客户端出示证书，并告诉它可以用哪些签名算法（`signature_algorithms`），以及服务端信任哪些 CA（`certificate_authorities`，可选）。
2. 客户端回 **Certificate**：自己的证书链。
3. 客户端回 **CertificateVerify**：用**客户端私钥**对到目前为止的握手记录签名，证明它持有证书对应的私钥。然后才是客户端的 Finished。

服务端拿到后，做的校验和客户端校验服务端证书几乎一样：证书链能否追溯到**服务端配置的客户端 CA**、是否在有效期、扩展密钥用途是否包含 **`clientAuth`**、CertificateVerify 签名是否正确。不同的是**不检查主机名**——客户端没有域名可匹配，身份一般取自 `subject` 的 CN 或 SAN（比如 `URI:spiffe://…`），由应用自己决定怎么授权。

如果客户端没有合适的证书，它会发一个**空的 Certificate**。服务端要求必须认证时，TLS 1.3 下会以 `certificate_required` 告警中断握手。

::: interactive tls-auth title="三种认证层级的 TLS 1.3 握手" hint="SWITCH MODE"
**不验证**：报文和单向认证完全一样，但客户端跳过证书校验，中间人可以冒充服务端。

**单向认证**（3 条消息，1-RTT）：

1. 客户端 → ClientHello + key_share
2. 服务端 → ServerHello + key_share，加密的 EncryptedExtensions、Certificate、CertificateVerify、Finished
3. 客户端 → Finished + 应用数据

**双向认证**（仍然 1-RTT）：

1. 客户端 → ClientHello + key_share
2. 服务端 → ServerHello + key_share，加密的 EncryptedExtensions、**CertificateRequest**、Certificate、CertificateVerify、Finished
3. 客户端 → 加密的 **Certificate、CertificateVerify**、Finished + 应用数据

双向认证时，服务端校验客户端证书：链追溯到配置的客户端 CA、在有效期内、扩展密钥用途含 clientAuth、CertificateVerify 签名正确；不检查主机名。
:::

和 TLS 1.2 对比：1.2 也支持双向认证（服务端在 ServerHelloDone 之前发 CertificateRequest；客户端先发 Certificate，再发 ClientKeyExchange，然后发 CertificateVerify），但那时这些消息是**明文**的，任何旁观者都能看到客户端证书里的身份信息。TLS 1.3 把它们放进加密段，客户端身份也受保护了。TLS 1.3 还支持**握手后认证**（`post_handshake_auth`）：连接建立后再按需要求客户端证书，但 HTTP/2 禁止使用它。

### 动手搭一套双向认证

用 OpenSSL 建一个内部 CA，签一张客户端证书。注意给客户端证书加上 `extendedKeyUsage=clientAuth`：

```bash
# 1. 内部 CA（只用来签客户端证书）
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
  -keyout ca.key -out ca.crt -days 3650 -subj "/CN=Demo Client CA"

# 2. 客户端私钥 + 证书签名请求（CSR），CN 写服务名
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
  -keyout client.key -out client.csr -subj "/CN=order-service"

# 3. CA 签发，标明用途：客户端认证
printf "keyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n" > client.ext
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 365 -extfile client.ext
```

服务端（以 Nginx 为例）开启客户端校验，并把校验结果转给后端：

```nginx
server {
    listen 443 ssl;
    ssl_certificate         /etc/nginx/server.crt;     # 服务端自己的证书（单向认证就有）
    ssl_certificate_key     /etc/nginx/server.key;
    ssl_client_certificate  /etc/nginx/client-ca.crt;  # 信任哪个 CA 签的客户端证书
    ssl_verify_client       on;                        # 必须出示证书；optional 为可选
    ssl_verify_depth        2;

    location / {
        proxy_set_header X-Client-Verify $ssl_client_verify;  # SUCCESS / FAILED:原因 / NONE
        proxy_set_header X-Client-DN     $ssl_client_s_dn;    # 例如 CN=order-service
        proxy_pass http://backend;
    }
}
```

后端只能信任**来自 Nginx 的**这两个请求头，其他来源一律丢弃，否则任何人都能伪造一个 `X-Client-DN`。

客户端出示证书：

```bash
curl --cert client.crt --key client.key --cacert server-ca.crt https://api.internal.example/
```

```python
import requests

resp = requests.get(
    "https://api.internal.example/",
    cert=("client.crt", "client.key"),   # 客户端证书 + 私钥
    verify="server-ca.crt",              # 用来验证服务端的 CA
)
```

```go
// Go 服务端：要求并校验客户端证书
pool := x509.NewCertPool()
pool.AppendCertsFromPEM(clientCAPEM)
srv := &http.Server{
    Addr: ":8443",
    TLSConfig: &tls.Config{
        ClientAuth: tls.RequireAndVerifyClientCert,
        ClientCAs:  pool,
        MinVersion: tls.VersionTLS13,
    },
}
log.Fatal(srv.ListenAndServeTLS("server.crt", "server.key"))
```

本地验证可以直接用 OpenSSL 起一对服务端和客户端：

```bash
openssl s_server -accept 8443 -cert server.crt -key server.key -CAfile ca.crt -Verify 1
openssl s_client -connect localhost:8443 -cert client.crt -key client.key -CAfile server-ca.crt
```

## [PIT] 坑三：TLS 的常见报错

| 报错 / 现象 | 常见原因 | 怎么查、怎么改 |
|---|---|---|
| 浏览器正常，curl / Java / 手机报 `unable to get local issuer certificate` | 服务端**没有发中间证书**，浏览器靠缓存或 AIA 自己补上了 | 部署时用 fullchain（叶子 + 中间），`openssl s_client -showcerts` 看对方发了几张 |
| `certificate has expired` / `not yet valid` | 证书过期，或客户端机器时钟错了 | `openssl x509 -noout -dates`；嵌入式设备先查 NTP |
| `hostname mismatch` / `doesn't match` | 访问的域名不在 SAN 里；用 IP 访问了只签了域名的证书 | 看证书的 SAN 列表，改访问地址或重签 |
| 一台服务器多个域名，拿到的是别的证书 | 客户端没发 **SNI** | `openssl s_client` 加 `-servername`；老客户端升级 |
| `handshake failure` / `no shared cipher` / `protocol version` | 双方没有共同支持的版本或套件 | 用 `-tls1_2` / `-tls1_3` 分别试；升级老旧客户端 |
| 内网自签证书报错 | 客户端信任库里没有你的 CA | 把内部 CA 加入信任库，**不要**在代码里关闭校验 |
| mTLS：`certificate required` / `400 No required SSL certificate was sent` | 客户端没带证书，或它的证书不是服务端要求的 CA 签发的，客户端选择不发 | `openssl s_client` 输出里看 Acceptable client certificate CA names；检查 `--cert` / `--key` 路径 |
| mTLS：`unknown ca` / `unable to verify the first certificate` | 服务端配置的客户端 CA 不是签发这张客户端证书的 CA，或中间证书没一起发 | 服务端 `ssl_client_certificate` 指向正确的 CA；客户端发完整链 |
| mTLS：`unsupported certificate purpose` | 客户端证书的扩展密钥用途里没有 `clientAuth` | `openssl x509 -noout -ext extendedKeyUsage` 检查，重新签发 |
| mTLS：直连正常，经过负载均衡就失败 | 负载均衡器终结了 TLS，客户端证书到不了后端 | 负载均衡改为 TCP 透传，或在负载均衡上做 mTLS 并以可信请求头转发身份 |

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
6. **加密不等于认证。**ECDHE 防偷听，证书 + CertificateVerify 防冒充；服务间调用要确认「对方是谁」时，用 mTLS 把身份校验下沉到握手里。
:::

## [REF] 参考

- [RFC 9293：Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293)——状态机、三次握手、TIME_WAIT
- [RFC 8446：The Transport Layer Security (TLS) Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [RFC 5246：TLS 1.2](https://www.rfc-editor.org/rfc/rfc5246)——用于对比 1.2 的握手流程
- [RFC 5280：X.509 证书与 CRL](https://www.rfc-editor.org/rfc/rfc5280)——证书字段、SubjectPublicKeyInfo、扩展
- [RFC 8740：在 HTTP/2 中使用 TLS 1.3](https://www.rfc-editor.org/rfc/rfc8740)——禁止握手后认证
- [Nginx ngx_http_ssl_module](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)——`ssl_verify_client`、`$ssl_client_verify`
- [Linux 内核文档：ip-sysctl](https://docs.kernel.org/networking/ip-sysctl.html)——`tcp_fin_timeout`、`tcp_tw_reuse`、`tcp_syncookies`、`ip_local_port_range`
- `man 7 socket`（SO_REUSEADDR、SO_REUSEPORT）、`man 8 ss`
- 页面中的时序动画为图解，RTT 计数按理想网络计算，不含丢包重传。
