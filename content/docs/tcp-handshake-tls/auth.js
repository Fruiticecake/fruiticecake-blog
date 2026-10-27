// 认证相关组件：TLS 认证层级（不验证 / 单向 / 双向）与 X.509 证书结构拆解。
// 握手消息与校验项来自 RFC 8446 §4.3.2 / §4.4，证书字段来自 RFC 5280；SPKI 字节数是真实的 DER 编码长度，
// 证书里的名字、序列号、日期等为虚构示例，组件内标注「示意」。

import { svg, el, reduceMotion, onceVisible } from "/stage/lib/dom.js";
import { C2S, S2C, drawMsg, drawLifelines, drawRttBands } from "./ladder.js";

/* ------------------------------------------------------------------
   1. 认证层级：同一个 TLS 1.3 握手，谁验证谁
------------------------------------------------------------------ */
const HELLO = { dir: C2S, text: "ClientHello + key_share", kind: "tls" };
const AUTH_MODES = {
  none: {
    label: "不验证",
    msgs: [HELLO,
      { dir: S2C, text: "ServerHello · {EE, Cert, CV, Fin}", kind: "tls", enc: true },
      { dir: C2S, text: "{Finished} · 应用数据", kind: "http", enc: true }],
    client: "skip", server: "off",
    verdict: "只有加密、没有认证：中间人可以出示自己的证书冒充服务端，客户端照样接受。",
  },
  one: {
    label: "单向认证",
    msgs: [HELLO,
      { dir: S2C, text: "ServerHello · {EE, Cert, CV, Fin}", kind: "tls", enc: true },
      { dir: C2S, text: "{Finished} · 应用数据", kind: "http", enc: true }],
    client: "pass", server: "off",
    verdict: "服务端的身份在握手里确认；客户端是谁，留给应用层（密码、Cookie、Token）。",
  },
  mutual: {
    label: "双向认证 mTLS",
    msgs: [HELLO,
      { dir: S2C, text: "ServerHello · {EE, CertReq, Cert, CV, Fin}", kind: "tls", enc: true, flag: true },
      { dir: C2S, text: "{Cert, CV, Finished} · 应用数据", kind: "http", enc: true, flag: true }],
    client: "pass", server: "pass",
    verdict: "双方身份都在握手里确认，没有合法客户端证书的连接到不了业务代码——仍然只要 1 个往返。",
  },
};
const CHECKS = {
  client: { who: "客户端 → 验证服务端", items: [
    "证书链追溯到系统信任的根 CA", "在有效期内", "访问的域名在 SAN 里", "CertificateVerify：服务端私钥签名正确"] },
  server: { who: "服务端 → 验证客户端", items: [
    "证书链追溯到配置的客户端 CA", "在有效期内", "扩展密钥用途包含 clientAuth", "CertificateVerify：客户端私钥签名正确"] },
};
const IDLE_NOTE = { server: "不要求客户端证书", client: "" };

function checkCard(side) {
  const list = el("ul", { class: "au-checks" }, CHECKS[side].items.map((t) =>
    el("li", { class: "au-check" }, [el("span", { class: "au-mark", "aria-hidden": "true" }), el("span", { text: t })])));
  const note = el("p", { class: "au-idle" });
  const card = el("div", { class: `au-card au-${side}` }, [el("p", { class: "au-who", text: CHECKS[side].who }), list, note]);
  return { card, list, note };
}

