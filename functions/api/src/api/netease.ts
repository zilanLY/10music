/**
 * 核心 Netease API 模块 — Cloudflare Worker 版
 * 
 * 从原版 200+ 模块中提取最常用的接口
 * 全部使用 Web Crypto + fetch，零 Node.js 依赖
 */

import { neteaseRequest, createRequestFactory } from './request'

type ReqFn = (url: string, data: Record<string, any>, config?: any) => Promise<any>

// ── 搜索 ────────────────────────────────────────────────────────────
export async function searchKeywords(keywords: string, req: ReqFn, limit = 30, offset = 0, type = 1) {
  return req('/api/search/get', { s: keywords, limit, offset, type }, { crypto: 'weapi' })
}

export async function searchSuggest(keywords: string, req: ReqFn) {
  return req('/api/search/suggest/keyword', { s: keywords }, { crypto: 'weapi' })
}

export async function searchDefault(req: ReqFn) {
  return req('/api/search/defaultkeyword/get', {}, { crypto: 'eapi' })
}

export async function cloudsearch(keywords: string, req: ReqFn, limit = 30, offset = 0, type = 1) {
  return req('/api/cloudsearch/pc', { s: keywords, limit, offset, type, total: true }, { crypto: 'weapi' })
}

// ── 歌曲 ────────────────────────────────────────────────────────────
export async function songDetail(ids: number[], req: ReqFn) {
  return req('/api/v3/song/detail', { c: JSON.stringify(ids.map(id => ({ id: String(id) }))) }, { crypto: 'weapi' })
}

export async function songUrl(ids: number[], req: ReqFn, br = 999000) {
  return req('/api/song/enhance/player/url', { ids: JSON.stringify(ids), br }, { crypto: 'eapi' })
}

export async function songLyric(id: number, req: ReqFn) {
  return req('/api/song/lyric', { id, lv: 1, kv: 1, tv: -1 }, { crypto: 'weapi' })
}

// ── VIP 多源解析 (核心解灰逻辑) ──────────────────────────────────────
const BITRATES = [999000, 320000, 192000, 128000, 96000, 64000]

async function trySongUrlWithFallback(id: string, req: ReqFn, cookie: any, baseOptions: any) {
  const reqOptions = (br: number) => ({
    crypto: 'eapi' as const,
    cookie,
    ua: baseOptions.ua || '',
    realIP: baseOptions.realIP,
    e_r: baseOptions.e_r,
    domain: '',
    checkToken: false,
  })

  // 第一步：标准播放链接
  for (const br of BITRATES) {
    try {
      const res = await req('/api/song/enhance/player/url', { ids: JSON.stringify([id]), br }, reqOptions(br))
      const item = res.body?.data?.[0]
      if (item?.url) return { ...item, fetchedVia: `player_url_br${br}` }
    } catch { /* continue */ }
  }

  // 第二步：下载链接
  for (const br of BITRATES) {
    try {
      const res = await req('/api/song/enhance/download/url', { id, br }, reqOptions(br))
      const url = res.body?.url
      if (url) {
        return {
          id: Number(id), url, br: res.body?.br || br, size: res.body?.size || 0,
          type: res.body?.type || 'flac', md5: res.body?.md5 || '', code: 200,
          level: res.body?.level || 'standard', gain: 0, peak: 0, mvUrl: null,
          fetchedVia: `download_url_br${br}`,
        }
      }
    } catch { /* continue */ }
  }

  return { id: Number(id), url: null, br: 999000, size: 0, type: 'mp3', md5: '', code: 200, level: 'standard', gain: 0, peak: 0, mvUrl: null, fetchedVia: 'none' }
}

export async function songUrlVipFallback(ids: string[], req: ReqFn, query: any) {
  const cookie = query.cookie || {}
  const br = parseInt(query.br || '999000')

  // 官方主接口
  let mainData: any[] = []
  try {
    const mainRes = await req('/api/song/enhance/player/url', { ids: JSON.stringify(ids), br }, {
      crypto: 'eapi', cookie, ua: query.ua || '', realIP: query.realIP, e_r: query.e_r, domain: '', checkToken: false,
    })
    mainData = mainRes.body?.data || []
  } catch (e) { console.warn('[VIP-Fix] Official API failed:', e) }

  const nullUrls = mainData.filter((i: any) => !i.url || i.url === '')
  if (!nullUrls.length) {
    mainData.sort((a: any, b: any) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id)))
    return { code: 200, data: mainData }
  }

  // 并行 fallback
  const fallbackResults = await Promise.all(
    nullUrls.map((item: any) => trySongUrlWithFallback(String(item.id), req, cookie, { ua: query.ua, realIP: query.realIP, e_r: query.e_r }))
  )

  const fallbackMap = new Map(fallbackResults.map((r: any) => [String(r.id), r]))
  const merged = mainData.map((item: any) => {
    if (!item.url && fallbackMap.has(String(item.id))) return fallbackMap.get(String(item.id))
    return item
  })
  merged.sort((a: any, b: any) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id)))
  return { code: 200, data: merged }
}

