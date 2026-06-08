/**
 * Netlify-adapted song_url_v1 — uses weapi + inline pyncmd unlock fallback.
 *
 * 策略：
 * - 先请求网易云 weapi 获取官方 URL
 * - 若返回空，调用 pyncmd 解锁 API（music-api.gdstudio.xyz）
 * - pyncmd 返回 Netease CDN HTTPS URL，可直接播放，无需代理
 * - 完全不依赖 @unblockneteasemusic/server 模块，避免 Netlify 打包/加载问题
 */
const createOption = require('../util/option.js')
const https = require('https')

/**
 * 发送 HTTPS GET 请求并解析 JSON 响应
 */
function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error('JSON parse error: ' + data.substring(0, 200)))
          }
        })
      }
    )
    req.on('error', (err) => reject(err))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

/**
 * pyncmd 解锁：直接调用 music-api.gdstudio.xyz 获取 Netease CDN URL
 * 不依赖任何 UNM 模块，纯原生 https
 */
async function pyncmdUnlock(id) {
  const endpoints = [
    `https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=${id}&br=320`,
    `https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=${id}&br=128`,
  ]

  for (const url of endpoints) {
    try {
      console.log(`[pyncmd] Trying endpoint for ${id}`)
      const data = await fetchJson(url, 8000)
      console.log(`[pyncmd] Response keys:`, Object.keys(data).join(', '))

      if (data.url) {
        // 替换域名确保 HTTPS + CORS 兼容
        const finalUrl = data.url.replace(
          /https:\/\/[^/]+\.music\.126\.net/,
          'https://m7.music.126.net'
        )
        console.log(`[pyncmd] ✓ Unlocked ${id}: ${finalUrl.substring(0, 80)}...`)
        return {
          url: finalUrl,
          br: data.br || 320000,
          size: data.size || 0,
          md5: data.md5 || null,
        }
      }
    } catch (err) {
      console.warn(`[pyncmd] Endpoint failed for ${id}:`, err.message)
    }
  }
  return null
}

module.exports = async (query, request) => {
  const data = {
    ids: '[' + query.id + ']',
    level: query.level || 'exhigh',
    encodeType: query.encodeType || 'flac',
  }
  if (data.level == 'sky') {
    data.immerseType = 'c51'
  }

  // Step 1: Try NetEase weapi first
  const options = createOption(query)
  options.crypto = 'weapi'
  const neteaseResult = await request(
    `/api/song/enhance/player/url/v1`,
    data,
    options,
  )

  const songData = neteaseResult.body?.data?.[0]

  // If NetEase gives us a valid URL, return it directly
  if (songData?.url) {
    return neteaseResult
  }

  console.log(`[song_url_v1] NetEase returned empty for ${query.id}, trying pyncmd unlock...`)

  // Step 2: NetEase returned empty — try inline pyncmd unlock
  const unlocked = await pyncmdUnlock(query.id)

  if (unlocked?.url) {
    console.log(`[song_url_v1] ✓ Returning unlocked URL for ${query.id}`)

    const isFlac = unlocked.url.includes('.flac')
    const unlockedSong = {
      id: Number(query.id),
      url: unlocked.url,
      br: unlocked.br || 128000,
      size: unlocked.size || 0,
      md5: unlocked.md5 || null,
      code: 200,
      expi: 1200,
      type: isFlac ? 'flac' : (unlocked.url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] || 'mp3'),
      gain: 0,
      peak: null,
      closedGain: 0,
      closedPeak: 0,
      fee: 0,
      uf: null,
      payed: 0,
      flag: 0,
      canExtend: false,
      freeTrialInfo: null,
      level: query.level || 'standard',
      encodeType: isFlac ? 'flac' : 'mp3',
      channelLayout: null,
      freeTrialPrivilege: {
        resConsumable: false,
        userConsumable: false,
        listenType: null,
        cannotListenReason: null,
        playReason: null,
        freeLimitTagType: null,
      },
      freeTimeTrialPrivilege: {
        resConsumable: false,
        userConsumable: false,
        type: 0,
        remainTime: 0,
      },
      urlSource: 0,
      rightSource: 0,
      podcastCtrp: null,
      effectTypes: null,
      time: 0,
      message: null,
      levelConfuse: null,
      musicId: String(query.id),
      accompany: null,
      sr: 44100,
      auEff: null,
      immerseType: null,
      beatType: 0,
    }

    return {
      status: 200,
      body: {
        code: 200,
        data: [unlockedSong],
      },
      cookie: [],
    }
  }

  console.warn(`[song_url_v1] All unlock methods failed for ${query.id}`)

  // Step 3: Both failed — return original NetEase result
  return neteaseResult
}
