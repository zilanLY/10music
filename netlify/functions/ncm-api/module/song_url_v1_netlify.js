/**
 * Netlify-adapted song_url_v1 — uses weapi instead of xeapi,
 * no unblock deps. Replaces the original song_url_v1.js which
 * hardcodes xeapi and depends on unblockmusic-utils + dotenv.
 */
const createOption = require('../util/option.js')
module.exports = async (query, request) => {
  const data = {
    ids: '[' + query.id + ']',
    level: query.level || 'exhigh',
    encodeType: query.encodeType || 'flac',
  }
  if (data.level == 'sky') {
    data.immerseType = 'c51'
  }
  // Force weapi — xeapi domain (interface.music.163.com) unreachable on Netlify
  const options = createOption(query)
  options.crypto = 'weapi'
  return request(
    `/api/song/enhance/player/url/v1`,
    data,
    options,
  )
}
