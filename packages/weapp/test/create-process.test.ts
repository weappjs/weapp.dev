import { getEventListeners } from 'node:events'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, queryScaffolder } from '../src/commands/create.js'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-create-process-'))
  const bin = path.join(directory, 'bin')
  await mkdir(bin)
  const script = path.join(bin, 'npm-fixture.cjs')
  // This fixture only returns metadata or writes a minimal package; it never installs packages.
  await writeFile(script, `
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const cwd = process.cwd()
const npmrc = fs.readFileSync(path.join(cwd, '.npmrc'), 'utf8')
fs.appendFileSync(path.join(cwd, 'npm-calls.jsonl'), JSON.stringify({ args, cwd, npmrc }) + '\\n')
if (args[0] === 'view') {
  if (process.env.WEAPP_CREATE_FIXTURE === 'error') {
    process.stderr.write('Do not expose https://user:secret@registry.example/')
    process.exit(1)
  }
  if (process.env.WEAPP_CREATE_FIXTURE === 'invalid') {
    process.stdout.write('{')
  }
  else if (process.env.WEAPP_CREATE_FIXTURE === 'hang') {
    process.stdout.write('')
    setInterval(() => {}, 1000)
  }
  else {
    process.stdout.write(JSON.stringify({ version: '3.0.9', engines: { node: '>=18' } }))
  }
}
else if (args[0] === 'exec') {
  const delimiter = args.indexOf('--')
  const name = args[delimiter + 2]
  fs.mkdirSync(path.join(cwd, name))
  fs.writeFileSync(path.join(cwd, name, 'package.json'), JSON.stringify({ devDependencies: { 'weapp-vite': '^3' } }))
}
else {
  process.exit(2)
}
`)
  await writeFile(path.join(bin, 'npm'), `#!/bin/sh\nexec '${process.execPath.replaceAll('\'', '\'\\\'\'')}' '${script.replaceAll('\'', '\'\\\'\'')}' "$@"\n`)
  await chmod(path.join(bin, 'npm'), 0o755)
  await writeFile(path.join(bin, 'npm.cmd'), `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`)
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH || ''}`)
  vi.stubEnv('WEAPP_CREATE_FIXTURE', '')
  await writeFile(path.join(directory, '.npmrc'), 'registry=https://configured.example/\n')
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('npm scaffold subprocess boundary', () => {
  it('queries and executes from the same real parent without overriding local npm registry configuration', async () => {
    const result = await createProject('weapp-vite', path.join(directory, 'app'), { template: 'react' })
    const calls = (await readFile(path.join(directory, 'npm-calls.jsonl'), 'utf8')).trim().split('\n').map((line) => {
      return JSON.parse(line) as { args: string[], cwd: string, npmrc: string }
    })
    expect(calls).toHaveLength(2)
    expect(calls.map(call => call.cwd)).toEqual([await realpath(directory), await realpath(directory)])
    expect(calls.every(call => call.npmrc === 'registry=https://configured.example/\n')).toBe(true)
    expect(calls[0].args).toEqual(['view', 'create-weapp-vite@latest', 'version', 'engines', '--json', '--fetch-retries=0', '--fetch-timeout=15000'])
    expect(calls[1].args).toEqual(['exec', '--yes', '--package=create-weapp-vite@3.0.9', '--', 'create-weapp-vite', 'app', 'react', '--no-install-skills'])
    expect(result.version).toBe('3.0.9')
  })

  it.each(['', 'error', 'invalid'])('clears the query timer and abort listener after completion: %s', async (mode) => {
    vi.stubEnv('WEAPP_CREATE_FIXTURE', mode)
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const controller = new AbortController()
    const query = queryScaffolder('create-weapp-vite', { cwd: directory, signal: controller.signal })
    if (mode === 'error') {
      await expect(query).rejects.toThrow(/configured npm registry/)
    }
    else if (mode === 'invalid') {
      await expect(query).rejects.toThrow(/invalid metadata/)
    }
    else {
      await expect(query).resolves.toEqual({ version: '3.0.9', engines: { node: '>=18' } })
    }
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    expect(clear).toHaveBeenCalled()
  })

  it('kills an in-flight metadata subprocess on cancellation and clears its abort listener', async () => {
    vi.stubEnv('WEAPP_CREATE_FIXTURE', 'hang')
    const controller = new AbortController()
    const query = queryScaffolder('create-weapp-vite', { cwd: directory, signal: controller.signal })
    // The actual child is running; cancellation must settle without waiting for npm's timeout.
    controller.abort()
    await expect(query).rejects.toHaveProperty('name', 'AbortError')
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('does not launch any subprocess for invalid directories or dry-runs', async () => {
    await expect(createProject('weapp-vite', path.join(directory, 'bad name'))).rejects.toThrow()
    await expect(createProject('weapp-vite', path.join(directory, 'app'), { dryRun: true })).resolves.toMatchObject({ dryRun: true })
    await expect(readFile(path.join(directory, 'npm-calls.jsonl'))).rejects.toHaveProperty('code', 'ENOENT')
  })
})
