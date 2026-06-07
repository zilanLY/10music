/**
 * 构建脚本：为 Netlify Functions 准备 ncm-api 文件
 * 将 server/ncm-api/ 复制到 netlify/functions/ncm-api/
 * 这样 esbuild 打包时能正确 require() 所有模块
 */

const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '../server/ncm-api')
const DST = path.resolve(__dirname, '../netlify/functions/ncm-api')

// 清除旧文件
if (fs.existsSync(DST)) {
  fs.rmSync(DST, { recursive: true })
}

// 复制整个目录
copyDir(SRC, DST)

console.log(`[build-netlify] 复制 ${SRC} → ${DST}`)

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}
