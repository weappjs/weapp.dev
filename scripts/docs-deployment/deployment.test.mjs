import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { activeVersion, cloudflareClient, deployCloudflare, deploymentMessage, readWranglerOutput, uploadPrPreview, verifyWorkerTarget } from './cloudflare.mjs'
import { assertIdentity, managedContext, prContext, writeBuildIdentity } from './context.mjs'
import { sanitizeMessage, writeDiagnostic } from './diagnostics.mjs'
import { pagesReceiptStore } from './github.mjs'
import { deployPages, waitForPages } from './pages.mjs'

const sha = 'a'.repeat(40)
const identity = 'b'.repeat(64)
const version = '11111111-1111-4111-8111-111111111111'
const oldVersion = '22222222-2222-4222-8222-222222222222'
const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_REPOSITORY: 'weappjs/weapp.dev',
  GITHUB_REF: 'refs/heads/main',
  REPO_DOCS_SITE: 'web',
  REPO_DOCS_CHANNEL: 'stable',
  REPO_DOCS_SOURCE_SHA: sha,
  REPO_DOCS_RELEASE_ID: 'release-1',
  REPO_DOCS_DEPLOYMENT_ID: identity,
  REPO_DOCS_RESULT_FILE: '/unused',
  REPO_DOCS_CONCURRENCY_GROUP: 'docs-web-stable',
}

async function fixture(site, callback) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-deploy-test-'))
  try {
    const values = { ...env, REPO_DOCS_SITE: site, REPO_DOCS_CONCURRENCY_GROUP: `docs-${site}-stable`, REPO_DOCS_RESULT_FILE: path.join(cwd, 'result.json') }
    const context = managedContext(values, cwd)
    await mkdir(context.dist, { recursive: true })
    await writeBuildIdentity(context.dist, values)
    await writeFile(context.config, JSON.stringify({ name: context.worker, assets: { directory: './dist' } }))
    await callback(context)
  }
  finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

async function prFixture(callback) {
  return fixture('web', async (original) => {
    const context = { ...original, channel: 'pr', worker: 'weapp-dev-preview', alias: 'pr-7', identity: { ...original.identity, channel: 'pr' } }
    await writeFile(path.join(context.dist, 'repoctl-deployment.json'), JSON.stringify(context.identity))
    await writeFile(context.config, JSON.stringify({ name: context.worker, assets: { directory: './dist' }, workers_dev: true, preview_urls: true }))
    await callback(context)
  })
}

function receiptStore(initial) {
  let current = initial
  let revision = initial ? '0' : undefined
  return {
    read: vi.fn(async () => ({ value: current, revision })),
    write: vi.fn(async (value, expected) => {
      expect(expected).toBe(revision)
      current = structuredClone(value)
      revision = String(Number(revision || 0) + 1)
      return revision
    }),
    current: () => current,
  }
}

