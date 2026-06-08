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

// ── 音频代理所需模块 ────────────────────────────────────────────
const https = require('https')
const http = require('http')
const { URL } = require('url')
const { PassThrough } = require('stream')

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

  // ── 音频代理路由：绕过 CORS 限制 ────────────────────────────
  if (apiPath === '/audio/proxy') {
    return handleAudioProxy(event, headers)
  }

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
    // Netlify serverless 环境无法访问 interface.music.163.com（eapi 域名），
    // 强制所有请求走 weapi（music.163.com），除非前端显式指定了 crypto
    if (!query.crypto) {
      query.crypto = 'weapi'
    }

    const createRequest = getCreateRequest()
    const result = await mod(query, createRequest)
    const body = result.body || result
    const status = result.status || 200

    // ncm-api 返回的 cookie 是字符串数组，但 Netlify/Lambda 要求
    // headers 字段的值必须是字符串。数组类型的 Set-Cookie 必须
    // 放到 multiValueHeaders 中，否则 Lambda 解码失败返回 502。
    const multiValueHeaders = {}
    if (result.cookie && Array.isArray(result.cookie) && result.cookie.length > 0) {
      multiValueHeaders['Set-Cookie'] = result.cookie
    } else if (result.cookie && typeof result.cookie === 'string') {
      headers['Set-Cookie'] = result.cookie
    }

    return {
      statusCode: status >= 100 && status < 600 ? status : 200,
      headers,
      ...(Object.keys(multiValueHeaders).length > 0 ? { multiValueHeaders } : {}),
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }
  } catch (err) {
    console.error('[netlify-fn] error:', apiPath, err.status, err.message || err)
    const body = err.body || {}
    const status = err.status || 500
    return {
      statusCode: status >= 100 && status < 600 ? status : 200,
      headers,
      body: JSON.stringify(body.code ? body : { code: status, msg: err.message || 'Internal error' }),
    }
  }
}

// ── 音频代理（流式）：将第三方音频 URL 通过服务器转发，添加 CORS 头 ─
// 使用 PassThrough 流式管道：数据一到达就立即推送给浏览器，
// 避免 Netflix Lambda 6MB 缓冲限制和超时问题。
async function handleAudioProxy(event, headers) {
  const targetUrl = event.queryStringParameters?.url
  if (!targetUrl) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ code: 400, msg: 'Missing url parameter' }),
    }
  }

  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch (_) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ code: 400, msg: 'Invalid url parameter' }),
    }
  }

  console.log('[audio-proxy] Proxying:', parsed.host + parsed.pathname)

  const isHttps = parsed.protocol === 'https:'
  const transport = isHttps ? https : http

  const rangeHeader = event.headers?.range || event.headers?.Range
  const reqHeaders = {
    'User-Agent': 'Mozilla/5.0 (compatible; WorkBuddy-Music/1.0)',
    'Accept': '*/*',
  }
  if (rangeHeader) {
    reqHeaders['Range'] = rangeHeader
    console.log('[audio-proxy] Range request:', rangeHeader)
  }

  return new Promise((resolve) => {
    const proxyReq = transport.get(
      parsed.href,
      { headers: reqHeaders, timeout: 25000 },
      (proxyRes) => {
        const statusCode = proxyRes.statusCode
        const contentType = proxyRes.headers['content-type']
        const contentLength = proxyRes.headers['content-length']
        const contentRange = proxyRes.headers['content-range']
        const acceptRanges = proxyRes.headers['accept-ranges']

        console.log('[audio-proxy] Response:', statusCode, contentType, contentLength ? `(${contentLength}B)` : '')

        // 如果上游返回错误，不流式传输
        if (statusCode >= 400) {
          let errorBody = ''
          proxyRes.on('data', (chunk) => { errorBody += chunk.toString() })
          proxyRes.on('end', () => {
            resolve({
              statusCode: 502,
              headers,
              body: JSON.stringify({ code: 502, msg: 'Upstream returned ' + statusCode }),
            })
          })
          proxyRes.on('error', () => {
            resolve({ statusCode: 502, headers, body: JSON.stringify({ code: 502, msg: 'Upstream error' }) })
          })
          return
        }

        // 构建响应头
        const respHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
        }
        if (contentType) respHeaders['Content-Type'] = contentType
        if (contentLength) respHeaders['Content-Length'] = contentLength
        if (contentRange) respHeaders['Content-Range'] = contentRange
        if (acceptRanges) respHeaders['Accept-Ranges'] = acceptRanges

        // ★ 流式管道：创建 PassThrough 并立即 resolve，
        //    然后 pipe 上游数据到 PassThrough
        const passThrough = new PassThrough()

        // 先 resolve（返回带 stream body 的响应）
        resolve({
          statusCode,
          headers: respHeaders,
          body: passThrough,
        })

        // 管道：上游 → PassThrough → 响应
        proxyRes.pipe(passThrough)

        proxyRes.on('error', (err) => {
          console.error('[audio-proxy] Stream error:', err.message)
          passThrough.destroy(err)
        })

        passThrough.on('error', () => {
          // PassThrough 被销毁时清理上游
          if (!proxyRes.destroyed) proxyRes.destroy()
        })
      }
    )

    proxyReq.on('timeout', () => {
      console.error('[audio-proxy] Connection timeout after 25s')
      proxyReq.destroy()
      resolve({
        statusCode: 504,
        headers,
        body: JSON.stringify({ code: 504, msg: 'Audio source timeout' }),
      })
    })

    proxyReq.on('error', (err) => {
      console.error('[audio-proxy] Request error:', err.message)
      resolve({
        statusCode: 502,
        headers,
        body: JSON.stringify({ code: 502, msg: 'Proxy request failed: ' + err.message }),
      })
    })
  })
}
