import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pause, run, verifyArtifact, writeResult } from './context.mjs'

export const deploymentMessage = identity => `repoctl-docs:${identity.deploymentId}`

export function cloudflareClient(env, request = fetch) {
  if (!env.CLOUDFLARE_API_TOKEN || !/^[a-f\d]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? '')) {
    throw new Error('Cloudflare deployment requires an API token and account ID.')
  }
  return async (endpoint, allowMissing = false) => {
    const response = await request(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/${endpoint}`, {
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      signal: AbortSignal.timeout(30000),
    })
    const payload = await response.json()
    if (allowMissing && response.status === 404 && payload.errors?.some(error => error.code === 10007)) {
      return undefined
    }
    if (!response.ok || !payload.success) {
      throw new Error(`Cloudflare verification failed (HTTP ${response.status}).`)
    }
    return payload.result
  }
}

export async function activeVersion(client, worker) {
  const result = await client(`scripts/${worker}/deployments`, true)
  if (result === undefined) {
    return undefined
  }
  if (!Array.isArray(result.deployments)) {
    throw new TypeError('Invalid Cloudflare deployments response.')
  }
  const latest = [...result.deployments].sort((a, b) => b.created_on.localeCompare(a.created_on))[0]
  if (!latest) {
    return undefined
  }
  if (latest.versions?.length !== 1 || latest.versions[0].percentage !== 100) {
    throw new Error('The site Worker must serve one active version at 100% traffic.')
  }
  const id = latest.versions[0].version_id
  if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) {
    throw new Error('Invalid Cloudflare active version ID.')
  }
  const version = await client(`scripts/${worker}/versions/${id}`)
  if (version.id !== id) {
    throw new Error('Cloudflare version identity mismatch.')
  }
  return { id, message: version.annotations?.['workers/message'] }
}

export function readWranglerOutput(output, worker, type) {
  const entries = output.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))
  const result = entries.findLast(entry => entry.type === type && entry.worker_name === worker && !entry.wrangler_environment)
  if (typeof result?.version_id !== 'string' || !/^[a-f\d-]{36}$/i.test(result.version_id)) {
    throw new Error(`Wrangler did not report a ${type} version for ${worker}.`)
  }
  return result
}

export async function verifyWorkerTarget(context) {
  // These repository-owned JSONC files deliberately use JSON syntax so target
  // validation does not execute config code or depend on Wrangler internals.
  const config = JSON.parse(await readFile(context.config, 'utf8'))
  if (config.name !== context.worker || typeof config.assets?.directory !== 'string'
    || path.resolve(path.dirname(context.config), config.assets.directory) !== context.dist) {
    throw new Error('Wrangler configuration does not target this Worker and validated site artifact.')
  }
  if (context.channel !== 'stable' && (config.route || config.routes?.length || config.workers_dev !== true || config.preview_urls !== true)) {
    throw new Error('Preview Workers require workers.dev and version previews without production routes.')
  }
}

async function invokeWrangler(context, args, execute) {
  const directory = await mkdtemp(path.join(tmpdir(), 'weapp-docs-wrangler-'))
  const output = path.join(directory, 'output.jsonl')
  try {
    await execute('pnpm', ['--filter', '@weapp-io/web', 'exec', 'wrangler', ...args, '--config', context.config, '--message', deploymentMessage(context.identity)], {
      cwd: context.cwd,
      env: { ...context.env, WRANGLER_OUTPUT_FILE_PATH: output },
    })
    return await readFile(output, 'utf8')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function workerUrl(context, client) {
  if (context.url) {
    return context.url
  }
  const result = await client('subdomain')
  if (!/^[a-z\d-]+$/.test(result?.subdomain ?? '')) {
    throw new Error('Cloudflare account has no valid workers.dev subdomain.')
  }
  return `https://${context.worker}.${result.subdomain}.workers.dev`
}

async function confirmActiveVersion(client, worker, versionId, expected, options) {
  const limit = options.pollLimit ?? 30
  for (let attempt = 0; attempt < limit; attempt++) {
    const active = await activeVersion(client, worker)
    if (active?.id === versionId) {
      if (active.message !== expected) {
        throw new Error('The uploaded Cloudflare version has an unexpected deployment identity.')
      }
      return active
    }
    // The deploy command can finish before the read API reflects activation.
    // Only observe the known upload; a delayed read must never trigger a write.
    if (attempt + 1 < limit) {
      await (options.sleep ?? pause)(2000)
    }
  }
  throw new Error('Cloudflare did not confirm this exact version at 100% traffic; retry the same deployment.')
}

export async function deployCloudflare(context, options = {}) {
  if (!context.worker) {
    throw new Error('This site channel does not use Cloudflare.')
  }
  await verifyWorkerTarget(context)
  await verifyArtifact(context)
  const client = options.client ?? cloudflareClient(context.env, options.fetch)
  const expected = deploymentMessage(context.identity)
  let active = await activeVersion(client, context.worker)
  if (active?.message !== expected) {
    const output = await invokeWrangler(context, ['deploy'], options.run ?? run)
    const uploaded = readWranglerOutput(output, context.worker, 'deploy')
    active = await confirmActiveVersion(client, context.worker, uploaded.version_id, expected, options)
  }
  return writeResult(context, { versionId: active.id, url: await workerUrl(context, client) })
}

export async function uploadPrPreview(context, options = {}) {
  if (context.channel !== 'pr' || !context.alias) {
    throw new Error('Version preview requires a verified PR context.')
  }
  await verifyWorkerTarget(context)
  await verifyArtifact(context)
  const client = options.client ?? cloudflareClient(context.env, options.fetch)
  const before = await activeVersion(client, context.worker)
  if (!before) {
    throw new Error(`Preview Worker ${context.worker} is not initialized. Run its managed main preview deployment before uploading PR versions.`)
  }
  const output = await invokeWrangler(context, ['versions', 'upload', '--preview-alias', context.alias], options.run ?? run)
  const uploaded = readWranglerOutput(output, context.worker, 'version-upload')
  const version = await client(`scripts/${context.worker}/versions/${uploaded.version_id}`)
  if (version.id !== uploaded.version_id || version.annotations?.['workers/message'] !== deploymentMessage(context.identity)
    || version.annotations?.['workers/alias'] !== context.alias) {
    throw new Error('Cloudflare did not confirm the uploaded PR version identity.')
  }
  const after = await activeVersion(client, context.worker)
  if (after?.id === uploaded.version_id) {
    throw new Error('The PR upload version unexpectedly received active Worker traffic; inspect the deployment.')
  }
  // PR jobs may be cancelled while Cloudflare is still finishing an upload.
  // A reusable alias can therefore move independently of this job's SHA; only
  // the version URL is a stable link to the artifact verified above.
  const url = uploaded.preview_url
  const parsed = new URL(url)
  const suffix = `-${context.worker}.`
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/'
    || parsed.search || parsed.hash || !parsed.hostname.endsWith('.workers.dev')
    || !parsed.hostname.startsWith(`${uploaded.version_id.slice(0, 8)}${suffix}`)) {
    throw new Error('Wrangler returned an invalid preview URL.')
  }
  return { versionId: uploaded.version_id, url }
}
