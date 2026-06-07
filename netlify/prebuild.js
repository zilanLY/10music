/**
 * 构建脚本：生成 Netlify Functions 的完整路由配置
 * 
 * 运行方式：node netlify/prebuild.js
 * 会在 netlify/functions/ 目录下生成 routes.js 文件
 */

const fs = require('fs')
const path = require('path')

const moduleDir = path.join(__dirname, 'functions/ncm-api/module')
const outputFile = path.join(__dirname, 'functions/routes.js')

// ── 特殊路由映射 ───────────────────────────────────────────────────
const SPECIAL_ROUTES = {
  'daily_signin': 'daily_signin',
  'fm_trash':     'fm_trash',
  'personal_fm':  'personal_fm',
}

// ── 扫描所有模块 ───────────────────────────────────────────────────
const routes = {}

function scanDir(dir, prefix = '') {
  const files = fs.readdirSync(dir)
  files.forEach(file => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    
    if (stat.isDirectory()) {
      scanDir(fullPath, prefix + '/' + file)
    } else if (file.endsWith('.js')) {
      const name = file.slice(0, -3)
      let route = (prefix + '/' + name).replace(/_/g, '/')
      if (SPECIAL_ROUTES[name]) route = '/ ' + SPECIAL_ROUTES[name]
      routes[route] = './ncm-api/module/' + prefix + '/' + file
    }
  })
}

scanDir(moduleDir)

// ── 生成 routes.js ─────────────────────────────────────────────────
let content = `/**
 * 自动生成的路由配置 — 不要手动修改
 * 由 netlify/prebuild.js 生成
 */

const createRequest = require('./ncm-api/util/request.js')

const modules = {}
`

Object.entries(routes).forEach(([route, modulePath]) => {
  content += `modules['${route}'] = require('${modulePath.replace(/\\/g, '/')}')\\\\n`
})

content += `
module.exports = modules
`

fs.writeFileSync(outputFile, content)
console.log(`✅ 已生成 ${outputFile}`)
console.log(`   共 ${Object.keys(routes).length} 个路由`)
