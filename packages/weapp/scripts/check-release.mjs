import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { PreflightError, validateManifest, validateReleaseTag } from './preflight.mjs'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
validateManifest(manifest)
const tag = validateReleaseTag(manifest, process.env, (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 10_000 })
  if (result.status !== 0) {
    throw new PreflightError('release', 'release tag is unavailable')
  }
  return result.stdout
})
process.stdout.write(`Release tag verified: ${tag}\n`)