function mountTlsAuth(root) {
  root.classList.add("w-au");
  const geo = { left: 60, right: 390, top: 40, row: 50, drop: 28, head: 7, font: 12.5 };
  geo.bottom = geo.top + 3 * geo.row;
  const pic = svg("svg", { viewBox: `0 0 460 ${geo.bottom + 8}`, class: "au-svg", role: "img" });
  const btns = Object.entries(AUTH_MODES).map(([key, m]) =>
    el("button", { type: "button", class: "au-mode", "data-mode": key, "aria-pressed": "false", text: m.label }));
  const cards = { client: checkCard("client"), server: checkCard("server") };
  const verdict = el("p", { class: "au-verdict", "aria-live": "polite" });

  function render(key, animate) {
    const mode = AUTH_MODES[key];
    btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === key)));
    pic.replaceChildren();
    pic.setAttribute("aria-label", `TLS 1.3 ${mode.label}的握手时序，共 1 个往返`);
    drawRttBands(pic, geo, 1);
    drawLifelines(pic, geo, ["CLIENT", "SERVER"]);
    mode.msgs.forEach((m, i) => {
      const g = drawMsg(pic, m, geo, geo.top + i * geo.row);
      if (!animate || reduceMotion) { g.classList.add("is-on"); return; }
      g.style.setProperty("--d", `${i * 0.25}s`);
      requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("is-on")));
    });
    for (const side of ["client", "server"]) {
      const { card, list, note } = cards[side], state = mode[side];
      card.dataset.state = state;
      card.classList.remove("is-run");
      list.hidden = state === "off";
      note.textContent = state === "off" ? IDLE_NOTE[side] : state === "skip" ? "全部跳过（verify=False）" : "";
      if (state !== "off") requestAnimationFrame(() => card.classList.add("is-run"));
    }
    root.classList.toggle("is-danger", key === "none");
    verdict.textContent = mode.verdict;
  }
  btns.forEach((b) => b.addEventListener("click", () => render(b.dataset.mode, true)));

  root.append(
    el("div", { class: "au-bar", role: "group", "aria-label": "认证层级" }, btns),
    pic,
    el("div", { class: "au-cards" }, [cards.client.card, cards.server.card]),
    verdict,
    el("p", { class: "w-caption", text: "TLS 1.3；{ } 和 🔒 表示该报文已加密，带「＋」的是双向认证新增了内容的消息：CertReq = CertificateRequest，CV = CertificateVerify。" }));
  render("one", false);
  onceVisible(root, () => render("mutual", true));
}

