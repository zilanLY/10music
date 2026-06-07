# 🎵 10Music Player — Serverless Edition

> 基于 [AlgerMusicPlayer](https://github.com/algerkong/AlgerMusicPlayer) 二次改造的 **Serverless 云原生音乐播放器**  
> 移除 Electron 依赖，内置网易云 API + UNM 灰歌解锁，支持 Cloudflare Workers + Pages 和 Vercel 双平台一键部署。

---

## ✨ 核心特性

- **🎶 全功能播放器** — 基于 Howler.js，支持逐字歌词、均衡器、心动模式
- **🔓 灰歌解锁** — 内置 UNM (UnblockNeteaseMusic) 多平台音源（酷我/酷狗/咪咕/B站）
- **☁️ 零服务端** — 纯前端 + API Proxy，可部署在任意静态托管平台
- **🌐 跨平台** — 支持桌面浏览器、移动端响应式
- **🎨 精美 UI** — naive-ui + Tailwind CSS，暗色/亮色主题切换
- **🌍 国际化** — 多语言支持
- **⚡ Cloudflare Workers** — 极致边缘计算，全球 CDN 加速

---

## 🚀 一键部署

### [![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/zilanLY/10music) Vercel 一键部署

Vercel 部署采用 **Serverless Function** 模式，`api/` 目录作为 Node.js 端点，无需额外配置。

---

### [![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-f38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/pages/new/connect) Cloudflare Pages 部署

Cloudflare 部署采用 **Workers (API) + Pages (前端)** 架构，全球 300+ 节点边缘计算，冷启动 <5ms。

> **注意**：Cloudflare 部署需要两步（先部署 Worker API，再部署 Pages 前端），请按下方步骤操作。

#### 步骤 1：部署 API Worker

```bash
cd worker && npm install && npx wrangler login && npx wrangler deploy
# 记录输出的 Worker URL，例如: https://music-api-worker.your-subdomain.workers.dev
```

#### 步骤 2：部署前端到 Pages

```bash
cd ..
VITE_API=https://music-api-worker.your-subdomain.workers.dev \
VITE_API_TARGET=https://music-api-worker.your-subdomain.workers.dev \
npm run build:web
npx wrangler pages deploy dist --project-name=10music
```

#### 架构

```
用户浏览器
    │
    ├── 静态资源 (JS/CSS/HTML) ──► Cloudflare Pages (全球 CDN)
    │
    └── /api/* ──────────────► Cloudflare Worker (边缘计算)
                                      │
                                      ├── Web Crypto API (网易云加密)
                                      ├── fetch (HTTP 请求)
                                      ├── UNM 解锁 (酷我/酷狗/咪咕/B站)
                                      └── KV 缓存 (可选)
```

---

#### 平台对比

| 特性 | Cloudflare | Vercel |
|------|-----------|--------|
| 全球节点 | 300+ | 100+ |
| 冷启动 | <5ms | 100-500ms |
| 免费额度 | 10万请求/天 | 10万请求/月 |
| 缓存 | KV (全球同步) | 内存 (无持久化) |
| 部署方式 | Worker + Pages | Serverless Function |

---

## 💻 本地开发

```bash
# 安装依赖
npm install

# 方式一：前端 + Node.js API 服务器
npm run dev:full
# 前端 :2389 → API :8080

# 方式二：前端 + Cloudflare Worker 本地模拟
cd worker && npm install && npx wrangler dev
# Worker API :8787 → 前端 :2389
```

### 环境变量

| 变量 | 位置 | 说明 |
|------|------|------|
| `VITE_API` | `.env.development` | API 地址 (默认 `http://localhost:8080`) |
| `VITE_API_TARGET` | `.env.development` | Vite 代理目标 |
| `VITE_API_MUSIC` | `.env.development` | 解锁接口地址 |

---

## 🔌 API 架构

### Cloudflare Workers 版（推荐）

```
前端 (Cloudflare Pages)
      │
      ├─ /api/* ──► Worker (Hono + Web Crypto + fetch)
      │                   │
      │                   ├─ weapi/eapi 加密 (Web Crypto API)
      │                   ├─ VIP 多音质 fallback (6层降级)
      │                   ├─ UNM 解锁 (酷我/酷狗/咪咕/B站)
      │                   └─ KV 缓存 (可选)
      │
      └─ 静态资源 ──► Cloudflare CDN
```

### Node.js 版（Vercel）

```
前端 (Vite / dist/)
      │
      ├─ /api/* ──► Express API (:8080)
      │                   │
      │                   ├─ NeteaseCloudMusicApi (200+ 接口)
      │                   ├─ UNM 解锁 (Node.js 原生)
      │                   └─ VIP 多音质 fallback
      │
      └─ /unblock (POST) ──► UNM providers
```

### 灰歌解锁流程

```
当官方 API 返回 url=null（无版权/VIP）时：
1. VIP Fallback: 自动尝试 download API (多音质 hifi → high → low)
2. UNM 解锁: 通过 POST /api/unblock 传入歌曲元数据
3. 第三方解析: musicParser.ts 内置 LxMusic/Custom/GDMusic/UnblockMusic 四层策略
```

---

## 🗑️ 移除的功能（相对于原版 Electron 版）

| 功能 | 原因 | 替代 |
|------|------|------|
| 全局快捷键 | Web 不支持 | — |
| 桌面歌词 | Web 不支持 | — |
| 系统托盘 | Web 不支持 | — |
| 磁盘缓存 | Web 不需要 | IndexedDB / localStorage |
| 自动更新 | Web 不需要 | PWA Service Worker |
| 本地文件播放 | Web 限制 | — |

---

## 📁 项目结构

```
10music/
├── worker/               # Cloudflare Worker API
│   ├── src/
│   │   ├── index.ts      # Hono 入口 + 路由
│   │   ├── api/
│   │   │   ├── request.ts    # fetch 请求层
│   │   │   └── netease.ts    # 核心 API 模块
│   │   ├── crypto/
│   │   │   └── netease.ts    # Web Crypto 加密
│   │   └── provider/
│   │       └── unm.ts        # UNM 解锁 (fetch 版)
│   ├── wrangler.toml     # Workers 配置
│   └── package.json
├── api/                  # Vercel Serverless Functions
│   └── index.js          # API 入口
├── src/
│   ├── renderer/         # Vue 3 前端应用
│   │   ├── api/          # HTTP 请求封装
│   │   ├── components/   # Vue 组件
│   │   ├── hooks/        # 组合式函数
│   │   ├── store/        # Pinia 状态管理
│   │   ├── utils/        # 工具函数
│   │   └── views/        # 页面视图
│   ├── shared/           # 共享类型定义
│   └── i18n/             # 国际化
├── server.js             # Node.js 全功能服务器（本地开发用）
├── vite.config.ts        # Vite 配置
├── vercel.json           # Vercel 部署配置
└── package.json          # 依赖管理
```

---

## 🔧 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite 6 |
| UI | naive-ui + Tailwind CSS |
| 状态管理 | Pinia |
| 播放引擎 | Howler.js |
| API (Node) | NeteaseCloudMusicApi + UNM |
| API (Worker) | Hono + Web Crypto + fetch |
| 解锁 (Node) | UNM (`@unblockneteasemusic/server`) |
| 解锁 (Worker) | 纯 fetch 实现（酷我/酷狗/咪咕/B站） |
| 部署 | Cloudflare / Vercel |

---

## ⚡ Cloudflare Workers vs Node.js 版本对比

| 维度 | Workers 版 | Node.js 版 |
|------|-----------|------------|
| 加密 | Web Crypto API | crypto-js + node-forge |
| HTTP | 原生 fetch | axios |
| 路由 | Hono | Express |
| 代理 | 不支持 | tunnel/pac-proxy-agent |
| 缓存 | KV (全球) | 内存 |
| API 模块 | 40+ 常用接口 | 200+ 全量接口 |
| 冷启动 | <5ms | 1-3s |
| 依赖大小 | <2MB | ~80MB (node_modules) |

---

## 📝 许可

基于原项目 MIT License 发布。

---

*改造维护: [Senior Developer](mailto:dev@example.com)*
