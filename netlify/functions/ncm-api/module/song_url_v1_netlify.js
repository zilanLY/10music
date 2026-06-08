/**
 * Netlify-adapted song_url_v1 — uses weapi + UNM unlock fallback.
 * When NetEase returns no URL, tries to match from third-party sources
 * via @unblockneteasemusic/server.
 */
const createOption = require('../util/option.js')

// UNM match function — lazily loaded to avoid startup overhead
// 在 Netlify 构建时，@unblockneteasemusic/server 被复制到 ../unm-server/
let matchFn = null
function getUnmMatch() {
  if (!matchFn) {
    try {
      matchFn = require('../unm-server/src/provider/match')
    } catch (e) {
      console.warn('[UNM] Failed to load match module:', e.message)
      matchFn = null
    }
  }
  return matchFn
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

  // NetEase returns { data: [{...}], code: 200 }
  const songData = neteaseResult.body?.data?.[0]

  // If NetEase gives us a valid URL, return it directly
  if (songData?.url) {
    return neteaseResult
  }

  // Step 2: NetEase returned empty — try UNM unlock
  const match = getUnmMatch()
  if (!match) {
    // UNM not available, return NetEase result as-is
    return neteaseResult
  }

  try {
    // Build UNM song info from query if available
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

    const sources = (process.env.UNM_SOURCES || 'kugou,kuwo,migu,bilibili')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    console.log(`[UNM] Unlocking song ${query.id}, sources: ${sources.join(',')}`)
    const unmResult = await match(query.id, sources, unmData)

    if (unmResult?.url) {
      console.log(`[UNM] Unlocked ${query.id} from ${unmResult.source}: ${unmResult.url}`)

      // Map UNM result to NetEase format
      const isFlac = unmResult.url.includes('.flac')
      const unlockedSong = {
        id: Number(query.id),
        url: unmResult.url,
        br: unmResult.br || 128000,
        size: unmResult.size || 0,
        md5: unmResult.md5 || null,
        code: 200,
        expi: 1200,
        type: isFlac ? 'flac' : (unmResult.url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] || 'mp3'),
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
  } catch (err) {
    console.warn(`[UNM] Failed to unlock ${query.id}:`, err.message || err)
  }

  // Step 3: Both failed — return original NetEase result
  return neteaseResult
}
