/**
 * Tiny in-memory mock of the Fortress API for frontend development.
 * Implements the same contract as the Express backend:
 *
 *   npm run mock-api        # listens on 127.0.0.1:3000
 *   npm run dev             # Vite proxies /api here
 *
 * Do not run this while the real backend is up.
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_PORT ?? 3000)
/** MOCK_UNAUTHORIZED=1 answers every API call with 401 — handy for UI checks. */
const FORCE_UNAUTHORIZED = process.env.MOCK_UNAUTHORIZED === '1'
const DAY = 86_400_000
const iso = (ageDays) => new Date(Date.now() - ageDays * DAY).toISOString()

/** @type {Set<string>} folders ('' = root) */
const folders = new Set(['', 'Documents', 'Documents/Contracts', 'Photos', 'Projects', 'Music', 'Empty folder'])
/** @type {Map<string, {size:number, mime:string, modified:string}>} */
const files = new Map()

function addFile(path, size, mime, ageDays) {
  files.set(path, { size, mime, modified: iso(ageDays) })
}

addFile('Welcome.txt', 1843, 'text/plain', 3)
addFile('Read me.pdf', 284_000, 'application/pdf', 40)
addFile('Budget 2026.xlsx', 45_210, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1)
addFile('Roadmap.pptx', 1_290_000, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 6)
addFile('Documents/Lease agreement.pdf', 880_000, 'application/pdf', 12)
addFile('Documents/Notes.md', 2_310, 'text/markdown', 0.2)
addFile('Documents/Contracts/Acme 2025.pdf', 512_000, 'application/pdf', 200)
addFile('Photos/Sunset beach.jpg', 3_400_000, 'image/jpeg', 8)
addFile('Photos/Family dinner.jpg', 2_900_000, 'image/jpeg', 30)
addFile('Photos/Logo sketch.png', 810_000, 'image/png', 2)
addFile('Projects/inventory.csv', 90_100, 'text/csv', 5)
addFile('Projects/deploy.sh', 4_096, 'text/x-shellscript', 15)
addFile('Projects/architecture.png', 1_200_000, 'image/png', 9)
addFile('Music/Song idea.mp3', 5_800_000, 'audio/mpeg', 60)

const parentOf = (path) => {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}
const baseName = (path) => {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}
const joinPath = (parent, name) => (parent ? `${parent}/${name}` : name)

function listFolder(path) {
  const entries = []
  for (const folder of folders) {
    if (folder && parentOf(folder) === path) {
      entries.push({
        name: baseName(folder),
        type: 'folder',
        size: 0,
        modified: iso(2 + (folder.length % 30)),
        mime: undefined,
      })
    }
  }
  for (const [file, meta] of files) {
    if (parentOf(file) === path) {
      entries.push({ name: baseName(file), type: 'file', size: meta.size, modified: meta.modified, mime: meta.mime })
    }
  }
  return entries
}

const usageByDay = Array.from({ length: 7 }).map((_, index) => {
  const date = new Date(Date.now() - (6 - index) * DAY)
  const bytes = Math.round(120_000_000 * Math.abs(Math.sin(index * 1.7 + 1)) + 4_000_000)
  return { date: date.toISOString().slice(0, 10), bytes }
})

