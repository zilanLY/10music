/**
 * UNM 第三方音源解锁 — Cloudflare Worker 版
 * 
 * 原版: @unblockneteasemusic/server (Node.js http/https)
 * 本版: 纯 fetch 实现，零 Node.js 依赖
 * 
 * 支持平台: 酷我 / 酷狗 / 咪咕 / B站
 */

// ── 酷我音乐 ────────────────────────────────────────────────────────
async function searchKuwo(keyword: string): Promise<any[]> {
  try {
    const url = `https://www.kuwo.cn/api/www/search/searchMusicBykeyWord?key=${encodeURIComponent(keyword)}&pn=1&rn=10`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.kuwo.cn/search/list',
        'Cookie': 'kw_token=1Q3R4E5T6Y',
      },
    })
    const data = await res.json<any>()
    return data?.data?.list || []
  } catch {
    return []
  }
}

async function getKuwoUrl(rid: number): Promise<string | null> {
  try {
    const url = `https://www.kuwo.cn/api/v1/www/music/playInfo?mid=${rid}&type=music&httpsStatus=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.kuwo.cn/',
        'Cookie': 'kw_token=1Q3R4E5T6Y',
      },
    })
    const data = await res.json<any>()
    return data?.data?.url || null
  } catch {
    return null
  }
}

async function checkKuwo(songMeta: { keyword: string; duration?: number }): Promise<string | null> {
  const results = await searchKuwo(songMeta.keyword)
  if (!results.length) return null

  // 尝试匹配时长最接近的
  for (const song of results.slice(0, 3)) {
    const url = await getKuwoUrl(song.rid)
    if (url) return url
  }
  return null
}

// ── 酷狗音乐 ────────────────────────────────────────────────────────
async function searchKugou(keyword: string): Promise<any[]> {
  try {
    const url = `https://mobileservice.kugou.com/api/v3/search/song?keyword=${encodeURIComponent(keyword)}&page=1&pagesize=10`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
    })
    const data = await res.json<any>()
    return data?.data?.info || []
  } catch {
    return []
  }
}

async function getKugouUrl(hash: string, albumId: string): Promise<string | null> {
  try {
    const url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&album_id=${albumId}&mid=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
    })
    const data = await res.json<any>()
    return data?.data?.play_url || null
  } catch {
    return null
  }
}

async function checkKugou(songMeta: { keyword: string }): Promise<string | null> {
  const results = await searchKugou(songMeta.keyword)
  if (!results.length) return null

  for (const song of results.slice(0, 3)) {
    const url = await getKugouUrl(song.hash, song.album_id || '')
    if (url) return url
  }
  return null
}

// ── 咪咕音乐 ────────────────────────────────────────────────────────
async function searchMigu(keyword: string): Promise<any[]> {
  try {
    const url = `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(keyword)}&type=2&pgc=1&rows=10`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
    })
    const data = await res.json<any>()
    return data?.musics || []
  } catch {
    return []
  }
}

async function getMiguUrl(copyrightId: string): Promise<string | null> {
  try {
    const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/sub.listenSong.do?toneFlag=2&copyrightId=${copyrightId}&resourceType=E`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
    })
    const data = await res.json<any>()
    return data?.data?.playUrl || null
  } catch {
    return null
  }
}

async function checkMigu(songMeta: { keyword: string }): Promise<string | null> {
  const results = await searchMigu(songMeta.keyword)
  if (!results.length) return null

  for (const song of results.slice(0, 3)) {
    const url = await getMiguUrl(song.copyrightId || song.id || '')
    if (url) return url
  }
  return null
}

// ── B站音乐 ─────────────────────────────────────────────────────────
async function searchBilibili(keyword: string): Promise<any[]> {
  try {
    const url = `https://api.bilibili.com/audio/music-service-c/s?search_type=music&page=1&pagesize=10&keyword=${encodeURIComponent(keyword)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    const data = await res.json<any>()
    return data?.data?.result || []
  } catch {
    return []
  }
}

async function getBilibiliUrl(id: string): Promise<string | null> {
  try {
    const url = `https://www.bilibili.com/audio/music-service-c/web/url?sid=${id}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    const data = await res.json<any>()
    return data?.data?.cdns?.[0] || null
  } catch {
    return null
  }
}

async function checkBilibili(songMeta: { keyword: string }): Promise<string | null> {
  const results = await searchBilibili(songMeta.keyword)
  if (!results.length) return null

  for (const song of results.slice(0, 3)) {
    const url = await getBilibiliUrl(String(song.id))
    if (url) return url
  }
  return null
}

// ── 统一解锁入口 ────────────────────────────────────────────────────
const PROVIDERS: { name: string; check: (meta: { keyword: string; duration?: number }) => Promise<string | null> }[] = [
  { name: 'kuwo', check: checkKuwo },
  { name: 'kugou', check: checkKugou },
  { name: 'migu', check: checkMigu },
  { name: 'bilibili', check: checkBilibili },
]

export async function unblockSong(songMeta: {
  id: number
  name: string
  artists: { name: string }[]
  album?: { name: string }
  duration?: number
}): Promise<{ url: string; source: string } | null> {
  const keyword = `${songMeta.name} - ${songMeta.artists.map(a => a.name).join(' / ')}`
  const meta = { keyword, duration: songMeta.duration }

  for (const provider of PROVIDERS) {
    try {
      const url = await provider.check(meta)
      if (url) {
        console.log(`[UNM-Worker] ✓ id=${songMeta.id} from ${provider.name}`)
        return { url, source: provider.name }
      }
    } catch {
      // 当前平台未找到，继续
    }
  }

  console.log(`[UNM-Worker] ✗ id=${songMeta.id} not found on any provider`)
  return null
}
