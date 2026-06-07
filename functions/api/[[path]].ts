/**
 * Cloudflare Pages Functions — API 入口
 * 
 * 将独立 Worker 改造为 Pages Functions，实现单项目一键部署。
 * 路由: /api/* → functions/api/[[path]].ts
 */

import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

import { neteaseRequest, createRequestFactory } from './src/api/request'
import * as NeteaseApi from './src/api/netease'
import { unblockSong } from './src/provider/unm'

type Env = {
  MUSIC_CACHE?: KVNamespace
}

const app = new Hono<{ Bindings: Env }>()

// ── CORS ──────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Cookie, X-Requested-With')
  c.header('Access-Control-Expose-Headers', 'Set-Cookie')
  if (c.req.method === 'OPTIONS') return c.text('', 204)
  await next()
})

// ── 辅助函数 ──────────────────────────────────────────────────────────
function parseCookie(cookieStr: string): Record<string, string> {
  const obj: Record<string, string> = {}
  if (!cookieStr) return obj
  cookieStr.split(';').forEach(pair => {
    const eq = pair.indexOf('=')
    if (eq < 1) return
    obj[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  })
  return obj
}

function getReq(c: any) {
  const cookieHeader = c.req.header('cookie') || ''
  const cookie = parseCookie(cookieHeader)
  const realIP = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || ''
  const ua = c.req.header('user-agent') || ''
  return createRequestFactory({ cookie, realIP, ua })
}

async function handleApiCall(c: any, handler: (req: any, query: any) => Promise<any>) {
  try {
    const req = getReq(c)
    const query = c.req.method === 'GET' ? Object.fromEntries(new URL(c.req.url).searchParams) : await c.req.json().catch(() => ({}))
    const result = await handler(req, query)
    return c.json(result.body || result, result.status || 200)
  } catch (err: any) {
    return c.json({ code: err.status || 500, msg: err.body?.msg || err.message || 'Internal error' }, err.status || 500)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API 路由
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 搜索 ──────────────────────────────────────────────────────────────
app.get('/api/search', async (c) => handleApiCall(c, (req, q) => NeteaseApi.searchKeywords(q.keywords || q.s, req, q.limit, q.offset, q.type)))
app.post('/api/search', async (c) => handleApiCall(c, (req, q) => NeteaseApi.searchKeywords(q.keywords || q.s, req, q.limit, q.offset, q.type)))
app.get('/api/search/suggest', async (c) => handleApiCall(c, (req, q) => NeteaseApi.searchSuggest(q.keywords || q.s, req)))
app.get('/api/search/default', async (c) => handleApiCall(c, (req) => NeteaseApi.searchDefault(req)))

// ── 歌曲 ──────────────────────────────────────────────────────────────
app.get('/api/song/detail', async (c) => handleApiCall(c, (req, q) => NeteaseApi.songDetail(String(q.id || q.ids).split(',').map(Number), req)))
app.post('/api/song/detail', async (c) => handleApiCall(c, (req, q) => NeteaseApi.songDetail(String(q.id || q.ids).split(',').map(Number), req)))

app.get('/api/song/url', async (c) => handleApiCall(c, (req, q) => NeteaseApi.songUrl(String(q.id || q.ids).split(',').map(Number), req, q.br)))
app.post('/api/song/url', async (c) => handleApiCall(c, (req, q) => NeteaseApi.songUrl(String(q.id || q.ids).split(',').map(Number), req, q.br)))

app.get('/api/song/enhance/player/url', async (c) => handleApiCall(c, async (req, q) => {
  const ids = String(q.id || q.ids).split(',').map(s => s.trim()).filter(Boolean)
  return NeteaseApi.songUrlVipFallback(ids, req, q)
}))
app.post('/api/song/enhance/player/url', async (c) => handleApiCall(c, async (req, q) => {
  const ids = String(q.id || q.ids).split(',').map(s => s.trim()).filter(Boolean)
  return NeteaseApi.songUrlVipFallback(ids, req, q)
}))

app.get('/api/song/lyric', async (c) => handleApiCall(c, (req, q) => NeteaseApi.songLyric(Number(q.id), req)))
app.post('/api/song/lyric', async (c) => handleApiCall(c, (req, q) => NeteaseApi.songLyric(Number(q.id), req)))

// ── 歌单 ──────────────────────────────────────────────────────────────
app.get('/api/playlist/detail', async (c) => handleApiCall(c, (req, q) => NeteaseApi.playlistDetail(Number(q.id), req)))
app.get('/api/playlist/catlist', async (c) => handleApiCall(c, (req) => NeteaseApi.playlistCatlist(req)))
app.get('/api/playlist/hot', async (c) => handleApiCall(c, (req) => NeteaseApi.playlistHot(req)))
app.get('/api/top/playlist', async (c) => handleApiCall(c, (req, q) => NeteaseApi.topPlaylist(req, q.cat, q.limit, q.offset)))

// ── 用户 ──────────────────────────────────────────────────────────────
app.get('/api/user/detail', async (c) => handleApiCall(c, (req, q) => NeteaseApi.userDetail(Number(q.uid), req)))
app.get('/api/user/playlist', async (c) => handleApiCall(c, (req, q) => NeteaseApi.userPlaylist(Number(q.uid), req, q.limit, q.offset)))

// ── 登录 ──────────────────────────────────────────────────────────────
app.post('/api/login/cellphone', async (c) => handleApiCall(c, (req, q) => NeteaseApi.loginCellphone(q.phone, q.password, req)))
app.get('/api/login/qr/key', async (c) => handleApiCall(c, (req) => NeteaseApi.loginQrKey(req)))
app.post('/api/login/qr/create', async (c) => handleApiCall(c, (req, q) => NeteaseApi.loginQrCreate(q.key, req)))
app.post('/api/login/qr/check', async (c) => handleApiCall(c, (req, q) => NeteaseApi.loginQrCheck(q.key, req)))

// ── 推荐 ──────────────────────────────────────────────────────────────
app.get('/api/recommend/songs', async (c) => handleApiCall(c, (req) => NeteaseApi.recommendSongs(req)))
app.get('/api/recommend/resource', async (c) => handleApiCall(c, (req) => NeteaseApi.recommendResource(req)))
app.get('/api/personalized', async (c) => handleApiCall(c, (req, q) => NeteaseApi.personalized(req, q.limit)))
app.get('/api/personalized/newsong', async (c) => handleApiCall(c, (req, q) => NeteaseApi.personalizedNewsong(req, q.limit)))

// ── 排行榜 ────────────────────────────────────────────────────────────
app.get('/api/top/artists', async (c) => handleApiCall(c, (req, q) => NeteaseApi.topArtists(req, q.limit, q.offset)))
app.get('/api/top/album', async (c) => handleApiCall(c, (req, q) => NeteaseApi.topAlbum(req, q.limit, q.offset)))

// ── 评论 ──────────────────────────────────────────────────────────────
app.get('/api/comment/music', async (c) => handleApiCall(c, (req, q) => NeteaseApi.commentMusic(Number(q.id), req, q.limit, q.offset)))
app.get('/api/comment/new', async (c) => handleApiCall(c, (req, q) => NeteaseApi.commentNew(Number(q.id), req, q.type, q.limit, q.offset)))

// ── 排行榜 ────────────────────────────────────────────────────────────
app.get('/api/toplist', async (c) => handleApiCall(c, (req) => NeteaseApi.toplist(req)))
app.get('/api/toplist/detail', async (c) => handleApiCall(c, (req) => NeteaseApi.toplistDetail(req)))

// ── 歌手 ──────────────────────────────────────────────────────────────
app.get('/api/artist/detail', async (c) => handleApiCall(c, (req, q) => NeteaseApi.artistDetail(Number(q.id), req)))
app.get('/api/artist/songs', async (c) => handleApiCall(c, (req, q) => NeteaseApi.artistSongs(Number(q.id), req, q.limit, q.offset)))
app.get('/api/artist/albums', async (c) => handleApiCall(c, (req, q) => NeteaseApi.artistAlbums(Number(q.id), req, q.limit, q.offset)))

// ── 专辑 ──────────────────────────────────────────────────────────────
app.get('/api/album/detail', async (c) => handleApiCall(c, (req, q) => NeteaseApi.albumDetail(Number(q.id), req)))

// ── MV ────────────────────────────────────────────────────────────────
app.get('/api/mv/detail', async (c) => handleApiCall(c, (req, q) => NeteaseApi.mvDetail(Number(q.id), req)))
app.get('/api/mv/url', async (c) => handleApiCall(c, (req, q) => NeteaseApi.mvUrl(Number(q.id), req, q.r)))

// ── 电台 ──────────────────────────────────────────────────────────────
app.get('/api/dj/detail', async (c) => handleApiCall(c, (req, q) => NeteaseApi.djDetail(Number(q.id), req)))
app.get('/api/dj/program', async (c) => handleApiCall(c, (req, q) => NeteaseApi.djProgram(Number(q.id), req, q.limit, q.offset)))

// ── 🔓 UNM 解锁 ──────────────────────────────────────────────────────
app.post('/api/unblock', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const { id, name, artists, album, duration } = body
  if (!id || !name) return c.json({ code: 400, msg: '缺少 id/name 参数' }, 400)

  const result = await unblockSong({ id: Number(id), name, artists: artists || [], album, duration })
  if (result) {
    return c.json({ code: 200, data: result })
  }
  return c.json({ code: 404, msg: '未找到替代音源' }, 404)
})

app.get('/api/unblock', (c) => c.json({ code: 400, msg: '请使用 POST 请求' }, 400))

// ── 通用动态路由 ──────────────────────────────────────────────────────
app.all('/api/*', async (c) => {
  const pathname = new URL(c.req.url).pathname
  const apiPath = pathname

  try {
    const req = getReq(c)
    const query = c.req.method === 'GET'
      ? Object.fromEntries(new URL(c.req.url).searchParams)
      : await c.req.json().catch(() => ({}))

    const cookie = parseCookie(c.req.header('cookie') || '')
    const result = await neteaseRequest(apiPath, query, {
      crypto: 'weapi',
      cookie,
      realIP: c.req.header('cf-connecting-ip') || '',
      ua: c.req.header('user-agent') || '',
      e_r: true,
      domain: '',
      checkToken: false,
    })

    return c.json(result.body, result.status)
  } catch (err: any) {
    return c.json({ code: err.status || 502, msg: 'API request failed' }, err.status || 502)
  }
})

// ── 健康检查 ──────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', runtime: 'cloudflare-pages-functions', version: '1.0.0' }))

// Pages Functions 导出
export const onRequest = handle(app)
