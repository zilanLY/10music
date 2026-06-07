/**
 * Vercel Serverless Function — 基于 api-enhanced 模块
 * 
 * 加载 server/ncm-api/module/ 下所有模块，
 * 根据请求路径匹配模块，调用 (query, createRequest) 返回结果。
 */

const fs = require('fs')
const path = require('path')

// ── 初始化 global.deviceId（必须在使用 request.js 之前设置）──────
const { generateDeviceId, cookieToJson } = require('../server/ncm-api/util/index')
global.deviceId = generateDeviceId()

// ── 延迟加载 createRequest ──────────────────────────────────────────
let _createRequest = null
function getCreateRequest() {
  if (!_createRequest) {
    _createRequest = require('../server/ncm-api/util/request.js')
  }
  return _createRequest
}

// ── 加载所有模块 ──────────────────────────────────────────────────────
const modules = {}
const modulesPath = path.join(__dirname, '../server/ncm-api/module/')

fs.readdirSync(modulesPath).forEach(file => {
  if (!file.endsWith('.js')) return
  const name = file.slice(0, -3)
  const route = name.replace(/_/g, '/')
  modules['/' + route] = require(path.join(modulesPath, file))
})

// ── CORS ──────────────────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie, X-Requested-With')
  res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie')
}

// ── 解析 Cookie ───────────────────────────────────────────────────────
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

// ── Vercel Node.js Serverless 入口 ─────────────────────────────────
module.exports = async (req, res) => {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  const mod = modules[pathname]
  if (!mod) {
    return res.status(200).json({ code: 404, msg: 'API not found: ' + pathname })
  }

  try {
    // 合并 query + body 作为 query 参数传给模块
    const query = { ...Object.fromEntries(url.searchParams) }
    if (req.method !== 'GET' && req.body) {
      Object.assign(query, req.body)
    }
    // 传递 Cookie
    query.cookie = parseCookie(req.headers.cookie)

    const createRequest = getCreateRequest()
    const result = await mod(query, createRequest)
    res.status(result.status || 200).json(result.body || result)
  } catch (err) {
    const body = err.body || {}
    const status = err.status || 500
    res.status(status === 200 ? (body.code || 200) : status).json(body)
  }
}
