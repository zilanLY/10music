# 🎵 10Music Player — Serverless Edition

> 基于 [AlgerMusicPlayer](https://github.com/algerkong/AlgerMusicPlayer) 二次改造的 **Serverless 云原生音乐播放器**  
> 移除 Electron 依赖，内置网易云 API + UNM 灰歌解锁，支持 Cloudflare Pages / Vercel / Netlify 三平台一键部署。

---

## ✨ 核心特性

- **🎶 全功能播放器** — 基于 Howler.js，支持逐字歌词、均衡器、心动模式
- **🔓 灰歌解锁** — 内置 UNM (UnblockNeteaseMusic) 多平台音源（酷我/酷狗/咪咕/B站）
- **☁️ 零服务端** — 纯前端 + API Proxy，可部署在任意静态托管平台
- **🌐 跨平台** — 支持桌面浏览器、移动端响应式
- **🎨 精美 UI** — naive-ui + Tailwind CSS，暗色/亮色主题切换
- **🌍 国际化** — 多语言支持
- **⚡ Cloudflare Pages Functions** — 极致边缘计算，全球 CDN 加速

---

## 🚀 一键部署

### [![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/zilanLY/10music) Vercel 一键部署

Vercel 部署采用 **Serverless Function** 模式，`api/` 目录作为 Node.js 端点，无需额外配置。

---

### [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/zilanLY/10music) Netlify 一键部署

Netlify 部署采用 **Netlify Functions** 模式，`netlify/functions/` 目录作为 Node.js 端点，无需额外配置。支持一键从 Git 导入自动构建。

---

### [![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-f38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/pages/new/connect) Cloudflare Pages 部署

Cloudflare 部署采用 **Pages Functions** 架构，前端 + API 合一，全球 300+ 节点边缘计算。

> **一键导入**：访问 [Cloudflare Dashboard → Pages](https://dash.cloudflare.com/?to=/:account/pages/new/connect) → **Connect to Git** → 选择 `zilanLY/10music` 仓库 → 完成。

#### 配置说明

| 配置项 | 值 |
|--------|-----|
| **构建命令** | `npm install && npm run build:web` |
| **输出目录** | `dist` |
| **API 路径** | `functions/api/[[path]].ts`（自动识别） |

部署完成后，Pages 会自动托管前端静态资源，Functions 自动处理 `/api/*` 请求。

#### 架构

```
用户浏览器
    │
    ├── 静态资源 (JS/CSS/HTML) ──► Cloudflare Pages CDN
    │
    └── /api/* ──────────────► Pages Functions (边缘计算)
                                      │
                                      ├── Web Crypto API (网易云加密)
                                      ├── fetch (HTTP 请求)
                                      └── UNM 解锁 (酷我/酷狗/咪咕/B站)
```

---

#### 平台对比

| 特性 | Cloudflare | Vercel | Netlify |
|------|-----------|--------|---------|
| 全球节点 | 300+ | 100+ | 100+ |
| 冷启动 | <5ms | 100-500ms | 50-200ms |
| 免费额度 | 10万请求/天 | 10万请求/月 | 12.5万请求/月 |
| 缓存 | KV (全球同步) | 内存 (无持久化) | Edge Config |
| 部署方式 | Worker + Pages | Serverless Function | Netlify Functions |

---

## 💻 本地开发

```bash
# 安装依赖
npm install

# 方式一：前端 + Node.js API 服务器
npm run dev:full
# 前端 :2389 → API :8080

# 方式二：前端 + Cloudflare Pages Functions 本地模拟
npm install && npx wrangler pages dev dist --compatibility-date=2024-12-01
# Pages Functions 自动提供 /api/* 路由
```

### 环境变量

| 变量 | 位置 | 说明 |
|------|------|------|
| `VITE_API` | `.env.development` | API 地址 (默认 `http://localhost:8080`) |
| `VITE_API_TARGET` | `.env.development` | Vite 代理目标 |
| `VITE_API_MUSIC` | `.env.development` | 解锁接口地址 |

---

## 🔌 API 架构

### Cloudflare Pages Functions 版（推荐）

```
前端 (Cloudflare Pages)
      │
      ├─ /api/* ──► Pages Functions (Hono + Web Crypto + fetch)
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
├── worker/               # Cloudflare Worker API（独立部署方案）
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
├── functions/            # Cloudflare Pages Functions (API)
│   └── api/
│       ├── [[path]].ts   # API 路由入口
│       └── src/          # API 源码
├── netlify/              # Netlify Functions (API)
│   └── functions/
│       └── api.ts        # API 路由入口
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
├── netlify.toml          # Netlify 部署配置
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
| API (Cloudflare) | Hono + Web Crypto + fetch (Pages Functions) |
| API (Netlify) | Hono + Node.js crypto + fetch (Netlify Functions) |
| 解锁 (Node) | UNM (`@unblockneteasemusic/server`) |
| 解锁 (Worker) | 纯 fetch 实现（酷我/酷狗/咪咕/B站） |
| 部署 | Cloudflare Pages / Vercel / Netlify |

---

## ⚡ 三平台版本对比

| 维度 | Cloudflare Pages | Vercel | Netlify |
|------|-----------------|--------|---------|
| 运行时 | V8 Isolate (Workers) | Node.js Serverless | Node.js Functions |
| 加密 | Web Crypto API | crypto-js + node-forge | Node.js crypto |
| HTTP | 原生 fetch | axios | 原生 fetch |
| 路由 | Hono | Express | Hono |
| 代理 | 不支持 | tunnel/pac-proxy-agent | 不支持 |
| 缓存 | KV (全球) | 内存 | Edge Config |
| API 模块 | 40+ 常用接口 | 200+ 全量接口 | 40+ 常用接口 |
| 冷启动 | <5ms | 1-3s | 50-200ms |
| 依赖大小 | <2MB | ~80MB | <2MB |

---

## 📝 许可

基于原项目 MIT License 发布。

---

*改造维护: [Senior Developer](mailto:dev@example.com)*
