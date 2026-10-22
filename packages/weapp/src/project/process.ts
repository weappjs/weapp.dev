import type { ChildProcess, SpawnOptions, StdioOptions } from 'node:child_process'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Preserve Windows-safe argv execution on Node 18.
import spawn from 'cross-spawn'

export type ProjectSpawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess
export interface ProjectProcessOptions {
  signal?: AbortSignal
  env?: NodeJS.ProcessEnv
  stdio?: StdioOptions
  spawn?: ProjectSpawn
  platform?: NodeJS.Platform
  kill?: (pid: number, signal: NodeJS.Signals | number) => boolean
  terminateGraceMs?: number
}
export interface ProjectProcessResult {
  code: number | null
  signal: NodeJS.Signals | null
  cancelled: boolean
  failedToStart: boolean
  cleanupFailed: boolean
  stdout: string
}

/** Query and execution must use the installed manager, without fetching another binary. */
export function projectProcessEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_AUTO_PIN: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    COREPACK_DEFAULT_TO_LATEST: '0',
    npm_config_manage_package_manager_versions: 'false',
    npm_config_update_notifier: 'false',
  }
}

function missingProcess(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH'
}

async function terminateTree(child: ChildProcess, options: ProjectProcessOptions): Promise<void> {
  if (!child.pid) {
    return
  }
  const platform = options.platform || process.platform
  const kill = options.kill || process.kill
  if (platform === 'win32') {
    // Killing cmd/npm alone leaves lifecycle scripts alive on Windows.
    await new Promise<void>((resolve, reject) => {
      const taskkill = (options.spawn || spawn)('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, shell: false })
      let failure: Error | undefined
      taskkill.once('error', (error) => {
        failure = error
      })
      taskkill.once('close', (code) => {
        if (!failure && code === 0) {
          resolve()
          return
        }
        try {
          kill(child.pid!, 0)
          reject(failure || new Error('Unable to terminate the package manager process tree'))
        }
        catch (error) {
          if (missingProcess(error)) {
            resolve()
          }
          else {
            reject(error)
          }
        }
      })
    })
    return
  }
  const group = -child.pid
  const send = (signal: NodeJS.Signals | number): boolean => {
    try {
      kill(group, signal)
      return true
    }
    catch (error) {
      if (missingProcess(error)) {
        return false
      }
      throw error
    }
  }
  if (!send('SIGTERM')) {
    return
  }
  const deadline = Date.now() + (options.terminateGraceMs ?? 1000)
  while (send(0) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  // The parent may already be closed while a lifecycle script ignores SIGTERM.
  send('SIGKILL')
}

/** Resolve only after close and cancellation cleanup, before the terminal is restored. */
export async function runProjectProcess(command: string, args: string[], cwd: string, options: ProjectProcessOptions = {}): Promise<ProjectProcessResult> {
  if (options.signal?.aborted) {
    return { code: null, signal: null, cancelled: true, failedToStart: false, cleanupFailed: false, stdout: '' }
  }
  let child: ChildProcess
  try {
    child = (options.spawn || spawn)(command, args, {
      cwd,
      stdio: options.stdio ?? 'inherit',
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
      detached: (options.platform || process.platform) !== 'win32',
    })
  }
  catch {
    return { code: null, signal: null, cancelled: false, failedToStart: true, cleanupFailed: false, stdout: '' }
  }
  let failedToStart = false
  let cleanupFailed = false
  let cancelled = false
  let stdout = ''
  let cleanup: Promise<void> | undefined
  const abort = (): void => {
    cancelled = true
    cleanup ??= terminateTree(child, options).catch(() => {
      cleanupFailed = true
      try {
        child.kill('SIGKILL')
      }
      catch {
        // The structured result reports cleanup failure; close still owns terminal release.
      }
    })
  }
  const closed = new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve) => {
    child.once('error', () => {
      failedToStart = true
    })
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  // Output capture is used only for --version; inherited command output stays with the terminal.
  child.stdout?.on('data', (chunk: Uint8Array | string) => {
    stdout = (stdout + chunk.toString()).slice(0, 4096)
  })
  child.stderr?.resume()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) {
    abort()
  }
  try {
    const result = await closed
    options.signal?.removeEventListener('abort', abort)
    await cleanup
    return { ...result, cancelled, failedToStart, cleanupFailed, stdout }
  }
  finally {
    options.signal?.removeEventListener('abort', abort)
  }
}
