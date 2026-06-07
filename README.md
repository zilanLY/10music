# 🎵 10Music Player — Serverless Edition

> 基于 [AlgerMusicPlayer](https://github.com/algerkong/AlgerMusicPlayer) 二次改造的 **Serverless 云原声音乐播放器**  
> 移除 Electron 依赖，内置网易云 API + UNM 灰歌解锁，可部署到 Vercel / LeapCell。

---

## ✨ 核心特性

- **🎶 全功能播放器** — 基于 Howler.js，支持逐字歌词、均衡器、心动模式
- **🔓 灰歌解锁** — 内置 UNM (UnblockNeteaseMusic) 多平台音源（酷我/酷狗/咪咕/B站）
- **☁️ 零服务端** — 纯前端 + API Proxy，可部署在任意静态托管平台
- **🌐 跨平台** — 支持桌面浏览器、移动端响应式
- **🎨 精美 UI** — naive-ui + Tailwind CSS，暗色/亮色主题切换
- **🌍 国际化** — 多语言支持

---

## 🚀 部署指南

### 选项一：Vercel 部署（推荐）

Vercel 部署采用 **Serverless Function** 模式，`api/` 目录作为 Node.js 端点。

#### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/zilanLY/10music.git
cd 10music

# 2. 安装依赖
npm install

# 3. 构建 Web 端
npm run build:web

# 4. 部署到 Vercel
# 方案 A：使用 Vercel CLI
npx vercel --prod

# 方案 B：连接 Vercel 仓库自动部署
# 访问 https://vercel.com 导入此仓库
```

#### Vercel 配置说明

`vercel.json` 已经预配置好：

```json
{
  "buildCommand": "npm run build:web",
  "installCommand": "npm install --ignore-scripts",
  "routes": [
    { "src": "/api/(.*)", "dest": "api/$1" },
    { "src": "/(.*)", "dest": "dist/$1" }
  ]
}
```

#### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API` | API 服务器地址 | 构建时内嵌，运行时不需设置 |
| `MUSIC_API_HOST` | 自定义 API 地址（server.js） | 留空则使用内建 NeteaseCloudMusicApi |

---

### 选项二：LeapCell 部署

LeapCell 部署采用 **单一 Node.js 进程** 模式，`server.js` 同时充当 API 服务器和静态文件服务器。

#### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/zilanLY/10music.git
cd 10music

# 2. 安装依赖
npm install

# 3. 构建前端
npm run build:web

# 4. 启动服务
node server.js
# 服务运行在 http://localhost:8080
```

#### LeapCell 平台配置

在 LeapCell 仪表板上：

| 配置项 | 值 |
|--------|-----|
| **启动命令** | `npm run build:web && node server.js` |
| **运行端口** | `8080`（`server.js` 会自动读取 `$PORT` 环境变量） |
| **Node 版本** | `18+` |
| **构建方式** | 自动构建 |

`server.js` 已内置：
- ✅ Express API 服务器（网易云全部接口）
- ✅ UNM 第三方平台灰歌解锁
- ✅ VIP 多音质 fallback
- ✅ 静态文件托管（`dist/` 目录）

#### 本地测试 LeapCell

```bash
npm install
npm run build:web
node server.js
# 访问 http://localhost:8080
```

---

## 💻 本地开发

```bash
# 安装依赖
npm install

# 方式一：仅前端（需要外部 API）
npm run dev:web

# 方式二：前端 + API 服务器
npm run dev:full
# 或者分别启动：
# npm run server &    # API 服务器 :8080
# npm run dev:web     # Vite 前端 :2389
```

### 前端端口
- Vite 开发服务器：`http://localhost:2389`
- API 代理到：`http://localhost:8080`

### 环境变量

| 变量 | 位置 | 默认值 |
|------|------|--------|
| `VITE_API` | `.env.development` | `http://localhost:8080` |
| `VITE_API_MUSIC` | `.env.development` | `http://localhost:8080/unblock` |

---

## 🔌 API 架构

```
用户浏览器 (Vite / dist/)
      │
      ├─ /api/* ──────────────────────────► 本地 API (:8080)
      │                                          │
      │                                     ┌────┴────┐
      │                                     │ UNM 解锁 │ ← 酷我/酷狗/咪咕/B站
      │                                     │ VIP fallback │ ← 6层音质降级
      │                                     │ 网易云 API │ ← NeteaseCloudMusicApi
      │                                     └─────────┘
      │
      └─ /unblock (POST) ─────────────────► API /api/unblock
                                             歌曲元数据 → UNM providers
                                             ← 第三方音源链接
```

### 灰歌解锁流程

```
当官方 API 返回 url=null（无版权/VIP）时：
1. VIP Fallback: 自动尝试 download API (多音质 hifi → high → low)
2. UNM 解锁: 通过 POST /unblock 传入歌曲元数据
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
├── api/                  # Vercel Serverless Functions
│   └── index.js          # API 入口 (VIP fallback + UNM 解锁)
├── dist/                 # 构建输出
├── public/               # 静态资源
├── src/
│   ├── renderer/         # Vue 3 前端应用
│   │   ├── api/          # HTTP 请求封装
│   │   ├── components/   # Vue 组件
│   │   ├── hooks/        # 组合式函数
│   │   ├── store/        # Pinia 状态管理
│   │   ├── utils/        # 工具函数
│   │   ├── views/        # 页面视图
│   │   └── ...
│   ├── shared/           # 共享类型定义
│   └── i18n/             # 国际化
├── server.js             # LeapCell 全功能服务器
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
| API | NeteaseCloudMusicApi (`netease-cloud-music-api-alger`) |
| 解锁 | UNM (`@unblockneteasemusic/server`) |
| 部署 | Vercel / LeapCell |

---

## 📝 许可

基于原项目 MIT License 发布。

---

*改造维护: [Senior Developer](mailto:dev@example.com)*