// ── 歌单 ────────────────────────────────────────────────────────────
export async function playlistDetail(id: number, req: ReqFn, n = 100000) {
  return req('/api/v6/playlist/detail', { id, n }, { crypto: 'weapi' })
}

export async function playlistCatlist(req: ReqFn) {
  return req('/api/playlist/catalogue', {}, { crypto: 'weapi' })
}

export async function playlistHot(req: ReqFn) {
  return req('/api/playlist/hot', {}, { crypto: 'weapi' })
}

export async function topPlaylist(req: ReqFn, cat = '全部', limit = 50, offset = 0) {
  return req('/api/top/playlist', { cat, limit, offset, order: 'hot' }, { crypto: 'weapi' })
}

// ── 用户 ────────────────────────────────────────────────────────────
export async function userDetail(uid: number, req: ReqFn) {
  return req('/api/v1/user/detail', { uid }, { crypto: 'weapi' })
}

export async function userPlaylist(uid: number, req: ReqFn, limit = 30, offset = 0) {
  return req('/api/user/playlist', { uid, limit, offset }, { crypto: 'weapi' })
}

export async function loginCellphone(phone: string, password: string, req: ReqFn) {
  return req('/api/login/cellphone', { phone, password }, { crypto: 'weapi' })
}

export async function loginQrCheck(key: string, req: ReqFn) {
  return req('/api/login/qr/check', { key }, { crypto: 'weapi' })
}

export async function loginQrKey(req: ReqFn) {
  return req('/api/login/qr/key', {}, { crypto: 'weapi' })
}

export async function loginQrCreate(key: string, req: ReqFn) {
  return req('/api/login/qr/create', { key, qrimg: true }, { crypto: 'weapi' })
}

// ── 推荐 ────────────────────────────────────────────────────────────
export async function recommendSongs(req: ReqFn) {
  return req('/api/v3/discovery/recommend/songs', {}, { crypto: 'weapi' })
}

export async function recommendResource(req: ReqFn) {
  return req('/api/v1/discovery/recommend/resource', {}, { crypto: 'weapi' })
}

export async function personalized(req: ReqFn, limit = 30) {
  return req('/api/personalized', { limit }, { crypto: 'weapi' })
}

export async function personalizedNewsong(req: ReqFn, limit = 10) {
  return req('/api/personalized/newsong', { limit, areaId: 0, type: 'recommend' }, { crypto: 'weapi' })
}

export async function topArtists(req: ReqFn, limit = 30, offset = 0) {
  return req('/api/top/artists', { limit, offset }, { crypto: 'weapi' })
}

export async function topAlbum(req: ReqFn, limit = 20, offset = 0) {
  return req('/api/top/album', { limit, offset, area: 'all', type: 'new' }, { crypto: 'weapi' })
}

// ── 评论 ────────────────────────────────────────────────────────────
export async function commentMusic(id: number, req: ReqFn, limit = 20, offset = 0) {
  return req('/api/v2/comment/musicwall', { id, limit, offset }, { crypto: 'weapi' })
}

export async function commentNew(id: number, req: ReqFn, type = 0, limit = 20, offset = 0) {
  return req('/api/v2/comment/new', { id, type, limit, offset }, { crypto: 'weapi' })
}

// ── 排行榜 ──────────────────────────────────────────────────────────
export async function toplist(req: ReqFn) {
  return req('/api/toplist', {}, { crypto: 'weapi' })
}

export async function toplistDetail(req: ReqFn) {
  return req('/api/toplist/detail', {}, { crypto: 'weapi' })
}

// ── 歌手 ────────────────────────────────────────────────────────────
export async function artistDetail(id: number, req: ReqFn) {
  return req('/api/artist/detail', { id }, { crypto: 'weapi' })
}

export async function artistSongs(id: number, req: ReqFn, limit = 50, offset = 0) {
  return req('/api/v1/artist/songs', { id, limit, offset, order: 'hot' }, { crypto: 'weapi' })
}

export async function artistAlbums(id: number, req: ReqFn, limit = 30, offset = 0) {
  return req('/api/artist/albums', { id, limit, offset }, { crypto: 'weapi' })
}

// ── 专辑 ────────────────────────────────────────────────────────────
export async function albumDetail(id: number, req: ReqFn) {
  return req('/api/v1/album/detail', { id }, { crypto: 'weapi' })
}

// ── MV ──────────────────────────────────────────────────────────────
export async function mvDetail(id: number, req: ReqFn) {
  return req('/api/mv/detail', { id }, { crypto: 'weapi' })
}

export async function mvUrl(id: number, req: ReqFn, r = 1080) {
  return req('/api/song/enhance/play/mv/url', { id, r }, { crypto: 'weapi' })
}

// ── 电台 ────────────────────────────────────────────────────────────
export async function djDetail(id: number, req: ReqFn) {
  return req('/api/dj/detail', { id }, { crypto: 'weapi' })
}

export async function djProgram(id: number, req: ReqFn, limit = 30, offset = 0) {
  return req('/api/dj/program', { id, limit, offset }, { crypto: 'weapi' })
}
