import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createNightlyPlan, createSnapshotPlan, releaseNightly, resolveCommandConfig } from 'repoctl'
import { it } from 'vitest'

const repository = fileURLToPath(new URL('..', import.meta.url))

async function fixture(run) {
  const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-nightly-boundary-')))
  const cwd = path.join(temporary, 'source')
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(?:GIT_|GITHUB_|GH_|NPM_CONFIG_|npm_config_)/.test(key) || /TOKEN|AUTH/.test(key)) {
      delete env[key]
    }
  }
  Object.assign(env, { CI: 'true', COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0', NO_COLOR: '1' })
  const calls = []
  const execute = (command, args, options = {}) => {
    calls.push({ command, args })
    assert.equal(path.resolve(options.cwd ?? cwd), cwd, 'Nightly inspection must stay in its source fixture')
    if (command === 'pnpm') {
      const output = new Map([
        ['--version', '12.15.0'],
        ['version --help', '--dry-run --json'],
        ['version -r --dry-run --json --no-git-checks', '[]'],
      ]).get(args.filter(arg => !arg.startsWith('--config.')).join(' '))
      assert.notEqual(output, undefined, `Inspection must not install, build, publish, or mutate a tag: pnpm ${args.join(' ')}`)
      return { status: 0, stdout: output, stderr: '' }
    }
    assert.equal(command, 'git')
    return spawnSync(command, args, { ...options, cwd, env, encoding: 'utf8', stdio: 'pipe', timeout: 10000 })
  }
  const git = (...args) => {
    const result = execute('git', args)
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    return result.stdout.trim()
  }
  try {
    await mkdir(path.join(cwd, 'packages/weapp'), { recursive: true })
    await mkdir(path.join(cwd, 'packages/helper'), { recursive: true })
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'nightly-fixture', private: true, packageManager: 'pnpm@12.15.0' }))
    await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await writeFile(path.join(cwd, 'packages/weapp/package.json'), JSON.stringify({ name: 'weapp', version: '0.3.0' }))
    await writeFile(path.join(cwd, 'packages/helper/package.json'), JSON.stringify({ name: 'weapp-nightly-helper', version: '0.1.0' }))
    git('init', '--initial-branch=main')
    git('config', 'user.name', 'Nightly fixture')
    git('config', 'user.email', 'nightly@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    git('add', '-A')
    git('commit', '-m', 'test: nightly source')
    const source = git('rev-parse', 'HEAD')
    const event = { repository: { full_name: 'weappjs/weapp.dev', default_branch: 'main' }, schedule: '0 18 * * *' }
    const eventFile = path.join(temporary, 'event.json')
    await writeFile(eventFile, JSON.stringify(event))
    Object.assign(env, {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'weappjs/weapp.dev',
      GITHUB_SHA: source,
      GITHUB_REF: 'refs/heads/main',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_EVENT_NAME: 'schedule',
      GITHUB_EVENT_PATH: eventFile,
      REPOCTL_NIGHTLY_PROVIDER: 'npm',
    })
    const config = await resolveCommandConfig('release', repository)
    const requests = []
    const registry = new Map()
    const registryFetch = async (url, settings) => {
      const parsed = new URL(url)
      requests.push({ pathname: parsed.pathname, method: settings?.method ?? 'GET' })
      assert.equal(parsed.origin, 'https://registry.npmjs.org')
      assert.equal(settings?.method ?? 'GET', 'GET', 'The fixture registry rejects every write and credential exchange')
      const entry = registry.get(parsed.pathname)
      return entry ? Response.json(entry) : new Response(null, { status: 404 })
    }
    const options = { cwd, env, config, spawn: execute, registryFetch, outputDirectory: path.join(temporary, 'reports') }
    const publishMetadata = async (buildId) => {
      // Generate versions and metadata using repoctl's public planner, so these
      // tests do not duplicate the snapshot identity/hash implementation.
      const report = await createSnapshotPlan({ cwd, env, spawn: execute, identity: { kind: 'nightly', commit: source, buildId } })
      return report.packages.map(pkg => ({
        name: pkg.name,
        version: pkg.version,
        repoctlSnapshot: { ...report.identity, identityKey: report.identityKey, tag: report.tag },
        dist: { integrity: `sha512-${createHash('sha512').update(pkg.name).digest('base64')}` },
      }))
    }
    const setChannel = (metadata) => {
      for (const value of metadata) {
        registry.set(`/-/package/${value.name}/dist-tags`, { 'latest': '0.2.0', 'snapshot-nightly': value.version })
        registry.set(`/${value.name}/${value.version}`, value)
      }
    }
    calls.length = 0
    await run({ cwd, source, env, event, eventFile, options, calls, requests, registry, publishMetadata, setChannel, git })
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

it('skips a scheduled nightly when all packages already share the source and prior build, without touching latest', async () => {
  await fixture(async ({ options, source, calls, requests, registry, publishMetadata, setChannel, git }) => {
    setChannel(await publishMetadata('122-1'))
    const before = JSON.stringify([...registry])
    calls.length = 0
    const report = await releaseNightly({ ...options, publish: true })
    assert.equal(report.status, 'skipped', report.error)
    assert.equal(report.commit, source)
    assert.equal(report.buildId, '123-1')
    assert.match(report.reason, /same nightly build identity/)
    assert.deepEqual(report.latest, { 'weapp': '0.2.0', 'weapp-nightly-helper': '0.2.0' })
    assert.equal(JSON.stringify([...registry]), before)
    assert.equal(requests.length, 4)
    assert.ok(requests.every(request => request.method === 'GET'))
    assert.equal(calls.some(call => call.command === 'pnpm' && call.args.includes('publish')), false)
    assert.equal(report.oidc, undefined)
    assert.equal(report.snapshot.tag, 'snapshot-nightly')
    assert.equal(git('rev-parse', 'HEAD'), source)
    assert.equal(git('status', '--porcelain'), '')
    assert.equal(JSON.parse(await readFile(path.join(report.outputDirectory, 'nightly-report.json'), 'utf8')).status, 'skipped')
  })
})

it('does not skip a partial channel containing different build identities for the same source', async () => {
  await fixture(async ({ options, publishMetadata, setChannel }) => {
    const first = await publishMetadata('121-1')
    const second = await publishMetadata('122-1')
    setChannel([first[0], second[1]])
    const report = await createNightlyPlan(options)
    assert.equal(report.status, 'planned', report.error)
    assert.equal(report.reason, undefined)
    assert.equal(report.snapshot.tag, 'snapshot-nightly')
    assert.deepEqual(report.packages.map(pkg => pkg.locator), ['weapp@snapshot-nightly', 'weapp-nightly-helper@snapshot-nightly'])
  })
})

it('does not treat an invalid snapshot identity as evidence that nightly is current', async () => {
  await fixture(async ({ options, publishMetadata, setChannel }) => {
    const metadata = await publishMetadata('122-1')
    metadata[0].repoctlSnapshot.identityKey = '0'.repeat(64)
    setChannel(metadata)
    assert.equal((await createNightlyPlan(options)).status, 'planned')
  })
})

it('plans a new nightly when the committed source advances beyond the complete published channel', async () => {
  await fixture(async ({ cwd, options, env, source, publishMetadata, setChannel, git }) => {
    setChannel(await publishMetadata('122-1'))
    await writeFile(path.join(cwd, 'packages/weapp/index.js'), 'export const changed = true\n')
    git('add', '-A')
    git('commit', '-m', 'feat: change nightly input')
    env.GITHUB_SHA = git('rev-parse', 'HEAD')
    assert.notEqual(env.GITHUB_SHA, source)
    const report = await createNightlyPlan(options)
    assert.equal(report.status, 'planned', report.error)
    assert.equal(report.commit, env.GITHUB_SHA)
    assert.ok(report.packages.every(pkg => pkg.version.includes(env.GITHUB_SHA)))
  })
})

it('leaves explicit nightly dispatch available even when the scheduled channel is current', async () => {
  await fixture(async ({ options, env, event, eventFile, publishMetadata, setChannel }) => {
    setChannel(await publishMetadata('122-1'))
    env.GITHUB_EVENT_NAME = 'workflow_dispatch'
    await writeFile(eventFile, JSON.stringify({ ...event, inputs: { mode: 'nightly' } }))
    const report = await createNightlyPlan(options)
    assert.equal(report.status, 'planned', report.error)
    assert.equal(report.eventName, 'workflow_dispatch')
  })
})

it('fails closed on an unavailable npm registry instead of treating the channel as absent', async () => {
  await fixture(async ({ options, calls }) => {
    const report = await releaseNightly({ ...options, publish: true, registryFetch: async () => new Response(null, { status: 503 }) })
    assert.equal(report.status, 'failed')
    assert.match(report.error, /HTTP 503.*publication state is unknown/)
    assert.equal(report.oidc, undefined)
    assert.equal(calls.some(call => call.command === 'pnpm' && call.args.includes('publish')), false)
  })
})