/* ------------------------------------------------------------------
   2. 证书拆解：点字段看作用；切换服务端 / 客户端证书；SPKI 按算法展开字节布局
------------------------------------------------------------------ */
const FIELDS = [
  { id: "tbs", depth: 0, name: "tbsCertificate", s: "SEQUENCE { … }",
    desc: "待签名的证书主体，下面的字段都在它里面。CA 的签名覆盖的就是这一整块，改动任何一个字节，签名都会失效。" },
  { id: "version", depth: 1, name: "version", s: "v3（编码值 2）",
    desc: "证书格式版本。只有 v3 能带 extensions，现在的 TLS 证书都是 v3。" },
  { id: "serial", depth: 1, name: "serialNumber", s: "04:7a:…:9c", c: "1f:03:…:e2",
    desc: "在签发 CA 内唯一的编号。吊销时，CRL / OCSP 按「签发者 + 序列号」来查。" },
  { id: "sigin", depth: 1, name: "signature", s: "ecdsa-with-SHA256",
    desc: "CA 签名所用的算法，必须和外层的 signatureAlgorithm 一致。" },
  { id: "issuer", depth: 1, name: "issuer", s: "CN=Example Issuing CA", c: "CN=Demo Client CA",
    desc: "签发者的名字。拼证书链时用它找上一级证书。服务端证书一般来自公共 CA；客户端证书一般来自自建的内部 CA，服务端只信任这个 CA。" },
  { id: "validity", depth: 1, name: "validity", s: "2026-10-01 → 2026-12-30", c: "2026-10-27 → 2027-10-27",
    desc: "notBefore / notAfter。校验依赖本机时钟，嵌入式设备时钟不准时会误报过期。" },
  { id: "subject", depth: 1, name: "subject", s: "CN=api.example.com", c: "CN=order-service, OU=payments",
    desc: "持有者的名字。服务端证书的主机名匹配看 SAN 而不是 CN；客户端证书没有主机名可比，服务端通常从 CN（或 SAN 里的 URI）读出「这是哪个服务」，再交给应用做授权。" },
  { id: "spki", depth: 1, name: "subjectPublicKeyInfo", s: "algorithm + subjectPublicKey", spki: true,
    desc: "持有者的公钥。握手时对方用它验证 CertificateVerify 里的签名，证明你持有对应的私钥。它不用来加密数据：会话密钥来自 key_share 里的 ECDHE 临时公钥。" },
  { id: "ext", depth: 1, name: "extensions", s: "v3 扩展",
    desc: "附加属性。每一项可以标 critical：校验方不认识某个 critical 扩展时，必须拒绝整张证书。" },
  { id: "san", depth: 2, name: "subjectAltName", s: "DNS:api.example.com, DNS:*.api.example.com",
    c: "URI:spiffe://example.internal/order-service（可选）",
    desc: "服务端证书的主机名匹配只看这里，通配符只匹配一级。客户端证书可以不带，服务网格常在这里放 SPIFFE ID 作为服务身份。" },
  { id: "ku", depth: 2, name: "keyUsage", s: "critical, digitalSignature",
    desc: "这把密钥能做什么。TLS 1.3 里证书私钥只用来签名，digitalSignature 就够了。" },
  { id: "eku", depth: 2, name: "extendedKeyUsage", s: "serverAuth", c: "clientAuth",
    desc: "证书能扮演的角色。服务端校验客户端证书时要求 clientAuth，缺了就报 unsupported certificate purpose。" },
  { id: "bc", depth: 2, name: "basicConstraints", s: "CA:FALSE",
    desc: "这张证书不能再签发别的证书。只有 CA 证书是 CA:TRUE。" },
  { id: "kid", depth: 2, name: "subject / authority key id", s: "keyid:3b:…:a1",
    desc: "SKI 标识本证书的公钥（常用公钥的 SHA-1 摘要），AKI 指向签发者的 SKI，用来在同名的多张 CA 证书里找对上一级。" },
  { id: "sigalg", depth: 0, name: "signatureAlgorithm", s: "ecdsa-with-SHA256",
    desc: "外层再写一遍签名算法。" },
  { id: "sig", depth: 0, name: "signatureValue", s: "BIT STRING（ECDSA 签名 r, s）",
    desc: "上一级 CA 用自己的私钥对 tbsCertificate 做的签名。验证它要用上一级证书里的公钥——证书链就是这样一级一级验到根的。" },
];
const KEY_TYPES = {
  rsa: { label: "RSA 2048", oid: "rsaEncryption · 1.2.840.113549.1.1.1 · 参数 NULL",
    note: "subjectPublicKey 里又套了一层 DER：RSAPublicKey ::= SEQUENCE { modulus n, publicExponent e }。公钥的大小主要就是 2048 位的模数 n。",
    parts: [["SEQUENCE 头", 4, "hdr"], ["algorithm", 15, "alg"], ["BIT STRING 头", 5, "hdr"],
      ["RSAPublicKey 头", 4, "hdr"], ["modulus n（含前导 0x00）", 261, "key"], ["publicExponent e = 65537", 5, "key"]] },
  ec: { label: "EC P-256", oid: "id-ecPublicKey · 1.2.840.10045.2.1 · 曲线 prime256v1 1.2.840.10045.3.1.7",
    note: "公钥是曲线上的一个点：首字节 0x04 表示未压缩，后面是 32 字节 X 坐标和 32 字节 Y 坐标。",
    parts: [["SEQUENCE 头", 2, "hdr"], ["algorithm", 21, "alg"], ["BIT STRING 头", 3, "hdr"], ["04 ‖ X ‖ Y", 65, "key"]] },
  ed: { label: "Ed25519", oid: "id-Ed25519 · 1.3.101.112 · 无参数",
    note: "没有算法参数，公钥就是 32 字节的原始值。",
    parts: [["SEQUENCE 头", 2, "hdr"], ["algorithm", 7, "alg"], ["BIT STRING 头", 3, "hdr"], ["公钥", 32, "key"]] },
};
const RSA_TOTAL = 294;   // 最长的一种作为比例尺，三种算法的长度可以直接对比

const valueOf = (f, cert) => (cert === "client" && f.c) || f.s;
const sum = (parts) => parts.reduce((a, p) => a + p[1], 0);

