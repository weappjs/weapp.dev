import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'vitest'
import { installHooks } from './install-hooks.mjs'

async function fixture(run) {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-hooks-')))
  try {
    await run(cwd)
  }
  finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

it('does not inspect Git or install hooks in CI or when disabled', () => {
  for (const env of [{ CI: 'true' }, { CI: '1' }, { LEFTHOOK: '0' }]) {
    assert.equal(installHooks({ cwd: '/missing/archive', env, execute: () => assert.fail('No commands expected'), log: () => {} }), 'disabled')
  }
})

it('skips archives even when they are nested under a developer checkout', async () => {
  await fixture(async (cwd) => {
    await mkdir(path.join(cwd, '.git'))
    const archive = path.join(cwd, 'archive')
    await mkdir(archive)
    assert.equal(installHooks({ cwd: archive, env: {}, execute: () => assert.fail('Do not discover parent Git'), log: () => {} }), 'archive')
  })
})

it('installs in a developer worktree and preserves installation failures', async () => {
  await fixture(async (cwd) => {
    await writeFile(path.join(cwd, '.git'), 'gitdir: /fixture/worktree\n')
    const calls = []
    const execute = (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd })
      return command === 'git' ? { status: 0, stdout: `${cwd}\n` } : { status: 0 }
    }
    assert.equal(installHooks({ cwd, env: { CI: 'false' }, execute }), 'installed')
    assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
      ['git', ['rev-parse', '--show-toplevel']],
      [process.execPath, [createRequire(import.meta.url).resolve('lefthook'), 'install']],
    ])
    assert.ok(calls.every(call => call.cwd === cwd))
    assert.throws(() => installHooks({
      cwd,
      env: {},
      execute: command => command === 'git' ? { status: 0, stdout: `${cwd}\n` } : { status: 1 },
    }), /Lefthook installation failed/)
    assert.throws(() => installHooks({ cwd, env: {}, execute: () => ({ status: 128, stdout: '' }) }), /Cannot inspect/)
    assert.throws(() => installHooks({ cwd, env: {}, execute: () => ({ status: 0, stdout: `${path.dirname(cwd)}\n` }) }), /different Git checkout/)
  })
})
