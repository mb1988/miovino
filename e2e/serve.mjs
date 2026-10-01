// Serves the production build (dist/client) like Cloudflare would: real files, SPA fallback, and no /api
// (each test mocks the API it needs). Used by playwright.config.ts.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = new URL('../dist/client/', import.meta.url).pathname
const port = Number(process.env.PORT ?? 4174)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.png': 'image/png' }

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  if (path.startsWith('/api/')) return res.writeHead(404).end()
  let file = normalize(join(root, path))
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(port, () => console.log(`e2e server on http://localhost:${port}`))
