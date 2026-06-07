/**
 * Netlify Serverless Function — 基于 api-enhanced 全部模块
 *
 * 使用构建时生成的 _modules.js（静态 require 索引），
 * 让 esbuild 能正确 trace 所有 399 个模块依赖。
 */

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

// ── 加载所有模块（构建时生成的静态索引）────────────────────────────
const modules = require('./_modules')

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
    // 合并 query + body
    const query = { ...(event.queryStringParameters || {}) }
    if (event.body) {
      try {
        Object.assign(query, JSON.parse(event.body))
      } catch (_) {
        const pairs = event.body.split('&')
        for (const pair of pairs) {
          const eq = pair.indexOf('=')
          if (eq < 1) continue
          query[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1))
        }
      }
    }
    query.cookie = parseCookie(
      event.headers?.cookie || event.headers?.Cookie || ''
    )

    const createRequest = getCreateRequest()
    const result = await mod(query, createRequest)
    const body = result.body || result
    const status = result.status || 200

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
