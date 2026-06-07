/**
 * createRequest — Cloudflare Workers 兼容版
 *
 * 对标 api-enhanced 的 util/request.js → createRequest(uri, data, options)
 * 使用 fetch + netease.ts 中的加密函数
 * 返回 { body, status }
 */

import {
  weapi,
  eapi,
  linuxapi,
  eapiResDecrypt,
  decrypt as eapiDecrypt,
} from './crypto/netease.js'

// ── 常量 ─────────────────────────────────────────────────────
const WEBAPI_DOMAIN = 'https://music.163.com'
const EAPI_DOMAIN   = 'https://interface.music.163.com'

// ── 辅助：将 object 编码为 URLSearchParams ─────────────────
function toUrlParams(obj: Record<string, any>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    sp.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  return sp.toString()
}

// ── 辅助：合并 Cookie 对象 → 字符串 ─────────────────────
function cookieObjToString(cookie: Record<string, string>): string {
  return Object.entries(cookie || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

// ── 辅助：生成匿名 token（简易版）────────────────────
let _anonymousToken: string | null = null
function getAnonymousToken(): string {
  if (_anonymousToken) return _anonymousToken
  // 生成一个简单匿名 token（原版会从文件读取，这里简化）
  _anonymousToken = 'MUSIC_A_' + Math.random().toString(36).slice(2, 15)
  return _anonymousToken
}

// ── 主函数 ─────────────────────────────────────────────────
export async function createRequest(
  uri: string,
  data: Record<string, any>,
  options: {
    crypto?: string
    cookie?: Record<string, string> | string
    headers?: Record<string, string>
    realIP?: string
    ua?: string
    e_r?: boolean
    [key: string]: any
  } = {},
): Promise<{ body: any; status: number }> {
  const cryptoType = (options.crypto || 'weapi').toLowerCase()
  const cookieObj: Record<string, string> =
    typeof options.cookie === 'string'
      ? Object.fromEntries(options.cookie.split('; ').map(c => c.split('=')))
      : (options.cookie || {})

  // 确保有 MUSIC_A（匿名 token）
  if (!cookieObj.MUSIC_A) {
    cookieObj.MUSIC_A = getAnonymousToken()
  }

  // ── 根据 cryptoType 加密 + 构造请求 ─────────────────
  let url: string
  let body: string
  let headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': options.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://music.163.com/',
    'Cookie': cookieObjToString(cookieObj),
    ...(options.headers || {}),
  }

  switch (cryptoType) {
    case 'weapi': {
      const encrypted = weapi(data)
      url = `${WEBAPI_DOMAIN}/weapi${uri}`
      body = toUrlParams(encrypted)
      break
    }

    case 'eapi': {
      const encrypted = eapi(uri, data)
      url = `${EAPI_DOMAIN}/eapi${uri}`
      body = toUrlParams(encrypted)
      // eapi 需要额外的 header
      headers['X-Forwarded-For'] = options.realIP || '127.0.0.1'
      break
    }

    case 'linuxapi': {
      const encrypted = linuxapi(data)
      url = `${WEBAPI_DOMAIN}/api/linux/forward`
      body = toUrlParams(encrypted)
      headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64)'
      break
    }

    default: {
      // 无加密（直接发）
      url = `${WEBAPI_DOMAIN}${uri}`
      body = toUrlParams(data)
      break
    }
  }

  // ── 发送请求 ─────────────────────────────────────────────
  const fetchOpts: RequestInit = {
    method: 'POST',
    headers,
    body,
  }

  const resp = await fetch(url, fetchOpts)

  // ── 处理响应 ──────────────────────────────────────────
  let bodyData: any
  let status = resp.status

  if (options.e_r) {
    // e_r 模式：响应是加密的，需要解密
    const arrayBuf = await resp.arrayBuffer()
    const hex = Array.from(new Uint8Array(arrayBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    bodyData = eapiResDecrypt(hex)
  } else {
    const text = await resp.text()
    try {
      bodyData = JSON.parse(text)
    } catch {
      bodyData = { code: 200, data: text }
    }
  }

  // 特殊状态码处理（同 api-enhanced）
  const SPECIAL_CODES = new Set([201, 302, 400, 502])
  if (bodyData.code && SPECIAL_CODES.has(bodyData.code)) {
    status = 200
  }

  return {
    body: bodyData,
    status: bodyData.code || status,
  }
}
