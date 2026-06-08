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

// 复制 Netlify 专用模块替换（不在 server/ncm-api/ 中）
const netlifyOverrides = 'netlify/functions/ncm-api-overrides'
const netlifyOverridesSrc = path.resolve(__dirname, '..', netlifyOverrides)
const netlifyOverridesDst = path.join(DST, 'module')
if (fs.existsSync(netlifyOverridesSrc)) {
  const entries = fs.readdirSync(netlifyOverridesSrc, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      const srcPath = path.join(netlifyOverridesSrc, entry.name)
      const dstPath = path.join(netlifyOverridesDst, entry.name)
      fs.copyFileSync(srcPath, dstPath)
      console.log(`[build-netlify] 复制覆盖模块: ${entry.name}`)
    }
  }
}

// 复制 @unblockneteasemusic/server 到函数目录，供解锁模块使用
const UNM_SRC = path.resolve(__dirname, '../node_modules/@unblockneteasemusic/server')
const UNM_DST = path.join(DST, 'unm-server')
if (fs.existsSync(UNM_SRC)) {
  copyDir(UNM_SRC, UNM_DST)
  console.log(`[build-netlify] 复制 UNM: ${UNM_SRC} → ${UNM_DST}`)
} else {
  console.warn('[build-netlify] 警告: @unblockneteasemusic/server 未安装，解锁功能将不可用')
}

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
