import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

export const identityFilename = 'repoctl-deployment.json'
export const sites = {
  'web': { directory: 'apps/web', worker: 'weapp-dev', previewWorker: 'weapp-dev-preview', stableUrl: 'https://weapp.dev' },
  'open-source': { directory: 'apps/open-source', previewWorker: 'weapp-open-source-preview', stableUrl: 'https://weapp.js.org' },
}

export function managedContext(env = process.env, cwd = process.cwd()) {
  const site = env.REPO_DOCS_SITE
  const channel = env.REPO_DOCS_CHANNEL
  if (!Object.hasOwn(sites, site ?? '') || !['preview', 'stable'].includes(channel)
    || !/^[a-f\d]{40}$/.test(env.REPO_DOCS_SOURCE_SHA ?? '')
    || !/^[a-f\d]{64}$/.test(env.REPO_DOCS_DEPLOYMENT_ID ?? '')
    || !env.REPO_DOCS_RESULT_FILE) {
    throw new Error('Deployment requires repo docs deploy with a complete site, channel and source identity.')
  }
  if (env.GITHUB_ACTIONS !== 'true' || !env.GITHUB_RUN_ID || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_REPOSITORY !== 'weappjs/weapp.dev'
    || env.REPO_DOCS_CONCURRENCY_GROUP !== `docs-${site}-${channel}`) {
    throw new Error('Deployment requires the managed main workflow and matching site concurrency group.')
  }
  if (channel === 'stable' && !env.REPO_DOCS_RELEASE_ID) {
    throw new Error('Stable deployment requires a completed release record.')
  }
  const target = sites[site]
  const url = env.REPO_DOCS_URL || (channel === 'stable' ? target.stableUrl : undefined)
  if (url && (new URL(url).protocol !== 'https:' || (channel === 'stable' && url !== target.stableUrl))) {
    throw new Error('Unexpected deployment URL.')
  }
  return {
    site,
    channel,
    env,
    cwd,
    url,
    directory: path.join(cwd, target.directory),
    dist: path.join(cwd, target.directory, 'dist'),
    worker: channel === 'stable' ? target.worker : target.previewWorker,
    config: path.join(cwd, target.directory, channel === 'stable' ? 'wrangler.jsonc' : 'wrangler.preview.jsonc'),
    identity: {
      schemaVersion: 1,
      site,
      channel,
      sourceSha: env.REPO_DOCS_SOURCE_SHA,
      releaseId: env.REPO_DOCS_RELEASE_ID || '',
      deploymentId: env.REPO_DOCS_DEPLOYMENT_ID,
    },
  }
}

export function buildIdentity(env = process.env) {
  return {
    schemaVersion: 1,
    site: env.REPO_DOCS_SITE,
    channel: env.REPO_DOCS_CHANNEL || 'preview',
    sourceSha: env.REPO_DOCS_SOURCE_SHA || '',
    releaseId: env.REPO_DOCS_RELEASE_ID || '',
    deploymentId: env.REPO_DOCS_DEPLOYMENT_ID || '',
  }
}

export async function writeBuildIdentity(dist, env = process.env) {
  await writeFile(path.join(dist, identityFilename), `${JSON.stringify(buildIdentity(env))}\n`)
}

export function assertIdentity(actual, expected) {
  if (!actual || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
    throw new Error('The site artifact does not match this deployment identity; rebuild the selected source.')
  }
}

export async function verifyArtifact(context) {
  assertIdentity(JSON.parse(await readFile(path.join(context.dist, identityFilename), 'utf8')), context.identity)
}

export async function prContext(site, env = process.env, cwd = process.cwd(), options = {}) {
  if (!Object.hasOwn(sites, site) || env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'pull_request'
    || env.GITHUB_REPOSITORY !== 'weappjs/weapp.dev' || !env.GITHUB_EVENT_PATH) {
    throw new Error('PR previews require a same-repository pull_request workflow.')
  }
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'))
  const pr = event.pull_request
  if (pr?.head?.repo?.full_name !== env.GITHUB_REPOSITORY || pr?.base?.repo?.full_name !== env.GITHUB_REPOSITORY
    || String(event.number) !== env.PR_NUMBER || pr.head.sha !== env.PR_HEAD_SHA
    || !/^[a-f\d]{40}$/.test(env.PR_HEAD_SHA ?? '') || !/^[1-9]\d*$/.test(env.PR_NUMBER ?? '')) {
    throw new Error('PR preview identity does not match the trusted event.')
  }
  const readHead = options.readHead ?? (() => execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  }).trim())
  if (await readHead() !== env.PR_HEAD_SHA) {
    throw new Error('PR preview checkout must be the exact PR head SHA; merge commits cannot be labelled as the PR source.')
  }
  const target = sites[site]
  const deploymentId = createHash('sha256').update(`${env.GITHUB_REPOSITORY}:${site}:${env.PR_NUMBER}:${env.PR_HEAD_SHA}`).digest('hex')
  return {
    site,
    channel: 'pr',
    cwd,
    env,
    worker: target.previewWorker,
    config: path.join(cwd, target.directory, 'wrangler.preview.jsonc'),
    directory: path.join(cwd, target.directory),
    dist: path.join(cwd, target.directory, 'dist'),
    alias: `pr-${env.PR_NUMBER}`,
    identity: { schemaVersion: 1, site, channel: 'pr', sourceSha: env.PR_HEAD_SHA, releaseId: '', deploymentId },
  }
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options })
    child.on('error', reject)
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal || code}).`)))
  })
}

export const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function writeResult(context, result) {
  if (!result.versionId || !result.url || new URL(result.url).protocol !== 'https:') {
    throw new Error('Invalid provider deployment result.')
  }
  await writeFile(context.env.REPO_DOCS_RESULT_FILE, `${JSON.stringify(result)}\n`)
  return result
}
