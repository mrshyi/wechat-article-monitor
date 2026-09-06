<p align="center">
  <img src="./assets/logo.png" width="300" alt="logo">
</p>

<h1 align="center">wechat-article-monitor</h1>

<p align="center">
  微信公众号文章 / 评论自动化监控与导出工具
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node">
  <img src="https://img.shields.io/badge/Nuxt-3-00DC82.svg" alt="Nuxt 3">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6.svg" alt="TypeScript">
</p>

<p align="center">
  <img src="./assets/screenshots/monitor-dashboard.png" alt="监控面板截图" width="900">
</p>

---

## 简介

`wechat-article-monitor` 是一个 **本地优先 (local-first)**
的微信公众号内容采集与归档工具。所有抓取到的文章、评论、阅读量等数据全部存入浏览器端的 IndexedDB，不依赖任何外部数据库即可长期运行。

它既支持一次性的文章批量导出，也支持：

- **关注一组公众号 → 定时轮询 → 自动入库新文章**
- **对入库文章持续追踪评论变化、记录被屏蔽评论的时间线**
- **通过 mitmproxy 抓包服务自动续期凭据，让监控任务无人值守**

适用场景：

- 长期跟踪若干公众号的更新与评论动态
- 把感兴趣的文章归档为多种格式（HTML / Markdown / DOCX / PDF / Excel / JSON / TXT）
- 团队 / 个人内容研究、舆情观察、合规留档

## 核心特性

### 内容采集与监控

- **公众号订阅与文章发现**：关注列表中的公众号定时轮询，新文章自动入库、自动去重
- **评论持续监控**：对入库文章追踪评论增减，记录每条评论的首次出现时间与被屏蔽时间
- **统一监控面板**：所有监控任务在一个页面管理，调度状态、失败次数、最近一次执行时间一目了然
- **离线可读**：抓取数据本地化存储，断网仍可浏览历史归档

### 多格式批量导出

- **HTML**（打包图片与样式，100% 还原原文排版）
- **Markdown / DOCX / PDF**
- **Excel / JSON / TXT**
- 支持图片消息、视频消息、合集
- 同步导出阅读量、点赞、转发、评论数据

### Credential 抓包服务

- 内置基于 mitmproxy 的本地 Python 服务，自动捕获并下发微信公众平台凭据
- 凭据剩余有效期实时显示在前端顶部条
- 通过 WebSocket 与前端联动 (`server/api/credential/ws.ts`)，过期前主动刷新

### 部署

- Docker 容器化
- Cloudflare Pages 一键部署

## 技术栈

| 层       | 技术                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| 前端     | Nuxt 3 (SPA) · Vue 3 · TypeScript · Nuxt UI · TailwindCSS · AG Grid Enterprise · Monaco Editor |
| 服务端   | Nitro · Puppeteer (PDF) · Cheerio · Turndown                                                   |
| 存储     | Dexie / IndexedDB                                                                              |
| 调度     | p-queue · 自研 Poller / Scheduler                                                              |
| 抓包服务 | Python 3.12+ · mitmproxy                                                                       |
| 工具链   | Biome · Yarn 1.22                                                                              |

## 快速开始

### 环境要求

- Node.js ≥ 22
- Yarn 1.22（通过 corepack 管理）
- Python 3.12+（仅在使用 credential 抓包服务时需要）

### 安装与启动

```bash
corepack enable && corepack prepare yarn@1.22.22 --activate
yarn

cp .env.example .env
yarn dev
```

打开 <http://localhost:3000>，扫码登录公众号后台即可使用。

### Credential 抓包服务（可选）

```bash
cd credential-service
pip install -r requirements.txt
```

服务由 Nuxt 启动时通过 `server/plugins/credential-service.ts` 自动拉起，监听端口由 `CREDENTIAL_MITM_PORT` 控制。

#### macOS 首次使用：信任本机抓包证书

项目需要通过 mitmproxy 解密公众号 HTTPS 流量。**每台电脑都需要信任自己生成的 CA；同一分支不会同步系统钥匙串或证书信任。**
系统代理自动托管和证书自动检测目前仅支持 macOS，其他系统或手机需在实际访问设备上自行配置代理及证书信任。

1. 启动项目，等待抓包服务生成 `~/.mitmproxy/mitmproxy-ca-cert.pem`。项目使用运行用户的 `~/.mitmproxy`
   作为 mitmdump 证书配置目录。
2. 若确认要信任本机抓包 CA，用**运行项目的同一 macOS 用户**打开终端，复制以下**单行命令**执行（需要管理员密码）：

   ```bash
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
   ```

3. 验证系统信任：

   ```bash
   security verify-cert -c "$HOME/.mitmproxy/mitmproxy-ca-cert.pem" -p basic
   ```

   预期显示 `certificate verification successful`。

4. 用
   **⌘Q 完全退出微信和 Chrome**，重新打开。在项目的 Credential 初始化窗口点击「重新检测」，检测通过后「确认并开始抓取」。

