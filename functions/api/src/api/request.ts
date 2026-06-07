/**
 * NeteaseCloudMusicApi — Cloudflare Worker 请求层
 *
 * 原版: axios + Node http/https + tunnel
 * 本版: 原生 fetch API (Workers 原生支持)
 */

import { weapi, linuxapi, eapi, eapiResDecrypt } from '../crypto/netease'

const APP_CONF = {
  ios: {
    os: 'iOS',
    appver: '8.10.42',
    osver: '16.2',
    buildver: '241016162026',
  },
  pc: {
    os: 'pc',
    appver: '3.1.17.204416',
    osver: 'Microsoft Windows 10',
    buildver: '204416',
  },
  android: {
    os: 'android',
    appver: '8.10.42',
    osver: '14',
    buildver: '241016162026',
  },
}

interface RequestConfig {
  crypto: 'weapi' | 'linuxapi' | 'eapi'
  cookie: Record<string, string> | string
  ua?: string
  proxy?: string
  realIP?: string
  e_r?: boolean
  domain?: string
  checkToken?: boolean
}

interface RequestResult {
  status: number
  body: any
  cookie?: string[]
}

const NETEASE_BASE = 'https://music.163.com'
const NETEASE_API_BASE = 'https://interface.music.163.com'
const NETEASE_EAPI = 'https://interface.music.163.com/eapi'

let anonymousToken = ''

/**
 * 生成随机中文 IP (用于匿名请求)
 */
