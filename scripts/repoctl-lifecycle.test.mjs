import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createReleasePullRequest, deployDocs, planDocsDeployment, releaseCi } from 'repoctl'
import { it } from 'vitest'

const candidate = { name: 'weapp', version: '0.3.0' }
const repository = 'weappjs/weapp.dev'
const releaseConfig = { branches: { stable: 'main', prerelease: [] }, qualityScripts: [] }
const site = {
  packages: ['weapp'],
  buildScript: 'site:build',
  preview: { deployScript: 'site:deploy', url: 'https://preview.example.invalid' },
  stable: { deployScript: 'site:deploy', url: 'https://weapp.dev' },
  patchPaths: [],
}
const docsConfig = { sites: { web: site } }

async function write(cwd, filename, content) {
  const target = path.join(cwd, filename)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

// Exercise the installed public API against real temporary Git history. Only
// Git commands can execute; npm and GitHub transports are deterministic fakes.
async function withLifecycle(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-lifecycle-')))
  const cwd = path.join(directory, 'workspace')
  try {
    await mkdir(cwd)
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (/^(?:GIT_|GITHUB_|GH_|NPM_CONFIG_|npm_config_)/.test(key) || /TOKEN|AUTH|PROXY/i.test(key)) {
        delete env[key]
      }
    }
    Object.assign(env, {
      GITHUB_REPOSITORY: repository,
      GITHUB_REF_NAME: 'main',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_ACTIONS: 'true',
      GITHUB_RUN_ID: 'fixture-1',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      npm_config_registry: 'https://registry.npmjs.org',
      npm_config_userconfig: path.join(directory, 'empty-user.npmrc'),
      npm_config_globalconfig: path.join(directory, 'empty-global.npmrc'),
      COREPACK_ENABLE_NETWORK: '0',
      LEFTHOOK: '0',
    })
    await writeFile(env.npm_config_userconfig, '')
    await writeFile(env.npm_config_globalconfig, '')
    const calls = []
    let publishTransport
    const execute = (command, args, options = {}) => {
      calls.push({ command, args })
      assert.equal(path.resolve(options.cwd ?? cwd), cwd)
      if (command === 'pnpm' && args[0] === 'publish' && publishTransport) {
        return publishTransport(args)
      }
      assert.equal(command, 'git', `Unexpected subprocess: ${command} ${args.join(' ')}`)
      return spawnSync(command, args, { ...options, cwd, env, encoding: 'utf8', stdio: 'pipe', timeout: 10000 })
    }
    const git = (...args) => {
      const result = execute('git', args)
      assert.equal(result.status, 0, result.stderr || result.error?.message)
      return result.stdout.trim()
    }
    await write(cwd, 'package.json', `${JSON.stringify({ name: 'release-fixture', version: '0.0.0', private: true, packageManager: 'pnpm@12.8.1', scripts: { 'site:build': 'true', 'site:deploy': 'true' } })}\n`)
    await write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
    await write(cwd, 'repoctl.config.mjs', `export default ${JSON.stringify({ commands: { release: releaseConfig, docs: docsConfig } })}\n`)
    await write(cwd, '.gitignore', '.cache/\nrepoctl-*-progress.json\npnpm-publish-summary.json\n')
    await write(cwd, 'packages/weapp/package.json', `${JSON.stringify({ ...candidate, version: '0.2.0' })}\n`)
    await write(cwd, 'packages/weapp/index.js', 'export const source = "released"\n')
    git('init', '--initial-branch=main')
    git('config', 'user.name', 'Lifecycle fixture')
    git('config', 'user.email', 'lifecycle@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    git('add', '-A')
    git('commit', '-m', 'feat: previous release')
    await write(cwd, 'packages/weapp/package.json', `${JSON.stringify(candidate)}\n`)
    await write(cwd, 'packages/weapp/CHANGELOG.md', '# weapp\n\n## 0.3.0\n\n### Minor Changes\n\n- Add the new CLI.\n\n## 0.2.0\n\n- Previous release.\n')
    await write(cwd, '.changeset/ledger.yaml', 'weapp@0.3.0:\n  dir: packages/weapp\n  intents:\n    - prior-release\n')
    git('add', '-A')
    git('commit', '-m', 'chore(release): version packages')
    const source = git('rev-parse', 'HEAD')
    const remote = path.join(directory, 'origin.git')
    git('init', '--bare', remote)
    git('remote', 'add', 'origin', remote)
    git('push', '-u', 'origin', 'main')
    const states = new Map()
    const automation = new Map()
    const releases = new Map()
    const tags = new Map()
    const writes = []
    let rejectMetadata = false
    let registryPresent = true
    let remoteHead = source
    const cas = (map, key, value, revision, kind) => {
      assert.equal(revision, map.get(key)?.revision, `${kind} must use the previous revision`)
      const next = String(Number(revision || 0) + 1)
      map.set(key, { revision: next, [kind]: structuredClone(value) })
      writes.push({ key, value: structuredClone(value) })
      return next
    }
    const github = {
      readReleaseState: async key => structuredClone(states.get(key)),
      writeReleaseState: async (key, state, revision) => cas(states, key, state, revision, 'state'),
      readAutomationState: async key => structuredClone(automation.get(key)),
      writeAutomationState: async (key, value, revision) => cas(automation, key, value, revision, 'value'),
      readBranchHead: async () => remoteHead,
      listReleases: async () => [...releases.values()],
      readTagTarget: async tag => tags.get(tag),
      ensureTag: async ({ tag, target }) => {
        assert.equal(target, source)
        tags.set(tag, target)
      },
      ensureRelease: async (request) => {
        if (rejectMetadata) {
          throw new Error('simulated metadata interruption')
        }
        const release = { id: 1, tag_name: request.tag, target_commitish: request.target, draft: false, prerelease: false, html_url: 'https://example.invalid/release/1' }
        releases.set(request.tag, release)
        return release
      },
      ensurePullRequest: async () => { throw new Error('Unexpected release PR write') },
    }
    const requests = []
    const registryFetch = async (url, options) => {
      assert.equal(options.method ?? 'GET', 'GET')
      requests.push(String(url))
      const pathname = new URL(url).pathname
      if (pathname === '/-/package/weapp/dist-tags') {
        return Response.json({ latest: '0.3.0' })
      }
      assert.equal(pathname, '/weapp/0.3.0')
      return registryPresent ? Response.json({ ...candidate, gitHead: source }) : new Response('{}', { status: 404 })
    }
    const options = { cwd, env, branch: 'main', config: releaseConfig, spawn: execute, github, registryFetch, sleep: async () => {} }
    const completeRelease = async () => {
      await releaseCi({ ...options, mode: 'publish' })
      const record = [...automation.entries()].find(([key]) => key.startsWith('releases/'))?.[1].value
      assert.ok(record, 'Only the real completed release lifecycle may establish the docs baseline')
      return record
    }
    await run({
      cwd,
      source,
      env,
      git,
      options,
      calls,
      writes,
      states,
      automation,
      tags,
      releases,
      requests,
      completeRelease,
      setRegistryPresent(value) {
        registryPresent = value
      },
      setRejectMetadata(value) {
        rejectMetadata = value
      },
      setRemoteHead(value) {
        remoteHead = value
      },
      setPublishTransport(value) {
        publishTransport = value
      },
    })
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

it.each(['unpublished', 'unfinished checkpoint'])('blocks new intents when the prepared previous version is %s', async failure => withLifecycle(async (fixture) => {
  const { cwd, source, options, calls, git } = fixture
  await write(cwd, '.changeset/new-release.md', '---\n"weapp": minor\n---\n\nAnother change.\n')
  git('add', '-A')
  git('commit', '-m', 'feat: another change')
  const head = git('rev-parse', 'HEAD')
  if (failure === 'unpublished') {
    fixture.setRegistryPresent(false)
  }
  else {
    fixture.tags.set('weapp@0.3.0', source)
    fixture.releases.set('weapp@0.3.0', { tag_name: 'weapp@0.3.0', draft: false, prerelease: false })
    options.github.readReleaseState = async () => ({ revision: '1', state: { schemaVersion: 1, complete: false, packages: [{ ...candidate, target: source }] } })
  }
  await assert.rejects(createReleasePullRequest(options), /Prepared releases must finish before consuming new intents/)
  assert.equal(git('rev-parse', 'HEAD'), head)
  assert.equal(git('status', '--porcelain'), '')
  assert.equal(JSON.parse(await readFile(path.join(cwd, 'packages/weapp/package.json'), 'utf8')).version, '0.3.0')
  assert.ok(await readFile(path.join(cwd, '.changeset/new-release.md'), 'utf8'))
  assert.equal(calls.some(call => call.command === 'pnpm'), false)
}), 30000)

it('recovers stable publication after metadata interruption without uploading an accepted version again', async () => withLifecycle(async (fixture) => {
  fixture.setRejectMetadata(true)
  await assert.rejects(releaseCi({ ...fixture.options, mode: 'publish' }), /simulated metadata interruption/)
  const interrupted = [...fixture.states.values()][0].state
  assert.equal(interrupted.npm, 'complete')
  assert.equal(interrupted.complete, false)
  assert.deepEqual(interrupted.accepted, [candidate])
  assert.equal(fixture.automation.size, 0)
  fixture.setRejectMetadata(false)
  const completion = await fixture.completeRelease()
  assert.equal(completion.sourceSha, fixture.source)
  assert.deepEqual(completion.packages, [{ ...candidate, sourceSha: fixture.source }])
  assert.equal([...fixture.states.values()][0].state.complete, true)
  assert.equal(fixture.calls.some(call => call.args.includes('publish')), false)
  assert.equal(fixture.git('for-each-ref', '--format=%(refname)', 'refs/tags'), '')
}), 30000)

it('resumes an interrupted upload command from its accepted package evidence without uploading it twice', async () => withLifecycle(async (fixture) => {
  fixture.setRegistryPresent(false)
  fixture.setPublishTransport((args) => {
    assert.deepEqual(args.slice(-4), ['--tag', 'latest', '--filter', 'weapp'])
    writeFileSync(path.join(fixture.cwd, 'pnpm-publish-summary.json'), JSON.stringify({ publishedPackages: [candidate] }))
    fixture.setRegistryPresent(true)
    return { status: 1, stdout: '', stderr: 'simulated command interruption after acceptance' }
  })
  await assert.rejects(releaseCi({ ...fixture.options, mode: 'publish' }), /command failed: pnpm publish/)
  const interrupted = [...fixture.states.values()][0].state
  assert.deepEqual(interrupted.accepted, [candidate])
  assert.equal(interrupted.npm, 'failed')
  assert.equal(interrupted.complete, false)
  const record = await fixture.completeRelease()
  assert.equal(record.sourceSha, fixture.source)
  assert.equal([...fixture.states.values()][0].state.complete, true)
  assert.equal(fixture.calls.filter(call => call.command === 'pnpm' && call.args[0] === 'publish').length, 1)
}), 30000)

it('keeps a missing docs result pending and retries the frozen release source and configuration after main advances', async () => withLifecycle(async (fixture) => {
  const record = await fixture.completeRelease()
  let produceResult = false
  const commands = []
  const spawn = (command, args, settings) => {
    assert.equal(command, 'pnpm')
    assert.notEqual(settings.cwd, fixture.cwd)
    assert.equal(settings.env.REPO_DOCS_SOURCE_SHA, fixture.source)
    assert.equal(settings.env.REPO_DOCS_RELEASE_ID, record.id)
    assert.equal(readFileSync(path.join(settings.cwd, 'packages/weapp/index.js'), 'utf8'), 'export const source = "released"\n')
    assert.equal(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: settings.cwd, encoding: 'utf8' }).stdout.trim(), fixture.source)
    commands.push(args.join(' '))
    if (args[1] === 'site:deploy' && produceResult) {
      writeFileSync(settings.env.REPO_DOCS_RESULT_FILE, JSON.stringify({ versionId: 'provider-version', url: 'https://weapp.dev' }))
    }
    return { status: 0, stdout: '', stderr: '' }
  }
  const options = { cwd: fixture.cwd, site: 'web', channel: 'stable', release: record.id, config: docsConfig, github: fixture.options.github, env: { ...fixture.env, REPO_DOCS_CONCURRENCY_GROUP: 'docs-web-stable' }, spawn }
  await assert.rejects(deployDocs(options), /did not produce valid JSON at REPO_DOCS_RESULT_FILE/)
  const pending = fixture.automation.get('docs/web/stable').value
  assert.equal(pending.pending.phase, 'deploying')
  assert.equal(pending.current, undefined)
  const deploymentId = pending.pending.deploymentId
  await write(fixture.cwd, 'packages/weapp/index.js', 'export const source = "unreleased main"\n')
  fixture.git('add', '-A')
  fixture.git('commit', '-m', 'feat: unreleased change')
  fixture.git('push', 'origin', 'main')
  fixture.setRemoteHead(fixture.git('rev-parse', 'HEAD'))
  await assert.rejects(deployDocs({ ...options, release: 'd'.repeat(64) }), /unfinished deploying operation/)
  await assert.rejects(planDocsDeployment({ ...options, sourceSha: fixture.git('rev-parse', 'HEAD') }), /never an arbitrary source SHA/)
  produceResult = true
  const recovered = await deployDocs({ ...options, config: { sites: { web: { ...site, buildScript: 'unreleased:build', stable: { deployScript: 'unreleased:deploy' } } } } })
  assert.equal(recovered.plan.deploymentId, deploymentId)
  assert.equal(recovered.plan.sourceSha, fixture.source)
  assert.equal(recovered.status, 'deployed')
  assert.deepEqual(commands, ['install --frozen-lockfile', 'run site:build', 'run site:deploy', 'install --frozen-lockfile', 'run site:build', 'run site:deploy'])
  const current = fixture.automation.get('docs/web/stable').value
  assert.equal(current.current.versionId, 'provider-version')
  assert.equal(current.current.deploymentId, deploymentId)
  assert.equal(current.pending, undefined)
}), 30000)

it('refuses preview upload when main advances during the build and clears the unused claim', async () => withLifecycle(async (fixture) => {
  const commands = []
  const spawn = (_command, args) => {
    commands.push(args.join(' '))
    if (args[1] === 'site:build') {
      fixture.setRemoteHead('f'.repeat(40))
    }
    return { status: 0, stdout: '', stderr: '' }
  }
  await assert.rejects(deployDocs({ cwd: fixture.cwd, site: 'web', channel: 'preview', sourceSha: fixture.source, config: docsConfig, github: fixture.options.github, env: { ...fixture.env, REPO_DOCS_CONCURRENCY_GROUP: 'docs-web-preview' }, spawn }), /Main advanced during the preview build/)
  assert.deepEqual(commands, ['install --frozen-lockfile', 'run site:build'])
  assert.equal(fixture.automation.get('docs/web/preview').value.pending, undefined)
  assert.equal(fixture.automation.get('docs/web/preview').value.current, undefined)
}), 30000)
