import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discoverProject } from '../src/project/context.js'

let directory: string
beforeEach(async () => {
  directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'weapp-project-')))
  await mkdir(path.join(directory, '.git'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
async function json(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, JSON.stringify(value))
}

describe('read-only project discovery', () => {
  it('finds the nearest package from a nested directory and keeps the requested directory', async () => {
    await json(path.join(directory, 'package.json'), { name: 'root' })
    await json(path.join(directory, 'packages/app/package.json'), { name: 'app', scripts: { dev: 'vite' } })
    const cwd = path.join(directory, 'packages/app/src/components')
    await mkdir(cwd, { recursive: true })
    const project = await discoverProject(cwd)
    expect(project).toMatchObject({ requestedDirectory: cwd, projectRoot: path.join(directory, 'packages/app'), kind: 'package', manifest: { name: 'app', scripts: { dev: 'vite' } } })
    expect(project.workspace).toBeUndefined()
  })

  it('does not cross a Git boundary to inherit an unrelated package', async () => {
    await json(path.join(directory, 'package.json'), { name: 'outside' })
    const cwd = path.join(directory, 'nested-repository/src')
    await mkdir(path.join(directory, 'nested-repository/.git'), { recursive: true })
    await mkdir(cwd)
    expect(await discoverProject(cwd)).toMatchObject({ kind: 'unknown', projectRoot: cwd })
  })

  it('keeps a damaged nearest package invalid instead of selecting an ancestor or creation', async () => {
    await json(path.join(directory, 'package.json'), { name: 'parent' })
    const app = path.join(directory, 'app')
    await mkdir(app)
    await writeFile(path.join(app, 'package.json'), '{')
    const project = await discoverProject(app)
    expect(project).toMatchObject({ kind: 'invalid', projectRoot: app })
    expect(project.issues).toContainEqual(expect.objectContaining({ id: 'manifest', severity: 'error' }))
  })

  it('recognizes native and mixed projects without requiring framework dependencies', async () => {
    await json(path.join(directory, 'project.config.json'), { miniprogramRoot: 'mini/' })
    await json(path.join(directory, 'mini/app.json'), { pages: ['pages/index'] })
    const native = await discoverProject(path.join(directory, 'mini'))
    expect(native).toMatchObject({ kind: 'native', projectRoot: directory })
    expect(native.configs).toContainEqual({ path: 'mini/app.json', kind: 'json', status: 'valid' })
    await json(path.join(directory, 'package.json'), { name: 'native-with-tools' })
    expect(await discoverProject(directory)).toMatchObject({ kind: 'mixed', manifest: { name: 'native-with-tools' } })
  })

  it('keeps a nested native app independent of an unrelated parent package and its scripts', async () => {
    await json(path.join(directory, 'package.json'), { name: 'workspace-root', workspaces: ['packages/*'], packageManager: 'pnpm@10.0.0', scripts: { dev: 'node parent.js' } })
    const native = path.join(directory, 'packages/native')
    await json(path.join(native, 'app.json'), { pages: ['pages/index'] })
    const project = await discoverProject(native)
    expect(project).toMatchObject({ kind: 'native', projectRoot: native })
    expect(project.manifest).toBeUndefined()
    expect(project.workspace).toBeUndefined()
    expect(project.packageManager.source).toBe('default')
  })

  it('absorbs a native source app only when the parent identifies its conventional path', async () => {
    await json(path.join(directory, 'package.json'), { name: 'native-with-tools', scripts: { dev: 'vite' } })
    await json(path.join(directory, 'src/app.json'), { pages: ['pages/index'] })
    expect(await discoverProject(path.join(directory, 'src'))).toMatchObject({ kind: 'mixed', projectRoot: directory, manifest: { scripts: { dev: 'vite' } } })
  })

  it('does not let an unrelated non-mini-program app.json hide its parent Node package', async () => {
    await json(path.join(directory, 'package.json'), { name: 'node-project' })
    await json(path.join(directory, 'nested/app.json'), { name: 'application-metadata' })
    expect(await discoverProject(path.join(directory, 'nested'))).toMatchObject({ kind: 'package', projectRoot: directory, manifest: { name: 'node-project' } })
  })

  it('does not read a configured native root through an escaping symlink', async () => {
    const app = path.join(directory, 'app')
    await json(path.join(directory, 'outside/app.json'), { pages: [] })
    await json(path.join(app, 'project.config.json'), { miniprogramRoot: 'linked' })
    await symlink(path.join(directory, 'outside'), path.join(app, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const project = await discoverProject(app)
    expect(project.issues).toContainEqual(expect.objectContaining({ id: 'native-root' }))
    expect(project.configs.some(config => config.path.includes('linked'))).toBe(false)
  })

  it('validates pnpm member globs and exclusions before inheriting root settings', async () => {
    await json(path.join(directory, 'package.json'), { packageManager: 'pnpm@10.0.0' })
    await writeFile(path.join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - "{apps,packages}/*"\n  - "!packages/excluded"\n')
    await writeFile(path.join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9')
    await json(path.join(directory, 'packages/app/package.json'), { name: 'member' })
    await json(path.join(directory, 'packages/excluded/package.json'), { name: 'excluded' })
    const member = await discoverProject(path.join(directory, 'packages/app'))
    expect(member.workspace).toMatchObject({ root: directory, memberPath: 'packages/app', evidence: ['pnpm-workspace.yaml'] })
    expect(member.packageManager).toMatchObject({ name: 'pnpm', version: '10.0.0', source: 'declaration', conflicts: [] })
    const excluded = await discoverProject(path.join(directory, 'packages/excluded'))
    expect(excluded.workspace).toBeUndefined()
    expect(excluded.packageManager).toMatchObject({ name: 'npm', source: 'default' })
    expect(excluded.lockfiles).toEqual([])
  })

  it.each([['packages/*'], { packages: ['packages/*'], nohoist: ['**/react-native'] }])('supports npm and Yarn workspace declarations: %j', async (workspaces) => {
    await json(path.join(directory, 'package.json'), { workspaces, packageManager: 'yarn@4.0.0', engines: { node: '>=20' } })
    await json(path.join(directory, 'packages/app/package.json'), { name: 'app' })
    const project = await discoverProject(path.join(directory, 'packages/app'))
    expect(project.workspace).toMatchObject({ root: directory, memberPath: 'packages/app', manifest: { engines: { node: '>=20' } } })
    expect(project.packageManager.name).toBe('yarn')
  })

  it('does not treat a package symlink escaping a workspace as a member', async () => {
    const workspace = path.join(directory, 'workspace')
    const outside = path.join(directory, 'outside')
    await json(path.join(workspace, 'package.json'), { workspaces: ['packages/*'], packageManager: 'pnpm@10.0.0' })
    await json(path.join(outside, 'package.json'), { name: 'outside' })
    await mkdir(path.join(workspace, 'packages'))
    await symlink(outside, path.join(workspace, 'packages/linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const project = await discoverProject(path.join(workspace, 'packages/linked'))
    expect(project.projectRoot).toBe(outside)
    expect(project.workspace).toBeUndefined()
  })

  it('reports invalid workspace declarations without inheriting their manager', async () => {
    await json(path.join(directory, 'package.json'), { packageManager: 'pnpm@10.0.0' })
    await writeFile(path.join(directory, 'pnpm-workspace.yaml'), 'packages: [')
    await json(path.join(directory, 'packages/app/package.json'), {})
    const project = await discoverProject(path.join(directory, 'packages/app'))
    expect(project.workspace).toBeUndefined()
    expect(project.packageManager).toMatchObject({ name: 'npm', source: 'default' })
    expect(project.issues).toContainEqual(expect.objectContaining({ id: 'workspace' }))
  })

  it('rejects oversized or non-object package manifests', async () => {
    await writeFile(path.join(directory, 'package.json'), ' '.repeat(1024 * 1024 + 1))
    expect((await discoverProject(directory)).kind).toBe('invalid')
    await writeFile(path.join(directory, 'package.json'), '[]')
    expect((await discoverProject(directory)).kind).toBe('invalid')
  })

  it('never executes project configuration or scripts during discovery', async () => {
    const marker = path.join(directory, 'executed')
    await json(path.join(directory, 'package.json'), { scripts: { preinstall: `touch ${marker}` } })
    await writeFile(path.join(directory, 'vite.config.js'), `throw new Error('must not execute')`)
    const project = await discoverProject(directory)
    expect(project.configs).toContainEqual({ path: 'vite.config.js', kind: 'vite', status: 'detected' })
    await expect(readFile(marker)).rejects.toHaveProperty('code', 'ENOENT')
  })
})

describe('package manager resolution', () => {
  it('leaves multiple lockfile managers unresolved until an explicit choice', async () => {
    await json(path.join(directory, 'package.json'), {})
    await writeFile(path.join(directory, 'pnpm-lock.yaml'), '')
    await writeFile(path.join(directory, 'yarn.lock'), '')
    const unresolved = await discoverProject(directory)
    expect(unresolved.packageManager.name).toBeUndefined()
    expect(unresolved.packageManager.conflicts).toHaveLength(1)
    const explicit = await discoverProject(directory, { packageManager: 'pnpm' })
    expect(explicit.packageManager).toEqual({ name: 'pnpm', source: 'explicit', conflicts: [] })
    expect(explicit.lockfiles).toHaveLength(2)
  })

  it('uses a declaration despite other locks and rejects a conflicting explicit choice', async () => {
    await json(path.join(directory, 'package.json'), { packageManager: 'pnpm@10.0.0+sha512.abcdef' })
    await writeFile(path.join(directory, 'yarn.lock'), '')
    expect((await discoverProject(directory)).packageManager).toMatchObject({ name: 'pnpm', version: '10.0.0+sha512.abcdef', source: 'declaration', conflicts: [] })
    expect((await discoverProject(directory, { packageManager: 'npm' })).packageManager.conflicts).toContainEqual(expect.objectContaining({ id: 'package-manager-explicit' }))
  })

  it('keeps conflicting root/member declarations visible even with an explicit choice', async () => {
    await json(path.join(directory, 'package.json'), { workspaces: ['packages/*'], packageManager: 'pnpm@10.0.0' })
    await json(path.join(directory, 'packages/app/package.json'), { packageManager: 'pnpm@9.0.0' })
    const project = await discoverProject(path.join(directory, 'packages/app'), { packageManager: 'pnpm' })
    expect(project.packageManager).toMatchObject({ name: 'pnpm', version: '10.0.0', source: 'declaration' })
    expect(project.packageManager.conflicts).toContainEqual(expect.objectContaining({ id: 'package-manager-workspace', severity: 'error' }))
  })

  it.each(['pnpm@latest', 'pnpm@^10.0.0', 'pnpm@v10.0.0', 'other@1.0.0', 42])('does not silently replace an invalid declaration: %s', async (packageManager) => {
    await json(path.join(directory, 'package.json'), { packageManager })
    const project = await discoverProject(directory, { packageManager: 'npm' })
    expect(project.packageManager.name).toBeUndefined()
    expect(project.packageManager.conflicts).toContainEqual(expect.objectContaining({ id: 'package-manager-declaration', severity: 'error' }))
  })
})
