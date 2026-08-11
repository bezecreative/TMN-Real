import {
  applyCors, requireEnv, getUser, getRequest, updateRequest, isAdmin, fireDispatch, readBody,
} from './_lib.mjs'

// Kicks off (or re-runs) the edit pipeline for a change request.
export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!requireEnv(res)) return

  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Not signed in.' })

    const { requestId } = await readBody(req)
    const request = requestId && (await getRequest(requestId))
    if (!request) return res.status(404).json({ error: 'Request not found.' })

    const admin = await isAdmin(user.id)
    if (request.user_id !== user.id && !admin) {
      return res.status(403).json({ error: 'Not your request.' })
    }
    if (!['pending', 'failed'].includes(request.status)) {
      return res.status(409).json({ error: `Cannot start pipeline from status "${request.status}".` })
    }

    await fireDispatch(request)
    await updateRequest(request.id, { status: 'processing', error_message: null })
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
