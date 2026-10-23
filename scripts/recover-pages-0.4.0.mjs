import { strict as assert } from 'node:assert'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const repository = 'weappjs/weapp.dev'
const sourceSha = '0b26eea7da1b67f66d31b639e5bd11087b5295d6'
const releaseId = '719206ee91ab8028f980ed8a0981fd72d4ce3c255e611094c1f774d9f3e490c9'
const deploymentId = 'addbffafaaf1fca47b893343905e0dd4f005aaad22e96b2dd65f44c3d01e9ed2'
const artifactId = 12505735843
const originalRun = 39960105796
const zipDigest = '35a102604b34007ec658b8decacf6118f02fb6634a989e9f1904bbe766c9eaf1'
const artifactName = 'pages-open-source-addbffafaaf1-39960105796-1-f1a54a1c-3272-497a-831d-d6d74812d095'
const source = path.resolve('.recovery/source')
const evidence = path.resolve('.cache/pages-recovery')
const resultFile = path.join(evidence, 'result.json')
const token = process.env.GITHUB_TOKEN
assert.equal(process.env.GITHUB_ACTIONS, 'true')
assert.equal(process.env.GITHUB_REPOSITORY, repository)
assert.equal(process.env.GITHUB_REF, 'refs/heads/main')
assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch')
assert.equal(process.env.REPO_DOCS_CONCURRENCY_GROUP, 'docs-open-source-stable')
assert.ok(token)
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), sourceSha)
await mkdir(evidence, { recursive: true })
const moduleAt = filename => import(pathToFileURL(path.join(source, 'scripts/docs-deployment', filename)).href)
const { deployPages } = await moduleAt('pages.mjs')
const { githubClient, pagesReceiptStore } = await moduleAt('github.mjs')
const { managedContext, assertIdentity } = await moduleAt('context.mjs')
const { sanitizeMessage } = await moduleAt('diagnostics.mjs')
const apiEvidence = []
async function safeFetch(input, options) {
  const response = await fetch(input, options)
  const url = new URL(input)
  if (url.origin === 'https://api.github.com') {
    const item = { method: options?.method || 'GET', path: url.pathname, status: response.status, requestId: response.headers.get('x-github-request-id') }
    if (!response.ok) {
      try {
        const body = await response.clone().json()
        if (typeof body.message === 'string') {
          item.message = sanitizeMessage(body.message).slice(0, 2000)
        }
      }
      catch {}
    }
    apiEvidence.push(item)
    await writeFile(path.join(evidence, 'api.json'), `${JSON.stringify(apiEvidence, null, 2)}\n`)
    console.log(JSON.stringify(item))
  }
  return response
}
const env = {
  ...process.env,
  REPO_DOCS_SITE: 'open-source',
  REPO_DOCS_CHANNEL: 'stable',
  REPO_DOCS_SOURCE_SHA: sourceSha,
  REPO_DOCS_RELEASE_ID: releaseId,
  REPO_DOCS_DEPLOYMENT_ID: deploymentId,
  REPO_DOCS_RESULT_FILE: resultFile,
}
const client = githubClient(env, safeFetch)
async function providerClient(endpoint, options = {}) {
  if (options.method === 'POST') {
    assert.equal(endpoint, 'pages/deployments')
    assert.equal(options.body.pages_build_version, deploymentId)
    // Provider compatibility translation only: Pages requires a real source
    // commit for build-version lookup. The frozen artifact and full repoctl
    // identity remain unchanged in the public file and provider receipt.
    return client(endpoint, { ...options, body: { ...options.body, pages_build_version: sourceSha } })
  }
  return client(endpoint, options)
}
const context = managedContext(env, source)
const store = pagesReceiptStore(client, deploymentId)
async function readState(filename) {
  const file = await client(`contents/${filename}?ref=repoctl-release-state`)
  assert.equal(file.encoding, 'base64')
  return { revision: file.sha, value: JSON.parse(Buffer.from(file.content, 'base64').toString()) }
}
async function guard() {
  const record = (await readState(`.repoctl-automation/releases/${releaseId}.json`)).value
  assert.equal(record.id, releaseId)
  assert.equal(record.repository, repository)
  assert.equal(record.sourceSha, sourceSha)
  assert.equal(record.branch, 'main')
  assert.equal(record.distTag, 'latest')
  assert.deepEqual(record.packages, [{ name: 'weapp', version: '0.4.0', sourceSha }])
  assert.deepEqual(record.releasedPackages, ['weapp'])
  const pending = (await readState('.repoctl-automation/docs/open-source/stable.json')).value
  assert.equal(pending.repository, repository)
  assert.equal(pending.site, 'open-source')
  assert.equal(pending.channel, 'stable')
  assert.equal(pending.pending?.phase, 'deploying')
  assert.equal(pending.pending.deploymentId, deploymentId)
  assert.equal(pending.pending.snapshot.sourceSha, sourceSha)
  assert.equal(pending.pending.snapshot.releaseId, releaseId)
  assert.deepEqual(pending.pending.snapshot.commits, [])
  assert.deepEqual(pending.pending.snapshot.requestedCommits, [])
  const receipt = await store.read()
  assert.ok(receipt.value, 'Existing Pages provider receipt required')
  assert.equal(receipt.value.deploymentId, deploymentId)
  if (receipt.value.phase === 'failed') {
    assert.equal(receipt.value.rejectedStatus, 404, 'Only the explicit initial 404 rejection may create a replacement')
    assert.equal(receipt.value.artifactId, artifactId)
    assert.equal(receipt.value.runId, String(originalRun))
    assert.equal(receipt.value.pagesId, undefined)
    assert.deepEqual(receipt.value.previousAttempts, [])
  }
  else {
    assert.ok(['submitting', 'created', 'complete'].includes(receipt.value.phase))
    // A prior invocation may already have submitted. The frozen adapter will
    // reuse its Pages ID or check public identity; it will not POST again.
  }
  return receipt
}

