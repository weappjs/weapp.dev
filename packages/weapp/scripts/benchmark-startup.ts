import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// Measures new Node processes with the current filesystem cache. npm's own
// registry, global-tree and installation work is deliberately measured separately.
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
const samples = 15
const cwd = await mkdtemp(path.join(os.tmpdir(), 'weapp-benchmark-'))
const results: Record<string, { medianMs: number, minMs: number, maxMs: number, samples: number }> = {}
try {
  for (const [name, args] of Object.entries({
    emptyNode: ['-e', ''],
    version: [cli, '--version'],
    help: [cli, '--help'],
    createDryRun: [cli, 'create', 'weapp-vite', 'new-app', '--dry-run'],
  })) {
    const durations: number[] = []
    for (let index = 0; index < samples; index++) {
      const start = performance.now()
      const child = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 10000, env: { ...process.env, NO_COLOR: '1' } })
      assert.equal(child.status, 0, child.stderr || child.error?.message)
      durations.push(performance.now() - start)
    }
    durations.sort((first, second) => first - second)
    const round = (value: number) => Number(value.toFixed(2))
    results[name] = { medianMs: round(durations[Math.floor(samples / 2)]), minMs: round(durations[0]), maxMs: round(durations.at(-1)!), samples }
  }
  process.stdout.write(`${JSON.stringify({ platform: `${process.platform}-${process.arch}`, node: process.versions.node, results }, null, 2)}\n`)
}
finally {
  await rm(cwd, { recursive: true, force: true })
}
