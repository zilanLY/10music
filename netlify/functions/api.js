/**
 * Netlify Serverless Function — 基于 api-enhanced 全部模块
 *
 * 和 Vercel 的 api/index.js 完全一致的逻辑：
 * 动态加载 ncm-api/module/ 下所有模块，根据请求路径匹配并调用。
 */

const fs = require('fs')
const path = require('path')

// ── 初始化 global.deviceId（必须在使用 request.js 之前设置）──────
const { generateDeviceId } = require('./ncm-api/util/index')
global.deviceId = generateDeviceId()

// ── 延迟加载 createRequest（首次请求时才 require，避免冷启动时阻塞）──
let _createRequest = null
function getCreateRequest() {
  if (!_createRequest) {
    _createRequest = require('./ncm-api/util/request.js')
  }
  return _createRequest
}

// ── 加载所有模块 ──────────────────────────────────────────────────────
const modules = {}
const modulesPath = path.join(__dirname, 'ncm-api', 'module')

fs.readdirSync(modulesPath).forEach(file => {
  if (!file.endsWith('.js')) return
  const name = file.slice(0, -3) // 去掉 .js
  // 下划线 → 斜杠（song_detail.js → song/detail）
  const route = name.replace(/_/g, '/')
  modules['/' + route] = require(path.join(modulesPath, file))
})

console.log(`[netlify] 已加载 ${Object.keys(modules).length} 个 API 模块`)

// ── Cookie 解析 ───────────────────────────────────────────────────────
function parseCookie(cookieStr) {
  if (!cookieStr) return {}
  const obj = {}
  cookieStr.split(';').forEach(pair => {
    const eq = pair.indexOf('=')
    if (eq < 1) return
    obj[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  })
  return obj
}

// ── Netlify Function 入口 ──────────────────────────────────────────
exports.handler = async (event, context) => {
  console.log('[netlify-fn] invoked:', event.httpMethod, event.path)

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    'Content-Type': 'application/json',
  }

  // CORS 预检
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  // 解析路径：/.netlify/functions/api/search/default → /search/default
  let apiPath = event.path || event.rawPath || '/'
  // 移除可能的函数路径前缀
  apiPath = apiPath.replace(/^\/\.netlify\/functions\/api/, '')
  apiPath = apiPath.replace(/^\/api/, '')

  console.log('[netlify-fn] apiPath:', apiPath, '| modules loaded:', Object.keys(modules).length)

  // 查找模块
  const mod = modules[apiPath]
  if (!mod) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        code: 404,
        msg: 'API not found: ' + apiPath,
        total: Object.keys(modules).length,
      }),
    }
  }

  try {
    // 合并 query + body 作为 query 参数传给模块
    const query = { ...(event.queryStringParameters || {}) }
    if (event.body) {
      try {
        Object.assign(query, JSON.parse(event.body))
      } catch (_) {
        // body 不是 JSON，尝试 form-urlencoded
        const pairs = event.body.split('&')
        for (const pair of pairs) {
          const eq = pair.indexOf('=')
          if (eq < 1) continue
          query[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1))
        }
      }
    }
    // 传递 Cookie
    query.cookie = parseCookie(
      event.headers?.cookie || event.headers?.Cookie || ''
    )

    const createRequest = getCreateRequest()
    const result = await mod(query, createRequest)
    const body = result.body || result
    const status = result.status || 200

    // 处理 Set-Cookie（如果模块返回了 cookie）
    if (result.cookie && result.cookie.length > 0) {
      headers['Set-Cookie'] = result.cookie
    }

    return {
      statusCode: status >= 100 && status < 600 ? status : 200,
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }
  } catch (err) {
    const body = err.body || {}
    const status = err.status || 500
    return {
      statusCode: status >= 100 && status < 600 ? status : 200,
      headers,
      body: JSON.stringify(body.code ? body : { code: status, msg: err.message || 'Internal error' }),
    }
  }
}
