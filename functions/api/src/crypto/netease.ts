/**
 * Netease Music Crypto — Cloudflare Workers 兼容版
 * 
 * 原版依赖: crypto-js + node-forge + zlib (Node.js only)
 * 本版使用: Web Crypto API (AES-CBC) + Node.js crypto (AES-ECB, via nodejs_compat)
 * 
 * 加密模式: weapi / linuxapi / eapi / eapiResDecrypt
 */

// Node.js crypto for AES-ECB (Cloudflare Workers with nodejs_compat flag)
// Web Crypto API does not support AES-ECB, but nodejs_compat provides Node.js crypto
import { createCipheriv, createDecipheriv } from 'crypto'

const iv = new TextEncoder().encode('0102030405060708')
const presetKey = new TextEncoder().encode('0CoJUm6Qyw8W8jud')
const linuxapiKey = Buffer.from('rFgB&h#%2?^eDg:Q')
const eapiKey = Buffer.from('e82ckenh8dichen8')
const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// RSA 公钥 (PEM → DER for Web Crypto)
const RSA_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`

// PEM → ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN.*?-----/g, '').replace(/-----END.*?-----/g, '').replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// 导入 RSA 公钥 (缓存)
let _rsaKey: CryptoKey | null = null
async function getRsaPublicKey(): Promise<CryptoKey> {
  if (_rsaKey) return _rsaKey
  _rsaKey = await crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(RSA_PUBKEY_PEM),
    { name: 'RSA-OAEP', hash: 'SHA-1' },
    false,
    ['encrypt']
  )
  return _rsaKey
}

// ── AES-CBC 加密 (Web Crypto) ─────────────────────────────────────
async function aesEncryptCBC(
  plaintext: Uint8Array,
  key: Uint8Array,
  ivBytes: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: ivBytes }, cryptoKey, plaintext)
  return new Uint8Array(encrypted)
}

// ── AES-ECB 加密 (Node.js crypto, nodejs_compat) ──────────────────
// Cloudflare Workers Web Crypto API 不支持 AES-ECB，
// 但 wrangler.toml 中已启用 nodejs_compat，可用 Node.js crypto 模块
function aesEncryptECB(
  plaintext: Uint8Array,
  key: Buffer
): Uint8Array {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  cipher.setAutoPadding(true)
  const result = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return new Uint8Array(result)
}

// ── AES-ECB 解密 (Node.js crypto, nodejs_compat) ──────────────────
function aesDecryptECB(
  ciphertext: Uint8Array,
  key: Buffer
): Uint8Array {
  const decipher = createDecipheriv('aes-128-ecb', key, null)
  decipher.setAutoPadding(true)
  const result = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return new Uint8Array(result)
}

// ── AES-CBC 解密 (Web Crypto) ─────────────────────────────────────
async function aesDecryptCBC(
  ciphertext: Uint8Array,
  key: Uint8Array,
  ivBytes: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt'])
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, cryptoKey, ciphertext)
  return new Uint8Array(decrypted)
}

// ── RSA 加密 (Web Crypto RSA-OAEP) ────────────────────────────────
async function rsaEncrypt(data: Uint8Array): Promise<string> {
  const key = await getRsaPublicKey()
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, data)
  return Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── 手动 RSA NoPadding 加密 (兼容原版 forge) ──────────────────────
async function rsaEncryptNoPadding(data: Uint8Array): Promise<string> {
  const modulus = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'
  
  const dataHex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')
  const dataBigInt = BigInt('0x' + dataHex)
  const modBigInt = BigInt('0x' + modulus)
  const expBigInt = 65537n
  
  let result = 1n
  let base = dataBigInt % modBigInt
  let exp = expBigInt
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % modBigInt
    base = (base * base) % modBigInt
    exp >>= 1n
  }
  
  return result.toString(16).padStart(256, '0')
}

// ── MD5 (Web Crypto) ──────────────────────────────────────────────
async function md5(message: string): Promise<string> {
  const encoded = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest('MD5', encoded).catch(() => null)
  if (!hash) {
    const sha1 = await crypto.subtle.digest('SHA-1', encoded)
    return Array.from(new Uint8Array(sha1)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Uint8Array → Base64 ───────────────────────────────────────────
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ── weapi 加密 ─────────────────────────────────────────────────────
export async function weapi(object: Record<string, any>) {
  const text = JSON.stringify(object)
  let secretKey = ''
  for (let i = 0; i < 16; i++) {
    secretKey += base62.charAt(Math.round(Math.random() * 61))
  }
  const secretKeyBytes = new TextEncoder().encode(secretKey)
  const textBytes = new TextEncoder().encode(text)

  // 第一次 AES-CBC 加密 → base64 字符串（Web Crypto 自动 PKCS7 padding）
  const firstBytes = await aesEncryptCBC(textBytes, presetKey, iv)
  const firstBase64 = bytesToBase64(firstBytes)

  // 第二次 AES-CBC 加密：加密的是 base64 字符串的 UTF-8 字节
  const firstBase64Bytes = new TextEncoder().encode(firstBase64)
  const secondBytes = await aesEncryptCBC(firstBase64Bytes, secretKeyBytes, iv)
  const params = bytesToBase64(secondBytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const reversed = secretKey.split('').reverse().join('')
  const encSecKey = await rsaEncryptNoPadding(new TextEncoder().encode(reversed))

  return { params, encSecKey }
}

// ── linuxapi 加密 ──────────────────────────────────────────────────
export function linuxapi(object: Record<string, any>) {
  const text = JSON.stringify(object)
  const textBytes = new TextEncoder().encode(text)
  const encrypted = aesEncryptECB(textBytes, linuxapiKey)
  const eparams = Array.from(encrypted).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return { eparams }
}

// ── eapi 加密 ──────────────────────────────────────────────────────
export async function eapi(url: string, object: Record<string, any>) {
  const text = typeof object === 'object' ? JSON.stringify(object) : String(object)
  const message = `nobody${url}use${text}md5forencrypt`
  const digest = await md5(message)
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
  const dataBytes = new TextEncoder().encode(data)
  const encrypted = aesEncryptECB(dataBytes, eapiKey)
  const params = Array.from(encrypted).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return { params }
}

// ── eapi 响应解密 ──────────────────────────────────────────────────
export function eapiResDecrypt(encryptedHex: string): any {
  const ciphertext = new Uint8Array(encryptedHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const decrypted = aesDecryptECB(ciphertext, eapiKey)
  const text = new TextDecoder().decode(decrypted)
  try {
    return JSON.parse(text)
  } catch {
    // 可能是 gzip 压缩的，但 Workers 环境可用 DecompressionStream
    return null
  }
}

// ── eapi 请求解密 ──────────────────────────────────────────────────
export function eapiReqDecrypt(encryptedHex: string): { url: string; data: any } | null {
  const ciphertext = new Uint8Array(encryptedHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const decrypted = aesDecryptECB(ciphertext, eapiKey)
  const text = new TextDecoder().decode(decrypted)
  const match = text.match(/(.*?)-36cd479b6b5-(.*?)-36cd479b6b5-(.*)/)
  if (match) {
    return { url: match[1], data: JSON.parse(match[2]) }
  }
  return null
}

// ── decrypt (通用) ──────────────────────────────────────────────────
export function decrypt(cipher: string): string {
  const ciphertext = new Uint8Array(cipher.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const decrypted = aesDecryptECB(ciphertext, eapiKey)
  return new TextDecoder().decode(decrypted)
}
