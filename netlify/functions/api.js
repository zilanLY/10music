/**
 * Netlify Serverless Function — 10music 专用 API
 * 
 * 只实现 10music 应用必需的核心 API
 * 使用 Node.js crypto 模块实现网易云音乐加密算法
 */

const crypto = require('crypto')

// ── 加密工具 ─────────────────────────────────────────────────────

// 网易云音乐 weapi 加密
function encryptWeapi(data) {
  const text = JSON.stringify(data)
  const secretKey = Buffer.from('0CoJUm6Qyw8W8jud', 'utf8')
  const iv = Buffer.from('0102030405060708', 'utf8')
  
  // AES-128-CBC 加密
  const cipher = crypto.createCipheriv('aes-128-cbc', secretKey, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  // RSA 加密（简化版，使用固定的 encSecKey）
  const modulus = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'
  const pubKey = Buffer.from(modulus, 'hex')
  
  // 简化：直接返回加密后的 params 和固定的 encSecKey
  return {
    params: encrypted,
    encSecKey: 'b3317b6f66e2b1b359639301602febb11c565895995622f44067c049606118a2c5bf71db9b1d22b555621c1c3a035bed560d87a3804f1cb184b76e8a5e269b2b58ad2bf534a25bf7d3da2b73c894ac7aac8751347bc833a712631131eb78fdd141d3881af8c913ez044d1298d3bb8b52fdfcbf02823d97453bbf49d3ba4c727f8b8b7f2b7494b493td87352a028ad2e1dd7e86897fc9b51b5e77f8cee5c4c3c16cbf tunez1bf151bcd9b7c3e489ce4af27d4f0187e6fa7c3c80fdc0a8c41e7b7699f4df14f1b73eb49120d7e5c1e0e93c86b432d65db9f4546e6ffafea693ea3b0a0a3111e35738c17bb0e86b4c8a1e5f05508b8071ec0ebc2ez50e33242c84ebcfd697bc34fd8256f572eeff139c69f967a13a05561f4e5938a5c57eec34c5e36a3a1dd41afd952d0975a8e2f',
  }
}

// 创建请求
async function createRequest(endpoint, data) {
  const url = `https://music.163.com${endpoint}`
  
  const encrypted = encryptWeapi(data)
  const body = `params=${encodeURIComponent(encrypted.params)}&encSecKey=${encodeURIComponent(encrypted.encSecKey)}`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://music.163.com/',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body,
  })
  
  return await response.json()
}

// ── API 路由 ─────────────────────────────────────────────────────
const routes = {
  '/search/default': async (query) => {
    const data = await createRequest('/weapi/search/defaultkeyword/get', {})
    return { status: 200, body: data }
  },
  
  '/cloudsearch': async (query) => {
    const data = await createRequest('/weapi/cloudsearch/pc', {
      s: query.keywords || '',
      limit: query.limit || 30,
      offset: query.offset || 0,
      type: query.type || 1,
    })
    return { status: 200, body: data }
  },
  
  '/recommend/songs': async (query) => {
    const data = await createRequest('/weapi/v1/discovery/recommend/songs', {
      limit: query.limit || 20,
    })
    return { status: 200, body: data }
  },
  
  '/personalized': async (query) => {
    const data = await createRequest('/weapi/personalized/playlist', {
      limit: query.limit || 30,
      offset: query.offset || 0,
    })
    return { status: 200, body: data }
  },
  
  '/personalized/newsong': async (query) => {
    const data = await createRequest('/weapi/personalized/newsong', {
      limit: query.limit || 10,
    })
    return { status: 200, body: data }
  },
  
  '/top/artists': async (query) => {
    const data = await createRequest('/weapi/artist/top', {
      limit: query.limit || 30,
      offset: query.offset || 0,
    })
    return { status: 200, body: data }
  },
  
  '/top/album': async (query) => {
    const data = await createRequest('/weapi/album/top', {
      limit: query.limit || 20,
      offset: query.offset || 0,
    })
    return { status: 200, body: data }
  },
  
  '/song/detail': async (query) => {
    const ids = query.ids ? (Array.isArray(query.ids) ? query.ids : [query.ids]) : []
    const data = await createRequest('/weapi/v3/song/detail', {
      c: JSON.stringify(ids.map(id => ({ id }))),
    })
    return { status: 200, body: data }
  },
  
  '/song/url': async (query) => {
    const id = query.id
    const data = await createRequest('/weapi/song/enhance/player/url', {
      ids: [id],
      br: query.br || 999000,
    })
    return { status: 200, body: data }
  },
}

// ── Netlify Function 入口 ──────────────────────────────────────────
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  // CORS 预检
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  // 解析路径
  const apiPath = (event.path || '/').replace(/^\/api/, '')
  
  // 查找路由
  const route = routes[apiPath]
  if (!route) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        code: 404,
        msg: 'API not found: ' + apiPath,
        available: Object.keys(routes),
      }),
    }
  }

  try {
    // 合并 query + body
    const query = { ...(event.queryStringParameters || {}) }
    if (event.body) {
      try {
        Object.assign(query, JSON.parse(event.body))
      } catch (_) {}
    }
    
    const result = await route(query)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.body),
    }
  } catch (err) {
    console.error('API Error:', err)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ code: 500, msg: err.message }),
    }
  }
}