function generateRandomChineseIP(): string {
  const ranges = [
    [110, 111], [112, 113], [114, 115], [116, 117],
    [120, 121], [122, 123], [180, 181], [182, 183],
    [202, 203], [210, 211], [218, 219], [220, 221],
    [222, 223], [36, 37], [39, 42], [49, 50],
    [58, 61], [106, 107], [117, 118], [119, 120],
    [124, 125], [171, 172], [175, 176], [211, 212],
  ]
  const [start] = ranges[Math.floor(Math.random() * ranges.length)]
  return `${start}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
}

/**
 * Cookie 对象转字符串
 */
function cookieObjToString(cookie: Record<string, string>): string {
  return Object.entries(cookie).map(([k, v]) => `${k}=${v}`).join('; ')
}

/**
 * Cookie 字符串转对象
 */
function cookieStringToJson(cookie: string): Record<string, string> {
  const obj: Record<string, string> = {}
  cookie.split(';').forEach(pair => {
    const eq = pair.indexOf('=')
    if (eq < 1) return
    const key = pair.slice(0, eq).trim()
    const val = pair.slice(eq + 1).trim()
    obj[key] = val
  })
  return obj
}

/**
 * 发起网易云 API 请求 (fetch 版)
 */
export async function neteaseRequest(
  url: string,
  data: Record<string, any>,
  config: RequestConfig
): Promise<RequestResult> {
  const ip = config.realIP || generateRandomChineseIP()
  let cookie: Record<string, string> = {}

  if (typeof config.cookie === 'string') {
    cookie = cookieStringToJson(config.cookie)
  } else {
    cookie = { ...config.cookie }
  }

  // 添加匿名 token
  if (!cookie['MUSIC_A'] && anonymousToken) {
    cookie['MUSIC_A'] = anonymousToken
  }

  // WNMCID
  if (!cookie['__csrf']) {
    const chars = 'abcdefghijklmnopqrstuvwxyz'
    let wnmcid = ''
    for (let i = 0; i < 6; i++) wnmcid += chars[Math.floor(Math.random() * 26)]
    cookie['__csrf'] = `${wnmcid}.${Date.now()}.01.0`
  }

  const csrfToken = cookie['__csrf'] || ''

  const osConf = APP_CONF.pc

  let targetUrl = url
  let method = 'POST'
  let bodyData: string | URLSearchParams | null = null
  let headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': cookieObjToString(cookie),
    'X-Real-IP': ip,
    'X-Forwarded-For': ip,
  }

  if (config.crypto === 'weapi') {
    headers['Referer'] = config.domain || NETEASE_BASE
    headers['User-Agent'] = config.ua || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'
    data.csrf_token = csrfToken
    const encrypted = await weapi(data)
    bodyData = new URLSearchParams({
      params: encrypted.params,
      encSecKey: encrypted.encSecKey,
    }).toString()
    targetUrl = `${config.domain || NETEASE_BASE}/weapi${url.replace('/api', '')}`
  } else if (config.crypto === 'linuxapi') {
    headers['User-Agent'] = config.ua || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36'
    const encrypted = await linuxapi(data)
    bodyData = new URLSearchParams({ eparams: encrypted.eparams }).toString()
    targetUrl = `${config.domain || NETEASE_BASE}/api/linux/forward`
  } else if (config.crypto === 'eapi') {
    // eapi 需要构造 header 对象并嵌入到加密数据中
    const now = Date.now()
    const eapiHeader: Record<string, string> = {
      osver: cookie.osver || osConf.osver,
      deviceId: cookie.deviceId || '',
      os: cookie.os || osConf.os,
      appver: cookie.appver || osConf.appver,
      versioncode: cookie.versioncode || '140',
      mobilename: cookie.mobilename || '',
      buildver: cookie.buildver || String(now).substring(0, 10),
      resolution: cookie.resolution || '1920x1080',
      __csrf: csrfToken,
      channel: cookie.channel || '',
      requestId: `${now}_${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
    }
    if (cookie.MUSIC_U) eapiHeader['MUSIC_U'] = cookie.MUSIC_U
    if (cookie.MUSIC_A) eapiHeader['MUSIC_A'] = cookie.MUSIC_A

    // header → Cookie header
    const headerCookie = Object.entries(eapiHeader)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('; ')
    headers['Cookie'] = headerCookie
    headers['User-Agent'] = config.ua || `NeteaseMusic/${osConf.appver}/${osConf.buildver}/${osConf.os}/${osConf.osver}`

    // eapi 加密需要把 header 和 e_r 包含在 data 中
    data.header = eapiHeader
    data.e_r = config.e_r !== undefined ? config.e_r : true

    const encrypted = await eapi(url, data)
    bodyData = new URLSearchParams({ params: encrypted.params }).toString()
    targetUrl = `${config.domain || NETEASE_API_BASE}/eapi${url.replace('/api', '')}`
  }

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: bodyData,
    })

    const setCookies = response.headers.getAll?.('set-cookie') ||
                       (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : [])

    let body: any
    const contentType = response.headers.get('content-type') || ''

    if (config.crypto === 'eapi' && response.ok) {
      const text = await response.text()
      try {
        body = JSON.parse(text)
      } catch {
        // 尝试 eapi 解密
        try {
          body = await eapiResDecrypt(text)
        } catch {
          body = { code: 200, data: text }
        }
      }
    } else {
      try {
        body = await response.json()
      } catch {
        body = { code: response.status, data: await response.text() }
      }
    }

    return {
      status: response.status,
      body,
      cookie: setCookies,
    }
  } catch (err: any) {
    throw {
      status: 502,
      body: { code: 502, msg: 'Request failed', detail: err.message },
    }
  }
}

/**
 * 工厂函数：创建绑定了 cookie/ip 的 request 函数
 */
export function createRequestFactory(defaultConfig: {
  cookie?: Record<string, string>
  realIP?: string
  ua?: string
}) {
  return (url: string, data: Record<string, any>, config?: Partial<RequestConfig>) => {
    return neteaseRequest(url, data, {
      crypto: 'weapi',
      cookie: defaultConfig.cookie || {},
      ua: defaultConfig.ua,
      realIP: defaultConfig.realIP,
      e_r: true,
      domain: '',
      checkToken: false,
      ...config,
    })
  }
}
