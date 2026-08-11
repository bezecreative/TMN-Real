import {
  applyCors, requireEnv, getUser, getRequest, updateRequest, isAdmin, github, config, readBody,
} from './_lib.mjs'

// Approve & Publish: merges the request's PR into main. The publish workflow
// then rebuilds production artifacts and marks the request 'published'.
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
    if (request.status !== 'preview_ready' || !request.pr_number) {
      return res.status(409).json({ error: 'This request has no preview to approve.' })
    }

    await github(`/repos/${config.SOURCE_REPO}/pulls/${request.pr_number}/merge`, {
      method: 'PUT',
      body: {
        merge_method: 'squash',
        commit_title: `Publish edit request ${request.id}: ${request.section_name}`,
      },
    })
    await updateRequest(request.id, { status: 'approved' })
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
