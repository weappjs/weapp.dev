import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSite } from './docs-build.mjs'

describe('frozen website verification', () => {
  it('tests the identified build and retains that exact artifact for deployment diagnostics', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'weapp-docs-build-'))
    const commands = []
    const env = {
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKSPACE: path.join(cwd, 'runner'),
      REPO_DOCS_SITE: 'web',
      REPO_DOCS_CHANNEL: 'preview',
      REPO_DOCS_SOURCE_SHA: 'a'.repeat(40),
      REPO_DOCS_DEPLOYMENT_ID: 'b'.repeat(64),
    }
    try {
      const dist = path.join(cwd, 'apps/web/dist')
      await buildSite('web', { cwd, env, execute: async (command, args, options) => {
        commands.push(args)
        expect(command).toBe('pnpm')
        expect(options.cwd).toBe(cwd)
        expect(options.env.REPO_DOCS_CHANNEL).toBe('preview')
        if (args.at(-1) === 'build') {
          await mkdir(dist, { recursive: true })
          await writeFile(path.join(dist, 'index.html'), '<h1>frozen source</h1>')
        }
        if (args.includes('playwright') && args.at(-1) === 'test') {
          const identity = JSON.parse(await readFile(path.join(dist, 'repoctl-deployment.json'), 'utf8'))
          expect(identity.sourceSha).toBe(env.REPO_DOCS_SOURCE_SHA)
          expect(identity.deploymentId).toBe(env.REPO_DOCS_DEPLOYMENT_ID)
        }
      } })
      expect(commands.filter(args => args.at(-1) === 'build')).toHaveLength(1)
      expect(await readFile(path.join(cwd, 'runner/.cache/docs-artifacts/web/preview/dist/index.html'), 'utf8')).toBe('<h1>frozen source</h1>')
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('fails before building when a quality gate fails', async () => {
    const commands = []
    await expect(buildSite('web', {
      env: { REPO_DOCS_CHANNEL: 'stable' },
      execute: async (_command, args) => {
        commands.push(args)
        throw new Error('boundary violation')
      },
    })).rejects.toThrow('boundary violation')
    expect(commands).toEqual([['check:boundaries']])
  })

  it('rejects an ambiguous channel or a mismatched configured site before executing anything', async () => {
    const execute = async () => {
      throw new Error('must not execute')
    }
    await expect(buildSite('web', { env: {}, execute })).rejects.toThrow('REPO_DOCS_CHANNEL')
    await expect(buildSite('web', { env: { REPO_DOCS_CHANNEL: 'preview', REPO_DOCS_SITE: 'open-source' }, execute })).rejects.toThrow('does not match')
  })
})
