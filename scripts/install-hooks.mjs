import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** Git hooks belong to developer checkouts, never release source archives. */
export function installHooks({ cwd = process.cwd(), env = process.env, execute = spawnSync, log = console.log } = {}) {
  if (env.LEFTHOOK === '0' || /^(?:1|true)$/i.test(env.CI ?? '')) {
    log('Skipping Git hooks in CI or with LEFTHOOK=0.')
    return 'disabled'
  }
  const root = realpathSync(cwd)
  // A source archive can live under another checkout; Git discovery alone would
  // install hooks into that parent repository. Worktree .git files are valid.
  if (!existsSync(path.join(root, '.git'))) {
    log('Skipping Git hooks outside a Git checkout.')
    return 'archive'
  }
  const git = execute('git', ['rev-parse', '--show-toplevel'], { cwd: root, env, encoding: 'utf8' })
  if (git.error || git.status !== 0) {
    throw new Error('Cannot inspect the developer Git checkout.', { cause: git.error })
  }
  if (realpathSync(git.stdout.trim()) !== root) {
    throw new Error('Refusing to install hooks into a different Git checkout.')
  }
  // Execute the package's Node entry directly, including on Windows where the
  // package-manager bin shim is a .cmd file rather than a native executable.
  const lefthook = createRequire(import.meta.url).resolve('lefthook')
  const result = execute(process.execPath, [lefthook, 'install'], { cwd: root, env, stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    throw new Error(`Lefthook installation failed (${result.status ?? result.signal ?? 'spawn error'}).`, { cause: result.error })
  }
  return 'installed'
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installHooks()
}
