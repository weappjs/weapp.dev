import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMonorepoConfig } from 'repoctl'
import ts from 'typescript'
import { it } from 'vitest'

const repository = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

// Follow actual build imports, including private workspace exports. A new
// transitive helper must not silently escape the released-source coverage.
function buildSources() {
  const pending = [
    'packages/weapp/scripts/build.ts',
    'packages/weapp/tsdown.config.ts',
    'packages/weapp/src/cli.ts',
    'packages/weapp/src/index.ts',
    'packages/weapp/src/terminal/session.ts',
    'packages/weapp/lab/app.ts',
  ].map(filename => path.join(repository, filename))
  const visited = new Set()
  while (pending.length) {
    const filename = pending.pop()
    if (visited.has(filename)) {
      continue
    }
    visited.add(filename)
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        && !node.isTypeOnly && !node.importClause?.isTypeOnly) {
        const resolution = ts.resolveModuleName(node.moduleSpecifier.text, filename, {
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          module: ts.ModuleKind.ESNext,
        }, ts.sys).resolvedModule
        if (resolution) {
          const target = realpathSync(resolution.resolvedFileName)
          if (target.startsWith(`${repository}${path.sep}`) && !target.includes(`${path.sep}node_modules${path.sep}`)
            && !target.endsWith('.d.ts')) {
            pending.push(target)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return [...visited].map(filename => path.relative(repository, filename).split(path.sep).join('/'))
}

it('covers the CLI build import graph in every website release source check', async () => {
  const config = await loadMonorepoConfig(repository)
  const sources = buildSources()
  assert.ok(sources.includes('packages/site-ui/src/lib/hero-brand.ts'))
  assert.ok(sources.includes('packages/project-catalog/src/lib/npm.ts'))
  for (const [site, settings] of Object.entries(config.commands.docs.sites)) {
    const patterns = settings.releaseInputs.weapp
    const included = patterns.filter(pattern => !pattern.startsWith('!'))
    const excluded = patterns.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
    const missing = sources.filter(filename => !included.some(pattern => path.matchesGlob(filename, pattern))
      || excluded.some(pattern => path.matchesGlob(filename, pattern)))
    assert.deepEqual(missing, [], `${site} can otherwise deploy CLI inputs that differ from the published package source`)
  }
})

it('requires a fresh publication when root dependency resolution or patches change', async () => {
  const config = await loadMonorepoConfig(repository)
  const inputs = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    ...readdirSync(path.join(repository, 'patches')).map(filename => `patches/${filename}`),
    // A new patch must be covered before it appears in an import graph.
    'patches/new-bundled-dependency.patch',
  ]
  for (const [site, settings] of Object.entries(config.commands.docs.sites)) {
    const patterns = settings.releaseInputs.weapp
    const included = patterns.filter(pattern => !pattern.startsWith('!'))
    const excluded = patterns.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
    const missing = inputs.filter(filename => !included.some(pattern => path.matchesGlob(filename, pattern))
      || excluded.some(pattern => path.matchesGlob(filename, pattern)))
    assert.deepEqual(missing, [], `${site} must reject dependency inputs newer than the published package source`)
  }
})
