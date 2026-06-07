/**
 * Cloudflare Pages Functions — API 入口（api-enhanced 模块版）
 *
 * 使用 build-ncm-modules.js 生成的 ncm-modules.ts
 * 动态加载 399 个 api-enhanced 模块。
 */

import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

import modules from './ncm-modules.js'
import { createRequest } from './src/createRequest.js'

type Env = {
  MUSIC_CACHE?: KVNamespace
}

const app = new Hono<{ Bindings: Env }>()

// ── CORS ─────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-All-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Cookie, X-Requested-With')
  c.header('Access-Control-Expose-Headers', 'Set-Cookie')
  if (c.req.method === 'OPTIONS') return c.text('', 204)
  await next()
})

// ── 解析 Cookie ───────────────────────────────────────────────
function parseCookie(cookieStr: string): Record<string, string> {
  if (!cookieStr) return {}
  const obj: Record<string, string> = {}
  cookieStr.split(';').forEach(pair => {
    const eq = pair.indexOf('=')
    if (eq < 1) return
    obj[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  })
  return obj
}

// ── 通用 API 路由 ───────────────────────────────────────────
app.all('/api/*', async (c) => {
  const pathname = new URL(c.req.url).pathname  // e.g. /api/song/detail
  // 去掉 /api 前缀，匹配 modules 的 key（如 /song/detail）
  const route = pathname.replace(/^\/api/, '') || '/'

  const mod = (modules as Record<string, any>)[route]
  if (!mod) {
    return c.json({ code: 404, msg: `API not found: ${route}` }, 404)
  }

  try {
    // 构造 query（合并 URL 参数 和 body）
    const query: Record<string, any> = {}
    const url = new URL(c.req.url)
    url.searchParams.forEach((v, k) => { query[k] = v })
    if (c.req.method !== 'GET') {
      try {
        const body = await c.req.json()
        Object.assign(query, body)
      } catch {}
    }
    // 注入 Cookie
    query.cookie = parseCookie(c.req.header('cookie') || '')

    // 调用 api-enhanced 模块（传入 query + request 函数）
    const result = await mod(query, createRequest)
    return c.json(result.body || result, result.status || 200)
  } catch (err: any) {
    const body = err.body || {}
    const status = err.status || 500
    return c.json(body, status === 200 ? (body.code || 200) : status)
  }
})

// ── 健康检查 ─────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', runtime: 'cloudflare-pages-functions', version: '2.0.0' })
})

// Pages Functions 导出
export const onRequest = handle(app)