const metadata = await client(`actions/artifacts/${artifactId}`)
assert.equal(metadata.id, artifactId)
assert.equal(metadata.name, artifactName)
assert.equal(metadata.expired, false)
assert.equal(metadata.digest, `sha256:${zipDigest}`)
assert.equal(metadata.size_in_bytes, 1774700)
assert.equal(metadata.workflow_run.id, originalRun)
assert.equal(metadata.workflow_run.repository_id, 1346469709)
assert.equal(metadata.workflow_run.head_repository_id, 1346469709)
assert.equal(metadata.workflow_run.head_branch, 'main')
assert.equal(metadata.workflow_run.head_sha, sourceSha)
await guard()
const temporary = await mkdtemp(path.join(tmpdir(), 'weapp-pages-recovery-'))
try {
  // Read the signed redirect separately; never send GITHUB_TOKEN to storage.
  const archive = await safeFetch(`https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  })
  assert.equal(archive.status, 302)
  const location = new URL(archive.headers.get('location'))
  assert.equal(location.protocol, 'https:')
  assert.equal(location.username, '')
  assert.equal(location.password, '')
  const downloaded = await fetch(location, { signal: AbortSignal.timeout(60000) })
  assert.equal(downloaded.status, 200)
  const bytes = Buffer.from(await downloaded.arrayBuffer())
  assert.equal(bytes.byteLength, 1774700)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), zipDigest)
  const archiveFile = path.join(temporary, 'archive.zip')
  const tarFile = path.join(temporary, 'artifact.tar')
  await writeFile(archiveFile, bytes)
  // Validate every member before writing. No links, devices, absolute paths,
  // traversal, duplicate paths or archives exceeding the bounded size.
  execFileSync('python3', ['-c', `
import json,pathlib,sys,tarfile,zipfile
archive,tar_path,dist=map(pathlib.Path,sys.argv[1:])
limit=100*1024*1024
with zipfile.ZipFile(archive) as z:
    assert z.namelist()==['artifact.tar'], 'Unexpected ZIP members'
    item=z.getinfo('artifact.tar')
    assert item.file_size <= limit and not item.flag_bits & 1, 'Invalid tar entry'
    tar_path.write_bytes(z.read(item))
with tarfile.open(tar_path,mode='r:') as t:
    members=t.getmembers()
    assert len(members)<=10000 and sum(m.size for m in members)<=limit
    paths=set()
    for member in members:
        p=pathlib.PurePosixPath(member.name)
        assert not p.is_absolute() and '..' not in p.parts and '\\\\' not in member.name, 'Unsafe tar path'
        assert member.isfile() or member.isdir(), 'Unsupported tar member'
        normalized=str(p)
        assert normalized not in paths, 'Duplicate tar path'
        paths.add(normalized)
    assert 'repoctl-deployment.json' in paths and 'CNAME' in paths
    dist.mkdir(parents=True,exist_ok=False)
    for member in members:
        destination=dist/pathlib.PurePosixPath(member.name)
        if member.isdir(): destination.mkdir(parents=True,exist_ok=True)
        else:
            destination.parent.mkdir(parents=True,exist_ok=True)
            with t.extractfile(member) as stream: destination.write_bytes(stream.read())
`, archiveFile, tarFile, context.dist], { stdio: ['ignore', 'pipe', 'pipe'] })
  const identity = JSON.parse(await readFile(path.join(context.dist, 'repoctl-deployment.json'), 'utf8'))
  assertIdentity(identity, context.identity)
  assert.equal((await readFile(path.join(context.dist, 'CNAME'), 'utf8')).trim(), 'weapp.js.org')
  const tarDigest = createHash('sha256').update(await readFile(tarFile)).digest('hex')
  await writeFile(path.join(evidence, 'verified-artifact.json'), `${JSON.stringify({ artifactId, originalRun, zipDigest, tarDigest, identity }, null, 2)}\n`)
  const receipt = await guard()
  const sdkRoot = path.join(source, 'node_modules/@actions/artifact')
  const sdkManifest = JSON.parse(await readFile(path.join(sdkRoot, 'package.json'), 'utf8'))
  assert.equal(sdkManifest.version, '6.3.1')
  const { DefaultArtifactClient } = await import(pathToFileURL(path.join(sdkRoot, 'lib/artifact.js')).href)
  const sdk = new DefaultArtifactClient()
  let uploadCount = 0
  const artifact = {
    async uploadArtifact(name, files, root, options) {
      assert.equal(++uploadCount, 1)
      assert.equal(receipt.value.phase, 'failed', 'Recovery must not upload for an uncertain existing submission')
      assert.equal(files.length, 1)
      assert.equal(createHash('sha256').update(await readFile(files[0])).digest('hex'), tarDigest)
      const uploaded = await sdk.uploadArtifact(name, files, root, options)
      assert.ok(uploaded.id && uploaded.id !== artifactId)
      await writeFile(path.join(evidence, 'new-artifact.json'), `${JSON.stringify({ id: uploaded.id, originalArtifactId: artifactId, tarDigest, runId: process.env.GITHUB_RUN_ID })}\n`)
      return uploaded
    },
  }
  const execute = async (command, args) => {
    assert.equal(command, 'tar')
    const output = args[args.indexOf('-cf') + 1]
    assert.ok(output && path.basename(output) === 'artifact.tar')
    await copyFile(tarFile, output)
  }
  const result = await deployPages(context, { client: providerClient, store, artifact, run: execute, fetch: safeFetch })
  await writeFile(path.join(evidence, 'completed.json'), `${JSON.stringify({ result, uploadCount, sourceSha, releaseId, deploymentId })}\n`)
  console.log(JSON.stringify({ result, uploadCount, next: 'Resume the same release with the managed repo docs workflow to finalize its state.' }))
}
catch (error) {
  await writeFile(path.join(evidence, 'failure.json'), `${JSON.stringify({ message: sanitizeMessage(error.message).slice(0, 4000) })}\n`)
  throw new Error(sanitizeMessage(error.message))
}
finally {
  await rm(temporary, { recursive: true, force: true })
  await rm(context.dist, { recursive: true, force: true })
}