**流程保护：**
macOS 下，手动启用及记住授权后的自动启用都会先检查当前本机 CA。证书缺失、未信任或验证失败时，不会接管系统代理或记住新的授权；界面显示原因和手动处理指引。安装信任后需重新检测并确认开启，项目不会自动执行
`sudo`、安装根证书或关闭 TLS 校验。检查针对 CA 的系统基础信任，不替代微信、Chrome 的实际文章加载测试；服务运行期间撤销信任也不会自动恢复已托管的代理，遇到异常请先停止抓取或退出项目。

> 安全提示：这是**系统级根证书信任**，允许持有对应私钥的代理签发受信任的站点证书并解密 HTTPS。只信任自己控制的 CA；不要复制其他电脑的 CA，也不要分享
> `~/.mitmproxy/mitmproxy-ca.pem`（包含私钥）。如果 CA 重新生成，旧证书的信任不适用于新 CA，需要重新确认。不再使用时，可在「钥匙串访问 → 系统」中核对指纹后移除本项目 CA，不要误删其他证书。

#### 常见问题：微信文章反复刷新 / Chrome 证书错误

如果仅在开启项目代理后出现微信文章反复重载，或 Chrome 提示
`NET::ERR_CERT_AUTHORITY_INVALID`，先按上面的命令检查 CA 信任。已验证的一例问题在信任本机 CA、重启微信和 Chrome 后恢复，无需修改代码或关闭 HTTP/2。

- **`CSSMERR_TP_NOT_TRUSTED`**：尚未信任当前 CA；按上述步骤安装并验证。钥匙串中存在同名证书并不能保证它就是当前 CA。
- **证书文件不存在**：先确认抓包服务已成功启动，且终端用户与项目运行用户一致；不要从其他电脑复制证书或删除整个
  `~/.mitmproxy` 目录。
- **`zsh: command not found: -d` / `-k` 或
  `permission denied: ...pem`**：通常是复制多行命令时，反斜杠后带空格导致续行失败。重新复制上面的单行命令，不要用
  `chmod` 修改证书权限。
- **检测失败而非未信任**：执行手动验证命令，检查系统时间、证书有效期和文件可读性，不要盲目添加信任或忽略浏览器证书错误。
- **信任后仍异常**：分别复测 Chrome 和微信中的实际文章，并检查上游代理。不要仅凭首页 `HEAD + HTTP/2`
  错误关闭 HTTP/2：正常电脑也可能出现该错误，而同一地址的 GET 正常。

### 生产构建

```bash
yarn build       # 生产构建（输出到 .output/）
yarn preview     # Cloudflare Pages 模式本地预览
yarn docker:build
```

## 配置

| 环境变量                | 说明                                                                   | 默认值     |
| ----------------------- | ---------------------------------------------------------------------- | ---------- |
| `NUXT_AGGRID_LICENSE`   | AG Grid Enterprise 授权                                                | -          |
| `NITRO_KV_DRIVER`       | 存储驱动（本地/Docker 用 `fs`，Cloudflare 用 `cloudflare-kv-binding`） | `fs`       |
| `NITRO_KV_BASE`         | KV 数据目录                                                            | `.data/kv` |
| `CREDENTIAL_MITM_PORT`  | mitmproxy 监听端口                                                     | `65000`    |
| `NUXT_DEBUG_MP_REQUEST` | 是否打印代理请求日志（仅开发）                                         | `false`    |
| `DEBUG_KEY`             | 调试端点鉴权                                                           | -          |

完整变量见 [`.env.example`](./.env.example)。

## 项目结构

```
.
├── apis/                  客户端 API 封装
├── composables/           Vue 组合式 API（监控、下载、导出）
├── components/dashboard/  仪表盘 UI
├── pages/dashboard/       路由页面（监控面板等）
├── server/api/            Nitro 服务端代理 / credential WebSocket
├── store/v2/              Dexie 数据模型
├── utils/monitor/         调度器与 poller
├── utils/download/        下载与导出核心
├── credential-service/    Python mitmproxy 抓包服务
└── openspec/              规格驱动开发文档
```

## 致谢

- [wechat-article/wechat-article-exporter](https://github.com/wechat-article/wechat-article-exporter)
  — 本项目的起点，原作者 [@Jock](https://github.com/wechat-article)
- [1061700625/WeChat_Article](https://github.com/1061700625/WeChat_Article) — 抓取原理参考

## 许可

[MIT](./LICENSE) © 2024 Jock · 2026 tomczhang

## 免责声明

本工具仅用于公开内容的本地归档与备份。通过本工具获取的微信公众号文章与评论内容，版权归原作者所有，请合理合规使用，严禁用于商业牟利、侵犯他人权益或违反平台规则的行为。

本程序不会利用扫码登录的公众号进行任何形式的私有爬虫，账号仅用于服务使用者本人的内容抓取目的。
