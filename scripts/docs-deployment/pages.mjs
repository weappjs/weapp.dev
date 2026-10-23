import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertIdentity, identityFilename, pause, run, verifyArtifact, writeResult } from './context.mjs'
import { githubClient, pagesReceiptStore } from './github.mjs'

const failedStatuses = new Set(['deployment_cancelled', 'deployment_failed', 'deployment_content_failed', 'deployment_lost'])

export async function publicIdentityMatches(context, request = fetch) {
  const url = new URL(identityFilename, `${context.url}/`)
  url.searchParams.set('deployment', context.identity.deploymentId)
  url.searchParams.set('check', Date.now().toString())
  const response = await request(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (response.status === 404) {
    return false
  }
  if (!response.ok) {
    throw new Error(`Public deployment verification failed (HTTP ${response.status}).`)
  }
  let value
  try {
    value = await response.json()
  }
  catch {
    return false
  }
  try {
    assertIdentity(value, context.identity)
    return true
  }
  catch {
    return false
  }
}

export async function waitForPages(client, id, options = {}) {
  const wait = options.sleep ?? pause
  for (let attempt = 0; attempt < (options.pollLimit ?? 60); attempt++) {
    const result = await client(`pages/deployments/${encodeURIComponent(id)}`)
    if (result?.status === 'succeed') {
      return
    }
    if (failedStatuses.has(result?.status)) {
      const error = new Error(`GitHub Pages deployment ended with ${result.status}.`)
      error.deploymentFailed = true
      throw error
    }
    if (!['deployment_in_progress', 'syncing_files', 'finished_file_sync', 'updating_pages', 'purging_cdn', 'deployment_attempt_error'].includes(result?.status)) {
      throw new Error('GitHub Pages returned an unknown deployment status; keep this deployment pending.')
    }
    await wait(10000)
  }
  throw new Error('Timed out confirming the Pages deployment; retry the same deployment identity.')
}

async function waitForPublicIdentity(context, options) {
  for (let attempt = 0; attempt < (options.pollLimit ?? 60); attempt++) {
    if (await publicIdentityMatches(context, options.fetch)) {
      return true
    }
    await (options.sleep ?? pause)(10000)
  }
  return false
}

async function uploadArtifact(context, options) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'weapp-pages-'))
  try {
    const tar = path.join(temporary, 'artifact.tar')
    await (options.run ?? run)('tar', ['--dereference', '--hard-dereference', '--directory', context.dist, '-cf', tar, '--exclude=.git', '--exclude=.github', '--exclude=.[^/]*', '.'], { env: context.env })
    const artifact = options.artifact ?? new (await import('@actions/artifact')).DefaultArtifactClient()
    // Artifact v2+ names are unique within a workflow run, including retries
    // after a definite Pages rejection or an OIDC failure before submission.
    const name = `pages-${context.site}-${context.identity.deploymentId.slice(0, 12)}-${context.env.GITHUB_RUN_ID}-${context.env.GITHUB_RUN_ATTEMPT || '1'}-${randomUUID()}`
    const uploaded = await artifact.uploadArtifact(name, [tar], temporary, { retentionDays: 14 })
    if (!Number.isSafeInteger(uploaded.id) || uploaded.id < 1) {
      throw new Error('Artifact service did not return an artifact ID.')
    }
    return uploaded.id
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

/** All remote writes stay inside the single repo docs execution and its concurrency lock. */
export async function deployPages(context, options = {}) {
  if (context.site !== 'open-source' || context.channel !== 'stable' || context.url !== 'https://weapp.js.org') {
    throw new Error('GitHub Pages only hosts the open-source stable site.')
  }
  await verifyArtifact(context)
  const client = options.client ?? githubClient(context.env, options.fetch)
  const store = options.store ?? pagesReceiptStore(client, context.identity.deploymentId)
  let { value: receipt, revision } = await store.read()
  const save = async (value) => {
    revision = await store.write(value, revision)
    receipt = value
  }
  const finish = async (versionId) => {
    await save({ ...receipt, phase: 'complete', versionId })
    return writeResult(context, { versionId, url: context.url })
  }

  if (receipt && !['failed'].includes(receipt.phase)) {
    if (receipt.pagesId) {
      try {
        await waitForPages(client, receipt.pagesId, options)
      }
      catch (error) {
        if (error.deploymentFailed) {
          await save({ ...receipt, phase: 'failed' })
        }
        throw error
      }
      if (!await waitForPublicIdentity(context, options)) {
        throw new Error('Pages reports success but the public deployment identity does not match.')
      }
      return finish(String(receipt.pagesId))
    }
    // A lost POST response is ambiguous. Serving the exact identity proves that
    // the requested build reached Pages; otherwise never issue a second POST.
    if (await waitForPublicIdentity(context, options)) {
      return finish(context.identity.deploymentId)
    }
    throw new Error('The previous Pages request has an unknown outcome. Inspect the provider receipt; no replacement deployment was submitted.')
  }

  const artifactId = await uploadArtifact(context, options)
  const idToken = await (options.getIDToken ?? (await import('@actions/core')).getIDToken)()
  const previousAttempts = receipt
    ? [...(receipt.previousAttempts ?? []), {
        artifactId: receipt.artifactId,
        pagesId: receipt.pagesId,
        phase: receipt.phase,
      }]
    : []
  await save({ schemaVersion: 1, deploymentId: context.identity.deploymentId, phase: 'submitting', artifactId, runId: context.env.GITHUB_RUN_ID, previousAttempts })
  let deployment
  try {
    deployment = await client('pages/deployments', {
      method: 'POST',
      body: {
        artifact_id: artifactId,
        environment: 'docs-open-source-stable',
        pages_build_version: context.identity.deploymentId,
        oidc_token: idToken,
      },
    })
  }
  catch (error) {
    // A definite rejection can be retried. Conflict, server errors and lost
    // responses may have created a deployment, so retain the submitting state.
    if (error.method === 'POST' && [400, 401, 403, 404, 422].includes(error.status)) {
      await save({ ...receipt, phase: 'failed', rejectedStatus: error.status })
    }
    throw error
  }
  if (!['string', 'number'].includes(typeof deployment?.id) || !String(deployment.id).trim()
    || new URL(deployment.page_url).hostname !== 'weapp.js.org') {
    throw new Error('Pages returned an invalid deployment response; its request remains pending.')
  }
  await save({ ...receipt, phase: 'created', pagesId: String(deployment.id) })
  try {
    await waitForPages(client, receipt.pagesId, options)
  }
  catch (error) {
    if (error.deploymentFailed) {
      await save({ ...receipt, phase: 'failed' })
    }
    throw error
  }
  if (!await waitForPublicIdentity(context, options)) {
    throw new Error('Pages deployment is not yet serving the expected identity; retry the same deployment.')
  }
  return finish(receipt.pagesId)
}
