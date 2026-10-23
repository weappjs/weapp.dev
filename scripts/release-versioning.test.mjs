import { strict as assert } from 'node:assert'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReleasePullRequest, createSnapshotPlan, resolveCommandConfig } from 'repoctl'
import { it } from 'vitest'
import { parse } from 'yaml'

const repository = fileURLToPath(new URL('..', import.meta.url))
const intentName = 'weapp-cli-toolbox'
const summary = 'Add the terminal playground and mini-program development toolbox.'
const privatePackages = [
  ['apps/web', '@weapp-io/web'],
  ['apps/open-source', '@weapp-io/open-source'],
  ['packages/project-catalog', '@weapp-io/project-catalog'],
  ['packages/site-ui', '@weapp-io/site-ui'],
]

// A separate process serves requests while repoctl runs native pnpm synchronously.
// Only loopback reads exist: this registry cannot accept a package upload.
const registrySource = `
  const http = require('node:http');
  const fs = require('node:fs');
  const manifest = { name: 'weapp', version: '0.0.1' };
  const server = http.createServer((request, response) => {
    fs.appendFileSync(process.argv[1], JSON.stringify({ method: request.method, url: request.url }) + '\\n');
    response.setHeader('Content-Type', 'application/json');
    if (request.method !== 'GET') {
      response.writeHead(405).end('{}');
    } else if (request.url === '/weapp/0.0.1') {
      response.end(JSON.stringify(manifest));
    } else if (request.url === '/weapp') {
      response.end(JSON.stringify({ name: 'weapp', 'dist-tags': { latest: '0.0.1' }, versions: { '0.0.1': manifest } }));
    } else {
      response.writeHead(404).end('{}');
    }
  });
  server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  process.on('message', () => server.close(() => process.exit(0)));
  process.on('disconnect', () => server.close(() => process.exit(0)));
`

