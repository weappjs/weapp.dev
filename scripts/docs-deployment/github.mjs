import { Buffer } from 'node:buffer'
import { sanitizeMessage } from './diagnostics.mjs'

const stateBranch = 'repoctl-release-state'

export function githubClient(env, request = fetch) {
  const token = env.GITHUB_TOKEN
  if (!token || env.GITHUB_REPOSITORY !== 'weappjs/weapp.dev') {
    throw new Error('GitHub deployment credentials are missing.')
  }
  return async (endpoint, options = {}) => {
    const response = await request(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${endpoint}`, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(30000),
    })
    if (options.allowMissing && response.status === 404) {
      return undefined
    }
    if (!response.ok) {
      // Keep the provider's selected explanation without persisting request
      // payloads, authorization headers, OIDC tokens or arbitrary response data.
      const details = await response.json().catch(() => undefined)
      const message = typeof details?.message === 'string' ? sanitizeMessage(details.message, env).slice(0, 1000) : ''
      const requestId = (response.headers.get('x-github-request-id') || '').replace(/[^a-z\d:-]/gi, '').slice(0, 100)
      const error = new Error(`GitHub ${options.method || 'GET'} ${endpoint.split('?')[0]} failed (HTTP ${response.status}).${requestId ? ` Request ID: ${requestId}.` : ''}${message ? ` ${message}` : ''}`)
      error.status = response.status
      error.method = options.method || 'GET'
      throw error
    }
    return response.status === 204 ? undefined : response.json()
  }
}

/** Provider receipts are separate files; never replace repoctl's own state documents. */
export function pagesReceiptStore(client, deploymentId) {
  if (!/^[a-f\d]{64}$/.test(deploymentId)) {
    throw new Error('Invalid receipt identity.')
  }
  const endpoint = `contents/provider-receipts/pages/${deploymentId}.json`
  return {
    async read() {
      // A missing state branch or denied access must not masquerade as a new deployment.
      await client(`git/ref/heads/${stateBranch}`)
      const file = await client(`${endpoint}?ref=${stateBranch}`, { allowMissing: true })
      if (!file) {
        return { value: undefined, revision: undefined }
      }
      if (file.encoding !== 'base64' || !file.sha) {
        throw new Error('Invalid Pages receipt response.')
      }
      const value = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
      if (value.schemaVersion !== 1 || value.deploymentId !== deploymentId
        || !['submitting', 'created', 'complete', 'failed'].includes(value.phase)) {
        throw new Error('Invalid Pages deployment receipt.')
      }
      return { value, revision: file.sha }
    },
    async write(value, revision) {
      const content = `${JSON.stringify(value)}\n`
      try {
        const result = await client(endpoint, {
          method: 'PUT',
          body: {
            message: `docs: record Pages deployment ${deploymentId.slice(0, 12)}`,
            branch: stateBranch,
            content: Buffer.from(content).toString('base64'),
            ...(revision ? { sha: revision } : {}),
          },
        })
        if (!result?.content?.sha) {
          throw new Error('GitHub did not confirm the Pages receipt revision.')
        }
        return result.content.sha
      }
      catch (error) {
        // A committed PUT with a lost response must not strand the caller
        // before it has even submitted Pages. Reconcile the exact bytes only;
        // a concurrent revision or unreadable state must still fail closed.
        try {
          const file = await client(`${endpoint}?ref=${stateBranch}`, { allowMissing: true })
          if (file?.encoding === 'base64' && file.sha
            && Buffer.from(file.content, 'base64').toString('utf8') === content) {
            return file.sha
          }
        }
        catch {}
        throw error
      }
    },
  }
}
