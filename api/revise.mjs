import {
  applyCors, requireEnv, getUser, getRequest, updateRequest, isAdmin, fireDispatch, readBody,
} from './_lib.mjs'

// Client feedback on a preview — re-runs the pipeline on the same branch.
export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!requireEnv(res)) return

  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Not signed in.' })

    const { requestId, notes } = await readBody(req)
    if (!notes?.trim()) return res.status(400).json({ error: 'Feedback notes are required.' })

    const request = requestId && (await getRequest(requestId))
    if (!request) return res.status(404).json({ error: 'Request not found.' })

    const admin = await isAdmin(user.id)
    if (request.user_id !== user.id && !admin) {
      return res.status(403).json({ error: 'Not your request.' })
    }
    if (request.status !== 'preview_ready') {
      return res.status(409).json({ error: 'Revisions can only be requested on a ready preview.' })
    }

    const updated = { ...request, revision_notes: notes.trim() }
    await fireDispatch(updated, { revision: true })
    await updateRequest(request.id, { status: 'revision_requested', revision_notes: notes.trim() })
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