async function write(directory, filename, content) {
  const target = path.join(directory, filename)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

async function json(directory, filename) {
  return JSON.parse(await readFile(path.join(directory, filename), 'utf8'))
}

async function withFixture(intent, run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-release-')))
  const cwd = path.join(directory, 'workspace')
  const remote = path.join(directory, 'origin.git')
  const registryLog = path.join(directory, 'registry.jsonl')
  let registry
  try {
    await mkdir(cwd)
    await writeFile(registryLog, '')
    registry = spawn(process.execPath, ['-e', registrySource, registryLog], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    const [{ port }] = await once(registry, 'message', { signal: AbortSignal.timeout(5000) })
    const registryUrl = `http://127.0.0.1:${port}`
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (/^(?:GIT_|GITHUB_|GH_|NPM_CONFIG_|npm_config_)/.test(key) || /TOKEN|AUTH/.test(key)) {
        delete env[key]
      }
    }
    Object.assign(env, {
      CI: '1',
      NO_COLOR: '1',
      COREPACK_ENABLE_NETWORK: '0',
      COREPACK_ENABLE_AUTO_PIN: '0',
      npm_config_registry: registryUrl,
      GITHUB_REPOSITORY: 'weappjs/weapp.dev',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REF_NAME: 'main',
    })
    const calls = []
    const execute = (command, args, options = {}) => {
      assert.ok(command === 'git' || command === 'pnpm', `Unexpected command: ${command}`)
      assert.equal(args.includes('publish'), false, 'Preparation must never publish a package')
      assert.equal(command === 'git' && args[0] === 'tag', false, 'Preparation must never create a tag')
      assert.equal(path.resolve(options.cwd ?? cwd), cwd, 'Commands must stay inside the fixture')
      const pnpmEntry = process.env.npm_execpath
      const executable = command === 'pnpm' && pnpmEntry && /^pnpm(?:\.(?:js|cjs|mjs|exe))?$/.test(path.basename(pnpmEntry)) ? pnpmEntry : command
      const nodeEntry = /\.(?:js|cjs|mjs)$/.test(executable)
      const result = spawnSync(nodeEntry ? process.execPath : executable, nodeEntry ? [executable, ...args] : args, {
        ...options,
        cwd,
        env,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000,
      })
      calls.push({ command, args, result })
      return result
    }
    const git = (...args) => {
      const result = execute('git', args)
      assert.equal(result.status, 0, result.stderr || result.error?.message)
      return result.stdout.trim()
    }
    const rootManifest = await json(repository, 'package.json')
    await write(cwd, 'pnpm-workspace.yaml', await readFile(path.join(repository, 'pnpm-workspace.yaml'), 'utf8'))
    // Keep files referenced by the real workspace configuration available to native pnpm.
    const patches = path.join(repository, 'patches')
    if (existsSync(patches)) {
      await cp(patches, path.join(cwd, 'patches'), { recursive: true })
    }
    await write(cwd, '.npmrc', `registry=${registryUrl}\n`)
    await write(cwd, 'package.json', `${JSON.stringify({
      name: rootManifest.name,
      version: rootManifest.version,
      private: true,
      dependencies: { weapp: 'workspace:~' },
      packageManager: rootManifest.packageManager,
      scripts: {
        'release:verify': 'node scripts/release-hook.mjs verify',
        'release:build': 'node scripts/release-hook.mjs build',
      },
    }, null, 2)}\n`)
    await write(cwd, 'scripts/release-hook.mjs', 'import { appendFileSync } from "node:fs"; appendFileSync("release-hooks.jsonl", JSON.stringify(process.argv[2]) + "\\n");\n')
    await write(cwd, 'packages/weapp/package.json', `${JSON.stringify({ name: 'weapp', version: '0.0.1' }, null, 2)}\n`)
    for (const [relative, name] of privatePackages) {
      // These dependents would need a bump if the exact ignore entries stopped working.
      await write(cwd, `${relative}/package.json`, `${JSON.stringify({ name, version: '0.0.0', private: true, dependencies: { weapp: 'workspace:~' } }, null, 2)}\n`)
    }
    if (intent) {
      await write(cwd, `.changeset/${intentName}.md`, intent)
    }
    git('init', '--initial-branch=main')
    git('config', 'user.name', 'Release fixture')
    git('config', 'user.email', 'release-fixture@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    git('init', '--bare', remote)
    git('remote', 'add', 'origin', remote)
    git('add', '-A')
    git('commit', '-m', 'feat: add weapp CLI toolbox')
    git('push', '-u', 'origin', 'main')
    const source = git('rev-parse', 'HEAD')
    const pullRequests = []
    const legacyClosures = []
    const options = {
      cwd,
      env,
      branch: 'main',
      spawn: execute,
      config: await resolveCommandConfig('release', repository),
      registryFetch: async () => { throw new Error('Unexpected repoctl registry request during preparation') },
      github: {
        ensurePullRequest: async (request) => {
          pullRequests.push(request)
          return { number: 1, title: request.title, body: request.body, html_url: 'https://example.invalid/pull/1' }
        },
        closeLegacyReleasePullRequests: async (request) => { legacyClosures.push(request) },
        ensureRelease: async () => { throw new Error('Preparation must never create a GitHub release') },
        ensureTag: async () => { throw new Error('Preparation must never create a GitHub tag') },
      },
    }
    await run({ cwd, remote, source, options, calls, pullRequests, legacyClosures, git, registryLog })
  }
  finally {
    if (registry && registry.exitCode === null) {
      const exited = once(registry, 'exit')
      registry.send({ close: true })
      await exited
    }
    await rm(directory, { recursive: true, force: true })
  }
}

it('prepares an actual native version PR offline while keeping private dependents unchanged', async () => {
  await withFixture(`---\n"weapp": minor\n---\n\n${summary}\n`, async ({ cwd, source, options, calls, pullRequests, legacyClosures, git, registryLog }) => {
    assert.equal(await createReleasePullRequest(options), true)
    assert.equal((await json(cwd, 'packages/weapp/package.json')).version, '0.1.0')
    assert.equal((await json(cwd, 'package.json')).version, '0.0.0')
    for (const [relative] of privatePackages) {
      assert.equal((await json(cwd, `${relative}/package.json`)).version, '0.0.0')
      await assert.rejects(readFile(path.join(cwd, relative, 'CHANGELOG.md')), { code: 'ENOENT' })
    }
    const changelog = await readFile(path.join(cwd, 'packages/weapp/CHANGELOG.md'), 'utf8')
    assert.match(changelog, /0\.1\.0/)
    assert.ok(changelog.includes(summary))
    const ledger = await readFile(path.join(cwd, '.changeset/ledger.yaml'), 'utf8')
    assert.match(ledger, /weapp@0\.1\.0:/)
    assert.match(ledger, /dir: packages\/weapp/)
    assert.ok(ledger.includes(intentName))
    await assert.rejects(readFile(path.join(cwd, `.changeset/${intentName}.md`)), { code: 'ENOENT' })
    assert.deepEqual((await readFile(path.join(cwd, 'release-hooks.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)), ['verify', 'build'])
    assert.equal(pullRequests.length, 1)
    assert.equal(pullRequests[0].head, 'release/pnpm-version')
    assert.equal(pullRequests[0].base, 'main')
    assert.match(pullRequests[0].title, /^chore\(release\):/)
    assert.ok(pullRequests[0].body.includes('weapp'))
    assert.ok(pullRequests[0].body.includes('0.1.0'))
    assert.ok(pullRequests[0].body.includes(summary))
    assert.ok(pullRequests[0].body.includes(source))
    assert.deepEqual(legacyClosures, [{ head: 'changeset-release/main', base: 'main' }])
    assert.equal(git('rev-parse', '--abbrev-ref', 'HEAD'), 'release/pnpm-version')
    assert.equal(git('rev-parse', 'refs/remotes/origin/release/pnpm-version'), git('rev-parse', 'HEAD'))
    assert.equal(git('rev-parse', 'refs/remotes/origin/main'), source)
    assert.equal(git('for-each-ref', '--format=%(refname)', 'refs/tags'), '')
    assert.equal(git('status', '--porcelain'), '')
    const requests = (await readFile(registryLog, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    assert.ok(requests.length, 'Native pnpm must check the fixture registry for the published baseline')
    assert.ok(requests.every(request => request.method === 'GET' && request.url.startsWith('/weapp')))
    assert.ok(calls.some(call => call.command === 'pnpm' && call.args[0] === 'version'))
    assert.equal(calls.some(call => call.args.includes('publish')), false)
  })
}, 60000)

it('leaves the repository and local remote untouched when no intent is pending', async () => {
  await withFixture(null, async ({ cwd, source, options, calls, pullRequests, git, registryLog }) => {
    assert.equal(await createReleasePullRequest(options), false)
    assert.deepEqual(pullRequests, [])
    assert.equal(git('rev-parse', 'HEAD'), source)
    assert.equal(git('rev-parse', '--abbrev-ref', 'HEAD'), 'main')
    assert.equal(git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin'), 'refs/remotes/origin/main')
    assert.equal(git('status', '--porcelain'), '')
    assert.equal((await json(cwd, 'packages/weapp/package.json')).version, '0.0.1')
    assert.equal(calls.some(call => call.command === 'pnpm'), false)
    assert.equal(await readFile(registryLog, 'utf8'), '')
    await assert.rejects(readFile(path.join(cwd, '.changeset/ledger.yaml')), { code: 'ENOENT' })
  })
}, 60000)

it('rejects a release intent targeting an ignored private package before pushing a PR', async () => {
  await withFixture(`---\n"@weapp-io/web": patch\n---\n\nThis private application must stay outside releases.\n`, async ({ cwd, source, options, calls, pullRequests, git }) => {
    await assert.rejects(createReleasePullRequest(options), /command failed: pnpm version/)
    assert.deepEqual(pullRequests, [])
    assert.equal(git('rev-parse', 'HEAD'), source)
    assert.equal(git('rev-parse', '--abbrev-ref', 'HEAD'), 'main')
    assert.equal(git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin'), 'refs/remotes/origin/main')
    assert.equal((await json(cwd, 'packages/weapp/package.json')).version, '0.0.1')
    assert.equal((await json(cwd, 'apps/web/package.json')).version, '0.0.0')
    assert.match(await readFile(path.join(cwd, `.changeset/${intentName}.md`), 'utf8'), /@weapp-io\/web/)
    const failed = calls.find(call => call.command === 'pnpm' && call.args[0] === 'version')
    assert.notEqual(failed.result.status, 0)
    assert.match(failed.result.stderr, /ignored|excluded|versioning\.ignore/i)
    assert.equal(calls.some(call => call.command === 'git' && call.args[0] === 'push' && call.args.includes('--force')), false)
    await assert.rejects(readFile(path.join(cwd, '.changeset/ledger.yaml')), { code: 'ENOENT' })
  })
}, 60000)

it('plans nightly versions without consuming stable intents or changing the source repository', async () => {
  await withFixture(`---\n"weapp": minor\n---\n\n${summary}\n`, async ({ cwd, source, options, git }) => {
    const before = await readFile(path.join(cwd, `.changeset/${intentName}.md`), 'utf8')
    const report = await createSnapshotPlan({
      ...options,
      identity: { kind: 'nightly', commit: source, buildId: 'migration-fixture' },
      dryRun: true,
    })
    assert.equal(report.status, 'planned')
    assert.equal(report.tag, 'snapshot-nightly')
    assert.deepEqual(report.packages.map(pkg => pkg.name), ['weapp'])
    assert.match(report.packages[0].version, /-snapshot\.nightly\./)
    assert.equal((await json(cwd, 'packages/weapp/package.json')).version, '0.0.1')
    assert.equal(await readFile(path.join(cwd, `.changeset/${intentName}.md`), 'utf8'), before)
    assert.equal(git('rev-parse', 'HEAD'), source)
    assert.equal(git('status', '--porcelain'), '')
    assert.equal(git('for-each-ref', '--format=%(refname)', 'refs/tags'), '')
  })
}, 60000)

it('keeps package publication and stable websites behind the managed release stages', async () => {
  const workflow = parse(await readFile(path.join(repository, '.github/workflows/release.yml'), 'utf8'))
  const steps = workflow.jobs.release.steps
  const stages = steps.filter(step => step.run?.startsWith('pnpm exec repo release ci --stage')).map(step => step.run.split(' ').at(-1))
  assert.deepEqual(stages, ['plan', 'verify', 'prepare', 'upload', 'confirm', 'finalize'])
  for (const id of ['release-upload', 'release-confirm', 'release-finalize']) {
    assert.match(steps.find(step => step.id === id).if, /release-prepare.outputs.publish == 'true'/)
  }
  assert.match(workflow.jobs.docs.if, /needs.release.outputs.release-record != ''/)
  assert.equal(workflow.jobs.docs.with.channel, 'stable')
  assert.match(workflow.jobs.docs.with.release, /^\$\{\{ needs\.release\.outputs\.release-record \}\}$/)
  assert.deepEqual(workflow.on.schedule, [{ cron: '0 18 * * *' }])
  assert.match(workflow.jobs.nightly.if, /github.event_name == 'schedule'/)
  assert.equal(workflow.jobs.nightly.permissions.contents, 'read')
  assert.equal(workflow.jobs.nightly.permissions['id-token'], 'write')
  assert.equal(workflow.jobs.nightly.env.REPOCTL_NIGHTLY_PROVIDER, 'npm')
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.equal(steps.some(step => step.run?.includes('gh workflow run weapp-cli.yml --ref release/pnpm-version')), true)
  for (const legacy of ['publish-weapp.yml', 'version-packages.yml']) {
    assert.equal(existsSync(path.join(repository, '.github/workflows', legacy)), false)
  }
})

it('separates Pages credentials from Cloudflare and keeps PR deploys on validated artifacts', async () => {
  const deploy = parse(await readFile(path.join(repository, '.github/workflows/repoctl-docs-deploy.yml'), 'utf8'))
  assert.match(deploy.concurrency.group, /^docs-\$\{\{ inputs\.site \}\}-\$\{\{ inputs\.channel \}\}$/)
  assert.equal(deploy.concurrency['cancel-in-progress'], false)
  assert.deepEqual(deploy.jobs.cloudflare.permissions, { contents: 'write' })
  assert.deepEqual(deploy.jobs.pages.permissions, { 'contents': 'write', 'pages': 'write', 'id-token': 'write' })
  assert.match(deploy.jobs.pages.if, /inputs.site == 'open-source' && inputs.channel == 'stable'/)
  const pages = deploy.jobs.pages.steps.find(step => step.uses?.startsWith('actions/github-script@'))
  assert.match(pages.with.script, /env: process.env/)
  assert.match(pages.with.script, /\['plan', 'deploy'\]/)
  assert.equal(pages.env.CLOUDFLARE_API_TOKEN, undefined)
  for (const filename of ['ci.yml', 'open-source.yml']) {
    const workflow = parse(await readFile(path.join(repository, '.github/workflows', filename), 'utf8'))
    assert.deepEqual(Object.keys(workflow.jobs).sort(), ['deploy-preview', 'verify'])
    const verify = workflow.jobs.verify
    assert.match(verify.env.REPO_DOCS_CHANNEL, /github.event_name == 'pull_request' && 'preview' \|\| 'stable'/)
    for (const job of [verify, workflow.jobs['deploy-preview']]) {
      const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'))
      assert.match(checkout.with.ref, /github.event.pull_request.head.sha \|\| github.sha/)
    }
    const identity = verify.steps.findIndex(step => step.run?.includes('--identity-only'))
    const e2e = verify.steps.findIndex(step => step.run?.endsWith('exec playwright test'))
    const artifact = verify.steps.findIndex(step => step.uses?.startsWith('actions/upload-artifact@'))
    assert.ok(identity >= 0 && identity < e2e && e2e < artifact)
    const preview = workflow.jobs['deploy-preview']
    assert.equal(preview.needs, 'verify')
    assert.match(preview.if, /github.event.pull_request.head.repo.full_name == github.repository/)
    const download = preview.steps.findIndex(step => step.uses?.startsWith('actions/download-artifact@'))
    const upload = preview.steps.findIndex(step => step.run?.startsWith('node scripts/docs-deployment/cli.mjs pr '))
    assert.ok(download >= 0 && download < upload)
    assert.equal(preview.steps.some(step => /pnpm .*build/.test(step.run ?? '')), false)
    assert.equal(preview.permissions['id-token'], undefined)
    assert.equal(preview.permissions.pages, undefined)
  }
})