function spkiView(keyType) {
  const k = KEY_TYPES[keyType], total = sum(k.parts);
  const bar = el("div", { class: "ca-bytes", style: `width:${(total / RSA_TOTAL) * 100}%`, role: "img",
    "aria-label": `${k.label} 的 SPKI 共 ${total} 字节` },
  k.parts.map(([name, bytes, kind]) => el("span", { class: `ca-seg k-${kind}`, style: `flex-grow:${bytes}`, title: `${name}：${bytes} 字节` })));
  const legend = el("ul", { class: "ca-legend" }, k.parts.map(([name, bytes, kind]) =>
    el("li", { class: `k-${kind}` }, [el("i", { "aria-hidden": "true" }), el("span", { text: name }), el("b", { text: `${bytes} B` })])));
  return [
    el("p", { class: "ca-oid", text: k.oid }),
    el("div", { class: "ca-scale" }, [bar]),
    el("p", { class: "ca-total" }, [el("b", { text: `${total} 字节` }),
      ` DER · PEM「BEGIN PUBLIC KEY」中约 ${Math.ceil(total / 3) * 4} 个 Base64 字符`]),
    legend,
    el("p", { class: "ca-note", text: k.note }),
  ];
}

function mountCertAnatomy(root) {
  root.classList.add("w-ca");
  let cert = "server", fieldId = "spki", keyType = "ec";
  const certBtns = [["server", "服务端证书"], ["client", "客户端证书"]].map(([key, text]) =>
    el("button", { type: "button", class: "ca-cert", "data-cert": key, "aria-pressed": "false", text }));
  const tree = el("ul", { class: "ca-tree", "aria-label": "证书字段" });
  const detail = el("div", { class: "ca-detail", "aria-live": "polite" });
  const items = FIELDS.map((f) => {
    const val = el("span", { class: "ca-val" });
    const btn = el("button", { type: "button", class: "ca-field", "aria-pressed": "false" }, [
      el("span", { class: "ca-name", text: f.name }), val]);
    btn.addEventListener("click", () => { fieldId = f.id; render(); });
    const li = el("li", { class: `ca-row d${f.depth}${f.c ? " is-diff" : ""}${f.spki ? " is-spki" : ""}` }, [btn]);
    tree.append(li);
    return { f, btn, val };
  });
  certBtns.forEach((b) => b.addEventListener("click", () => { cert = b.dataset.cert; render(); }));

  function render() {
    certBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cert === cert)));
    items.forEach(({ f, btn, val }) => {
      val.textContent = valueOf(f, cert);
      btn.setAttribute("aria-pressed", String(f.id === fieldId));
    });
    const f = FIELDS.find((x) => x.id === fieldId);
    const children = [
      el("p", { class: "ca-path", text: f.depth ? `tbsCertificate › ${f.depth === 2 ? "extensions › " : ""}${f.name}` : f.name }),
      el("p", { class: "ca-value", text: valueOf(f, cert) }),
      el("p", { class: "ca-desc", text: f.desc }),
    ];
    if (f.c) children.push(el("p", { class: "ca-diff", text: `另一种证书里：${cert === "server" ? f.c : f.s}` }));
    if (f.spki) {
      const keyBtns = Object.entries(KEY_TYPES).map(([key, k]) => {
        const b = el("button", { type: "button", class: "ca-key", "aria-pressed": String(key === keyType), text: k.label });
        b.addEventListener("click", () => { keyType = key; render(); });
        return b;
      });
      children.push(el("div", { class: "ca-keys", role: "group", "aria-label": "公钥算法" }, keyBtns), ...spkiView(keyType));
    }
    detail.replaceChildren(...children);
  }

  root.append(
    el("div", { class: "ca-bar", role: "group", "aria-label": "证书类型" }, certBtns),
    el("div", { class: "ca-grid" }, [tree, detail]),
    el("p", { class: "w-caption", text: "示意：名字、序列号、日期为虚构示例；SPKI 的字节数是真实的 DER 编码长度。带圆点的字段在服务端证书和客户端证书里取值不同。" }));
  render();
}

export const widgets = { "tls-auth": mountTlsAuth, "cert-anatomy": mountCertAnatomy };