describe('deployment identity', () => {
  it('requires managed source, release, repository and concurrency for stable deployments', () => {
    expect(managedContext(env).worker).toBe('weapp-dev')
    for (const values of [
      { REPO_DOCS_SOURCE_SHA: 'main' },
      { REPO_DOCS_DEPLOYMENT_ID: '' },
      { REPO_DOCS_RELEASE_ID: '' },
      { GITHUB_REF: 'refs/pull/1/merge' },
      { GITHUB_REPOSITORY: 'fork/repo' },
      { REPO_DOCS_CONCURRENCY_GROUP: 'another-lock' },
      { REPO_DOCS_URL: 'https://other.example' },
    ]) { expect(() => managedContext({ ...env, ...values })).toThrow() }
  })

  it('rejects a built artifact from a different source', () => {
    expect(() => assertIdentity({ sourceSha: 'old' }, { sourceSha: sha })).toThrow(/does not match/)
  })

  it('rejects forks and mismatched PR heads before upload', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-pr-test-'))
    try {
      const eventFile = path.join(cwd, 'event.json')
      const values = { ...env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventFile, PR_NUMBER: '7', PR_HEAD_SHA: sha }
      const event = { number: 7, pull_request: { head: { sha, repo: { full_name: env.GITHUB_REPOSITORY } }, base: { repo: { full_name: env.GITHUB_REPOSITORY } } } }
      await writeFile(eventFile, JSON.stringify(event))
      const context = await prContext('web', values, cwd, { readHead: () => sha })
      expect(context.worker).toBe('weapp-dev-preview')
      expect(context.alias).toBe('pr-7')
      expect(context.identity.deploymentId).toMatch(/^[a-f\d]{64}$/)
      await expect(prContext('web', values, cwd, { readHead: () => 'd'.repeat(40) })).rejects.toThrow(/merge commits cannot be labelled/)
      await expect(prContext('web', { ...values, PR_HEAD_SHA: 'c'.repeat(40) }, cwd)).rejects.toThrow(/trusted event/)
      event.pull_request.head.repo.full_name = 'fork/repo'
      await writeFile(eventFile, JSON.stringify(event))
      await expect(prContext('web', values, cwd)).rejects.toThrow(/trusted event/)
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

describe('Cloudflare provider', () => {
  it('only treats an explicit missing Worker as absent', async () => {
    const values = { CLOUDFLARE_API_TOKEN: 'redacted', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }
    const missing = cloudflareClient(values, async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10007 }] }), { status: 404 }))
    expect(await missing('scripts/new/deployments', true)).toBeUndefined()
    const denied = cloudflareClient(values, async () => new Response('{}', { status: 403 }))
    await expect(denied('scripts/new/deployments', true)).rejects.toThrow(/HTTP 403/)
  })

  it('rejects split traffic rather than guessing the deployed version', async () => {
    await expect(activeVersion(async () => ({ deployments: [{ created_on: '2026-10-23', versions: [{ version_id: version, percentage: 50 }] }] }), 'worker')).rejects.toThrow(/100%/)
  })

  it('requires structured output for the intended Worker and environment', () => {
    const entry = { type: 'deploy', worker_name: 'weapp-dev', version_id: version }
    expect(readWranglerOutput(JSON.stringify(entry), 'weapp-dev', 'deploy').version_id).toBe(version)
    expect(() => readWranglerOutput(JSON.stringify({ ...entry, worker_name: 'other' }), 'weapp-dev', 'deploy')).toThrow()
    expect(() => readWranglerOutput(JSON.stringify({ ...entry, wrangler_environment: 'other' }), 'weapp-dev', 'deploy')).toThrow()
  })

  it('rejects a configuration that could deploy an unrelated artifact or production route', async () => fixture('web', async (context) => {
    await writeFile(context.config, JSON.stringify({ name: context.worker, assets: { directory: '../other/dist' } }))
    await expect(verifyWorkerTarget(context)).rejects.toThrow(/validated site artifact/)
    await writeFile(context.config, JSON.stringify({ name: context.worker, assets: { directory: './dist' }, workers_dev: true, preview_urls: true, routes: [{ pattern: 'weapp.dev' }] }))
    await expect(verifyWorkerTarget({ ...context, channel: 'pr' })).rejects.toThrow(/without production routes/)
  }))

  it('reconciles an already active deployment without running Wrangler', async () => fixture('web', async (context) => {
    const client = vi.fn(async endpoint => endpoint.endsWith('/deployments')
      ? { deployments: [{ created_on: '2026-10-23', versions: [{ version_id: version, percentage: 100 }] }] }
      : { id: version, annotations: { 'workers/message': deploymentMessage(context.identity) } })
    const execute = vi.fn()
    expect(await deployCloudflare(context, { client, run: execute })).toEqual({ versionId: version, url: 'https://weapp.dev' })
    expect(execute).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(context.env.REPO_DOCS_RESULT_FILE, 'utf8')).versionId).toBe(version)
  }))

  it('does not record an uploaded version until the API confirms it active', async () => fixture('web', async (context) => {
    const client = async endpoint => endpoint.endsWith('/deployments')
      ? { deployments: [{ created_on: '2026-10-23', versions: [{ version_id: oldVersion, percentage: 100 }] }] }
      : { id: oldVersion, annotations: { 'workers/message': 'old' } }
    const execute = vi.fn(async (_command, args, options) => {
      expect(args).toContain('deploy')
      await writeFile(options.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: 'deploy', worker_name: context.worker, version_id: version }))
    })
    await expect(deployCloudflare(context, { client, run: execute })).rejects.toThrow(/exact version/)
    await expect(readFile(context.env.REPO_DOCS_RESULT_FILE)).rejects.toMatchObject({ code: 'ENOENT' })
  }))

  it('uploads PR versions without changing active traffic', async () => prFixture(async (context) => {
    const client = async endpoint => endpoint.endsWith('/deployments')
      ? { deployments: [{ created_on: '2026-10-23', versions: [{ version_id: oldVersion, percentage: 100 }] }] }
      : endpoint.endsWith(version)
        ? { id: version, annotations: { 'workers/message': deploymentMessage(context.identity), 'workers/alias': context.alias } }
        : { id: oldVersion, annotations: { 'workers/message': 'existing main preview' } }
    const execute = vi.fn(async (_command, args, options) => {
      expect(args.slice(4, 8)).toEqual(['versions', 'upload', '--preview-alias', 'pr-7'])
      await writeFile(options.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: 'version-upload', worker_name: context.worker, version_id: version, preview_url: 'https://11111111-weapp-dev-preview.account.workers.dev', preview_alias_url: 'https://pr-7-weapp-dev-preview.account.workers.dev' }))
    })
    const result = await uploadPrPreview(context, { client, run: execute })
    expect(result.versionId).toBe(version)
    expect(result.url).toBe('https://11111111-weapp-dev-preview.account.workers.dev')
    await expect(readFile(context.env.REPO_DOCS_RESULT_FILE)).rejects.toMatchObject({ code: 'ENOENT' })
  }))

  it('requires managed initialization without deploying a missing preview Worker from a PR', async () => prFixture(async (context) => {
    const execute = vi.fn()
    await expect(uploadPrPreview(context, { client: async () => undefined, run: execute })).rejects.toThrow(/not initialized/)
    expect(execute).not.toHaveBeenCalled()
  }))

  it.each([false, true])('allows concurrent main preview changes but rejects PR traffic activation (%s)', async activePr => prFixture(async (context) => {
    const nextMainVersion = '33333333-3333-4333-8333-333333333333'
    let reads = 0
    const client = async (endpoint) => {
      if (endpoint.endsWith('/deployments')) {
        const id = reads++ === 0 ? oldVersion : activePr ? version : nextMainVersion
        return { deployments: [{ created_on: '2026-10-23', versions: [{ version_id: id, percentage: 100 }] }] }
      }
      const id = endpoint.split('/').at(-1)
      return { id, annotations: { 'workers/message': id === version ? deploymentMessage(context.identity) : 'main preview', 'workers/alias': context.alias } }
    }
    const execute = async (_command, _args, options) => {
      await writeFile(options.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: 'version-upload', worker_name: context.worker, version_id: version, preview_url: 'https://11111111-weapp-dev-preview.account.workers.dev', preview_alias_url: 'https://pr-7-weapp-dev-preview.account.workers.dev' }))
    }
    const result = uploadPrPreview(context, { client, run: execute })
    if (activePr) {
      await expect(result).rejects.toThrow(/unexpectedly received active Worker traffic/)
    }
    else {
      await expect(result).resolves.toMatchObject({ versionId: version })
    }
  }))

  it.each([
    'https://pr-7-weapp-dev-preview.account.workers.dev',
    'https://22222222-weapp-dev-preview.account.workers.dev',
    'https://11111111-other-worker.account.workers.dev',
  ])('rejects a preview URL that does not identify the verified PR version: %s', async previewUrl => prFixture(async (context) => {
    const client = async endpoint => endpoint.endsWith('/deployments')
      ? { deployments: [{ created_on: '2026-10-23', versions: [{ version_id: oldVersion, percentage: 100 }] }] }
      : endpoint.endsWith(version)
        ? { id: version, annotations: { 'workers/message': deploymentMessage(context.identity), 'workers/alias': context.alias } }
        : { id: oldVersion, annotations: { 'workers/message': 'main preview' } }
    const execute = async (_command, _args, options) => {
      await writeFile(options.env.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: 'version-upload', worker_name: context.worker, version_id: version, preview_url: previewUrl }))
    }
    await expect(uploadPrPreview(context, { client, run: execute })).rejects.toThrow(/invalid preview URL/)
  }))
})

