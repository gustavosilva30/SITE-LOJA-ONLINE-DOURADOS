/**
 * Gera public/version.json antes do build para detecção de novo deploy.
 * Rode: node scripts/write-version.mjs
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const publicDir = resolve(root, 'public')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true })
}

const payload = {
  version: pkg.version || '0.0.0',
  build: Date.now(),
}

writeFileSync(resolve(publicDir, 'version.json'), JSON.stringify(payload) + '\n', 'utf8')
console.log('[write-version]', payload.version, payload.build)