const USER_COUNT = 4
function adminUsers() {
  return [
    { user: 'YOUR_USERNAME', root: '/srv/fortress/users/YOUR_USERNAME', usedBytes: 132 * 2 ** 30, limitBytes: 1024 * 2 ** 30, entries: 2481 },
    { user: 'mia', root: '/srv/fortress/users/mia', usedBytes: 41 * 2 ** 30, limitBytes: 100 * 2 ** 30, entries: 640 },
    { user: 'dev', root: '/srv/fortress/users/dev', usedBytes: 96 * 2 ** 30, limitBytes: 100 * 2 ** 30, entries: 12044 },
    { user: 'archive', root: '/srv/fortress/users/archive', usedBytes: 100 * 2 ** 30, limitBytes: 100 * 2 ** 30, entries: 99850 },
  ].slice(0, USER_COUNT)
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function svgThumb(name, seed) {
  const hue = (seed * 47) % 360
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="hsl(${hue} 70% 62%)"/>
         <stop offset="1" stop-color="hsl(${(hue + 40) % 360} 60% 42%)"/>
       </linearGradient></defs>
       <rect width="320" height="220" fill="url(#g)"/>
       <text x="16" y="205" font-family="sans-serif" font-size="16" fill="#ffffff" opacity=".85">${name}</text>
     </svg>`,
  )
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const route = url.pathname
  await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 180))

  try {
    if (FORCE_UNAUTHORIZED) {
      return send(res, 401, { error: { code: 'unauthorized', message: 'Session required.' } })
    }

    if (route === '/api/health') return send(res, 200, { status: 'ok', version: '0.4.2-mock' })

    if (route === '/api/me') {
      return send(res, 200, {
        user: 'YOUR_USERNAME',
        role: 'admin',
        root: '/srv/fortress/users/YOUR_USERNAME',
        quota: { usedBytes: 132 * 2 ** 30, limitBytes: 1024 * 2 ** 30 },
      })
    }

    if (route === '/api/files' && req.method === 'GET') {
      const path = url.searchParams.get('path') ?? ''
      if (path !== '' && !folders.has(path)) {
        return send(res, 404, { error: { code: 'not_found', message: 'Folder not found.' } })
      }
      return send(res, 200, { path, entries: listFolder(path) })
    }

    if (route === '/api/files/content' && req.method === 'GET') {
      const path = url.searchParams.get('path') ?? ''
      const meta = files.get(path)
      if (!meta) return send(res, 404, { error: { code: 'not_found', message: 'File not found.' } })
      const name = baseName(path)
      if (meta.mime.startsWith('image/')) {
        const seed = [...path].reduce((sum, char) => sum + char.charCodeAt(0), 0)
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' })
        return res.end(svgThumb(name, seed))
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      return res.end(Buffer.from(`Mock content of ${path}\n`))
    }

    if (route === '/api/files/upload' && req.method === 'POST') {
      const dir = url.searchParams.get('path') ?? ''
      const body = await readBody(req)
      const text = body.toString('latin1')
      const names = [...text.matchAll(/filename="([^"]+)"/g)].map((match) => match[1])
      const uploaded = []
      const errors = []
      for (const name of names) {
        if (!name) continue
        if (name.includes('/')) {
          errors.push({ name, message: 'Invalid file name.' })
          continue
        }
        files.set(joinPath(dir, name), {
          size: 10_000 + Math.round(Math.random() * 2_000_000),
          mime: 'application/octet-stream',
          modified: new Date().toISOString(),
        })
        uploaded.push({ name })
      }
      return send(res, 200, { uploaded, errors })
    }

    if (route === '/api/files/folder' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}')
      const target = joinPath(body.path ?? '', body.name ?? '')
      folders.add(target)
      return send(res, 200, { path: target })
    }

    if (route === '/api/files/rename' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}')
      const from = body.path ?? ''
      const to = joinPath(parentOf(from), body.name ?? baseName(from))
      if (files.has(from)) {
        const meta = files.get(from)
        files.delete(from)
        files.set(to, meta)
      } else if (folders.has(from)) {
        folders.delete(from)
        folders.add(to)
        for (const folder of [...folders]) {
          if (folder.startsWith(`${from}/`)) {
            folders.delete(folder)
            folders.add(to + folder.slice(from.length))
          }
        }
        for (const file of [...files.keys()]) {
          if (file.startsWith(`${from}/`)) {
            const meta = files.get(file)
            files.delete(file)
            files.set(to + file.slice(from.length), meta)
          }
        }
      }
      return send(res, 200, { path: to })
    }

    if (route === '/api/files/delete' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}')
      const target = body.path ?? ''
      files.delete(target)
      folders.delete(target)
      for (const folder of [...folders]) if (folder.startsWith(`${target}/`)) folders.delete(folder)
      for (const file of [...files.keys()]) if (file.startsWith(`${target}/`)) files.delete(file)
      return send(res, 200, { path: target })
    }

    if (route === '/api/admin/users') return send(res, 200, { users: adminUsers() })

    if (route === '/api/usage') {
      const days = Math.max(1, Math.min(31, Number(url.searchParams.get('days') ?? 7)))
      const slice = usageByDay.slice(-days)
      return send(res, 200, {
        totalBytes: slice.reduce((sum, d) => sum + d.bytes, 0),
        byDay: slice,
      })
    }

    send(res, 404, { error: { code: 'not_found', message: `No route for ${route}` } })
  } catch (err) {
    send(res, 500, { error: { code: 'internal', message: err instanceof Error ? err.message : 'error' } })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Fortress API listening on http://127.0.0.1:${PORT}`)
})