describe('Pages provider', () => {
  it('uploads a tar, persists its request, confirms Pages and checks the served identity', async () => fixture('open-source', async (context) => {
    const store = receiptStore()
    const client = vi.fn(async (endpoint, options) => {
      if (options?.method === 'POST') {
        expect(store.current().phase).toBe('submitting')
        expect(options.body).toEqual({ artifact_id: 42, environment: 'docs-open-source-stable', pages_build_version: identity, oidc_token: 'secret-token' })
        return { id: 'pages-123', page_url: 'https://weapp.js.org/' }
      }
      expect(endpoint).toBe('pages/deployments/pages-123')
      return { status: 'succeed' }
    })
    const artifact = { uploadArtifact: vi.fn(async (_name, files, root) => {
      expect(files).toEqual([path.join(root, 'artifact.tar')])
      return { id: 42 }
    }) }
    const execute = vi.fn(async (_command, args) => {
      expect(args).toContain(context.dist)
    })
    const result = await deployPages(context, { store, client, artifact, run: execute, getIDToken: async () => 'secret-token', fetch: async () => Response.json(context.identity) })
    expect(result).toEqual({ versionId: 'pages-123', url: 'https://weapp.js.org' })
    expect(store.current().phase).toBe('complete')
    expect(artifact.uploadArtifact).toHaveBeenCalledOnce()
  }))

  it('resumes the recorded provider deployment without re-upload or a second POST', async () => fixture('open-source', async (context) => {
    const store = receiptStore({ schemaVersion: 1, deploymentId: identity, phase: 'created', pagesId: 'previous-id' })
    const client = vi.fn(async () => ({ status: 'succeed' }))
    const artifact = { uploadArtifact: vi.fn() }
    const result = await deployPages(context, { store, client, artifact, fetch: async () => Response.json(context.identity) })
    expect(result.versionId).toBe('previous-id')
    expect(client).toHaveBeenCalledExactlyOnceWith('pages/deployments/previous-id')
    expect(artifact.uploadArtifact).not.toHaveBeenCalled()
  }))

  it('retries a definite Pages rejection while preserving the failed attempt', async () => fixture('open-source', async (context) => {
    const store = receiptStore()
    const rejection = Object.assign(new Error('GitHub request failed (HTTP 403).'), { method: 'POST', status: 403 })
    const client = vi.fn()
      .mockRejectedValueOnce(rejection)
      .mockResolvedValueOnce({ id: 'retry-id', page_url: 'https://weapp.js.org/' })
      .mockResolvedValueOnce({ status: 'succeed' })
    const names = new Set()
    const artifact = { uploadArtifact: vi.fn(async (name) => {
      if (names.has(name)) {
        throw new Error('Artifact names cannot be reused within a workflow run')
      }
      names.add(name)
      return { id: 42 }
    }) }
    const options = { store, client, artifact, run: async () => {}, getIDToken: async () => 'secret-token', fetch: async () => Response.json(context.identity) }
    await expect(deployPages(context, options)).rejects.toThrow(/HTTP 403/)
    expect(store.current()).toMatchObject({ phase: 'failed', rejectedStatus: 403 })
    await expect(deployPages(context, options)).resolves.toMatchObject({ versionId: 'retry-id' })
    expect(store.current().previousAttempts).toEqual([{ artifactId: 42, phase: 'failed' }])
    expect(artifact.uploadArtifact).toHaveBeenCalledTimes(2)
    expect(names.size).toBe(2)
  }))

  it.each([409, 500, undefined])('keeps an uncertain Pages creation pending after HTTP %s or a lost response', async status => fixture('open-source', async (context) => {
    const store = receiptStore()
    const error = Object.assign(new Error('provider request uncertain'), { method: 'POST', status })
    const client = vi.fn(async () => {
      throw error
    })
    const artifact = { uploadArtifact: vi.fn(async () => ({ id: 42 })) }
    const options = { store, client, artifact, run: async () => {}, getIDToken: async () => 'secret-token', fetch: async () => new Response('', { status: 404 }), pollLimit: 1, sleep: async () => {} }
    await expect(deployPages(context, options)).rejects.toThrow(/provider request uncertain/)
    expect(store.current().phase).toBe('submitting')
    await expect(deployPages(context, options)).rejects.toThrow(/unknown outcome/)
    expect(client).toHaveBeenCalledOnce()
    expect(artifact.uploadArtifact).toHaveBeenCalledOnce()
  }))

  it('leaves an unknown POST outcome pending and never submits again', async () => fixture('open-source', async (context) => {
    const store = receiptStore({ schemaVersion: 1, deploymentId: identity, phase: 'submitting', artifactId: 42 })
    const client = vi.fn()
    const artifact = { uploadArtifact: vi.fn() }
    await expect(deployPages(context, { store, client, artifact, fetch: async () => new Response('', { status: 404 }), pollLimit: 1, sleep: async () => {} })).rejects.toThrow(/unknown outcome/)
    expect(client).not.toHaveBeenCalled()
    expect(artifact.uploadArtifact).not.toHaveBeenCalled()
    expect(store.current().phase).toBe('submitting')
  }))

  it('recovers a lost POST response only when the exact identity is publicly served', async () => fixture('open-source', async (context) => {
    const store = receiptStore({ schemaVersion: 1, deploymentId: identity, phase: 'submitting', artifactId: 42 })
    const client = vi.fn()
    expect((await deployPages(context, { store, client, fetch: async () => Response.json(context.identity) })).versionId).toBe(identity)
    expect(client).not.toHaveBeenCalled()
    expect(store.current().phase).toBe('complete')
  }))

  it('does not mistake successful Pages status for the expected public artifact', async () => fixture('open-source', async (context) => {
    const store = receiptStore({ schemaVersion: 1, deploymentId: identity, phase: 'created', pagesId: 'previous-id' })
    await expect(deployPages(context, { store, client: async () => ({ status: 'succeed' }), fetch: async () => Response.json({ ...context.identity, sourceSha: 'c'.repeat(40) }), pollLimit: 1, sleep: async () => {} })).rejects.toThrow(/does not match/)
    expect(store.current().phase).toBe('created')
    await expect(readFile(context.env.REPO_DOCS_RESULT_FILE)).rejects.toMatchObject({ code: 'ENOENT' })
  }))

  it('distinguishes terminal failures from timeouts', async () => {
    await expect(waitForPages(async () => ({ status: 'deployment_failed' }), 'id')).rejects.toMatchObject({ deploymentFailed: true })
    await expect(waitForPages(async () => ({ status: 'deployment_in_progress' }), 'id', { pollLimit: 1, sleep: async () => {} })).rejects.toThrow(/Timed out/)
  })

  it('uses a revision compare-and-swap for receipts and fails closed on state access errors', async () => {
    const value = { schemaVersion: 1, deploymentId: identity, phase: 'created', pagesId: 'pages-1' }
    const client = vi.fn(async (_endpoint, options) => options?.method === 'PUT'
      ? { content: { sha: 'next-revision' } }
      : { sha: 'previous-revision', encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') })
    const store = pagesReceiptStore(client, identity)
    expect(await store.read()).toEqual({ value, revision: 'previous-revision' })
    expect(await store.write(value, 'previous-revision')).toBe('next-revision')
    expect(client.mock.calls.at(-1)[1].body.sha).toBe('previous-revision')
    expect(client.mock.calls.at(-1)[1].body.branch).toBe('repoctl-release-state')
    const denied = pagesReceiptStore(async () => {
      throw new Error('permission denied')
    }, identity)
    await expect(denied.read()).rejects.toThrow(/permission denied/)
  })

  it('recovers the revision when a Pages receipt write commits but its response is lost', async () => {
    const value = { schemaVersion: 1, deploymentId: identity, phase: 'submitting', artifactId: 42 }
    let persisted
    const client = vi.fn(async (_endpoint, options) => {
      if (options?.method === 'PUT') {
        persisted = options.body.content
        throw new Error('lost write response')
      }
      return { sha: 'committed-revision', encoding: 'base64', content: persisted }
    })
    expect(await pagesReceiptStore(client, identity).write(value, undefined)).toBe('committed-revision')
    expect(client).toHaveBeenCalledTimes(2)
    expect(client.mock.calls[1][0]).toContain('?ref=repoctl-release-state')
  })

  it.each(['different', 'unreadable'])('does not overwrite or accept %s receipt state after a write failure', async (outcome) => {
    const value = { schemaVersion: 1, deploymentId: identity, phase: 'submitting', artifactId: 42 }
    const client = vi.fn(async (_endpoint, options) => {
      if (options?.method === 'PUT') {
        throw new Error('receipt write conflict')
      }
      if (outcome === 'unreadable') {
        throw new Error('read failed')
      }
      return { sha: 'other-revision', encoding: 'base64', content: Buffer.from(`${JSON.stringify({ ...value, artifactId: 43 })}\n`).toString('base64') }
    })
    await expect(pagesReceiptStore(client, identity).write(value, 'old-revision')).rejects.toThrow(/receipt write conflict/)
    expect(client.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
  })
})

describe('deployment diagnostics', () => {
  it('redacts environment credentials, bearer tokens and runtime JWTs', () => {
    expect(sanitizeMessage('error cf-secret ghp_abc123 Bearer unknown eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature', { CLOUDFLARE_API_TOKEN: 'cf-secret' }))
      .toBe('error [REDACTED] [REDACTED TOKEN] Bearer [REDACTED] [REDACTED JWT]')
  })

  it('writes validated success and failure records in the original workspace without provider internals', async () => fixture('web', async (context) => {
    const values = { GITHUB_WORKSPACE: path.join(context.cwd, 'original'), GITHUB_TOKEN: 'sensitive-token' }
    const result = { versionId: version, url: 'https://weapp.dev', response: { token: 'sensitive-token' } }
    const file = await writeDiagnostic({ context, result, phase: 'complete', env: values, cwd: '/isolated-checkout' })
    expect(file).toBe(path.join(values.GITHUB_WORKSPACE, '.cache/docs-deployment/web-stable.json'))
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ schemaVersion: 1, site: 'web', channel: 'stable', phase: 'complete', status: 'success', identity: context.identity, result: { versionId: version, url: 'https://weapp.dev' } })
    await writeDiagnostic({ context, phase: 'provider', error: new Error('provider sensitive-token Bearer temporary-token'), env: values })
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ status: 'failed', phase: 'provider', message: 'provider [REDACTED] Bearer [REDACTED]' })
    const invalidFile = await writeDiagnostic({ site: '../../outside', channel: '../invalid', phase: 'context', error: new Error('invalid context'), env: values })
    expect(invalidFile).toBe(path.join(values.GITHUB_WORKSPACE, '.cache/docs-deployment/unknown-unknown.json'))
    expect(JSON.parse(await readFile(invalidFile, 'utf8')).identity).toBeUndefined()
  }))
})
