/**
 * Netlify-adapted song_url_v1 — uses weapi + UNM unlock fallback.
 * When NetEase returns no URL, tries to match from third-party sources
 * via @unblockneteasemusic/server.
 *
 * 架构：通过 netlify.toml external_node_modules 配置，
 * esbuild 不打包 UNM（避免 Netlify 环境下静默失败），
 * 运行时从 node_modules 加载完整的 UNM 模块树。
 *
 * 策略：
 * - pyncmd 优先（music.gdstudio.xyz → Netease CDN HTTPS）
 * - HTTPS URL 直接返回，HTTP 走 /api/audio/proxy
 * - 逐个尝试源，过滤试听片段
 */
const createOption = require('../util/option.js')

// ★ UNM — 通过 external_node_modules 部署，esbuild 不打包
// 运行时从 node_modules/@unblockneteasemusic/server 加载
let unmMatch = null
try {
  unmMatch = require('@unblockneteasemusic/server')
  console.log('[UNM] ✓ UNM module loaded from node_modules')
} catch (e) {
  console.warn('[UNM] ✗ Failed to load UNM:', e.message, e.stack?.split('\n')[1])
}

module.exports = async (query, request) => {
  console.log(`[song_url_v1] Request for ${query.id}, UNM loaded: ${!!unmMatch}`)
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

  // NetEase returns { data: [{...}], code: 200 }
  const songData = neteaseResult.body?.data?.[0]

  // If NetEase gives us a valid URL, return it directly
  if (songData?.url) {
    return neteaseResult
  }

  // Step 2: NetEase returned empty — try UNM unlock
  if (!unmMatch) {
    return neteaseResult
  }

  try {
    // 构建 UNM 歌曲信息（用于提高匹配精度）
    let unmData = null
    if (query.name || query.songName) {
      unmData = {
        id: Number(query.id),
        name: query.name || query.songName,
        alias: query.alias ? query.alias.split(',') : [],
        duration: query.dt ? Number(query.dt) : undefined,
        album: query.albumId
          ? { id: Number(query.albumId), name: query.albumName || '' }
          : { id: 0, name: '' },
        artists: query.artist
          ? [{ id: 0, name: query.artist }]
          : [],
      }
    }

    // ★ 逐个尝试源，pyncmd 优先（HTTPS Netease CDN，无需代理）
    const allSources = (process.env.UNM_SOURCES || 'pyncmd,kuwo,kugou,migu,bilibili')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const songDurationSec = query.dt ? Number(query.dt) / 1000 : 240
    // 最小期望文件大小：64kbps × 秒数 / 8，至少 300KB
    const minExpectedSize = Math.max(songDurationSec * 8000, 300 * 1024)

    let bestResult = null
    let bestSource = null

    for (const source of allSources) {
      try {
        console.log(`[UNM] Trying source: ${source} for song ${query.id}`)
        const result = await unmMatch(query.id, [source], unmData)

        if (!result?.url) {
          console.log(`[UNM] ${source}: no match`)
          continue
        }

        console.log(`[UNM] ${source}: url=${result.url.substring(0, 80)}..., size=${result.size}B, br=${result.br}`)

        // 过滤试听片段：文件太小（< 期望大小的 20%）
        if (result.size && result.size < minExpectedSize * 0.2) {
          console.warn(`[UNM] ${source}: file too small (${result.size}B < ${Math.floor(minExpectedSize * 0.2)}B), likely preview, skipping`)
          continue
        }

        // 找到一个合适的匹配
        bestResult = result
        bestSource = source
        break
      } catch (err) {
        console.warn(`[UNM] ${source}: error:`, err.message || err)
      }
    }

    if (bestResult?.url) {
      console.log(`[UNM] ✓ Unlocked ${query.id} from ${bestSource}`)

      // ★ URL 策略（借鉴 SPlayer）：
      // HTTPS URL → 直接返回（Netease CDN 已支持 CORS，无需代理）
      // HTTP URL  → 走音频代理（浏览器阻止 Mixed Content）
      const isHttps = bestResult.url.startsWith('https://')
      const finalUrl = isHttps
        ? bestResult.url
        : '/api/audio/proxy?url=' + encodeURIComponent(bestResult.url)

      console.log(`[UNM] Final URL: ${isHttps ? 'DIRECT (https)' : 'PROXIED'} — ${finalUrl.substring(0, 80)}...`)

      const isFlac = bestResult.url.includes('.flac')
      const unlockedSong = {
        id: Number(query.id),
        url: finalUrl,
        br: bestResult.br || 128000,
        size: bestResult.size || 0,
        md5: bestResult.md5 || null,
        code: 200,
        expi: 1200,
        type: isFlac ? 'flac' : (bestResult.url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] || 'mp3'),
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

    console.warn(`[UNM] All sources failed for song ${query.id}`)
  } catch (err) {
    console.warn(`[UNM] Failed to unlock ${query.id}:`, err.message || err)
  }

  // Step 3: Both failed — return original NetEase result
  return neteaseResult
}
