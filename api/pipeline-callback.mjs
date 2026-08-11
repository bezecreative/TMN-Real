import { requireEnv, updateRequest, readBody, config } from './_lib.mjs'

const ALLOWED = ['processing', 'preview_ready', 'published', 'failed']

// Called by the GitHub Actions workflows to report pipeline progress.
// Authenticated by shared secret, not user tokens.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!requireEnv(res)) return

  try {
    if (!config.PIPELINE_SECRET || req.headers['x-pipeline-secret'] !== config.PIPELINE_SECRET) {
      return res.status(401).json({ error: 'Bad pipeline secret.' })
    }

    const { requestId, status, branch_name, pr_number, preview_url, error_message } =
      await readBody(req)
    if (!requestId || !ALLOWED.includes(status)) {
      return res.status(400).json({ error: 'requestId and a valid status are required.' })
    }

    const patch = { status }
    if (branch_name) patch.branch_name = branch_name
    if (pr_number) patch.pr_number = pr_number
    if (preview_url) patch.preview_url = preview_url
    if (error_message !== undefined) patch.error_message = error_message

    await updateRequest(requestId, patch)
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
