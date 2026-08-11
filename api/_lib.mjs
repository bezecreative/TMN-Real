// Shared helpers for the portal API functions. Dependency-free on purpose:
// these files are copied into the TMN-Real artifact repo, which has no
// node_modules — everything runs on Node's global fetch.

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  GITHUB_TOKEN,
  SOURCE_REPO = 'bezecreative/tmn-events',
  PIPELINE_SECRET,
} = process.env

export const config = { SOURCE_REPO, PIPELINE_SECRET }

export function applyCors(req, res) {
  const origin = req.headers.origin || ''
  const ok =
    origin === 'https://tmn.wearemox.com' ||
    origin.endsWith('.vercel.app') ||
    origin.startsWith('http://localhost')
  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

export function requireEnv(res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GITHUB_TOKEN) {
    res.status(500).json({ error: 'Portal API is not configured on this deployment.' })
    return false
  }
  return true
}

// Resolve the calling user from their Supabase access token.
export async function getUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  return r.json()
}

// Service-role REST access (bypasses RLS — server only).
export async function db(path, { method = 'GET', body, headers = {} } = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  const json = text ? JSON.parse(text) : null
  if (!r.ok) throw new Error(json?.message || `Supabase error ${r.status}`)
  return json
}

export async function getRequest(id) {
  const rows = await db(`change_requests?id=eq.${encodeURIComponent(id)}&select=*`)
  return rows?.[0] ?? null
}

export async function updateRequest(id, patch) {
  return db(`change_requests?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch })
}

export async function isAdmin(userId) {
  const rows = await db(`profiles?id=eq.${encodeURIComponent(userId)}&select=role`)
  return rows?.[0]?.role === 'admin'
}

// GitHub REST helper against the source repo.
export async function github(path, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 204) return null
  const json = await r.json().catch(() => null)
  if (!r.ok) throw new Error(json?.message || `GitHub error ${r.status}`)
  return json
}

export function fireDispatch(request, { revision = false } = {}) {
  return github(`/repos/${SOURCE_REPO}/dispatches`, {
    method: 'POST',
    body: {
      event_type: 'edit-request',
      client_payload: {
        request_id: request.id,
        page_url: request.page_url,
        section_name: request.section_name,
        description: request.description,
        screenshot_url: request.screenshot_url,
        attachments: request.attachments ?? [],
        revision: revision,
        revision_notes: request.revision_notes || '',
        branch_name: request.branch_name || '',
        pr_number: request.pr_number || null,
      },
    },
  })
}

export async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}
