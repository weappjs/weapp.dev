import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const units = ['apps/web', 'apps/open-source', 'packages/project-catalog', 'packages/site-ui']
const appPackages = ['@weapp.dev/web', '@weapp/open-source']
const excluded = new Set(['node_modules', 'dist', 'dist-pages', '.astro', '.cache', '.turbo', 'test-results', 'playwright-report', 'media-source'])

export function boundaryViolations(source, filename, unit, repositoryRoot = root) {
  const errors = []
  const snippets = filename.endsWith('.astro')
    ? [source.match(/^---[ \t]*\n([\s\S]*?)\n---/)?.[1] ?? '', ...[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1])]
    : [source]
  function check(value) {
    for (const other of units) {
      if (other !== unit && (value === other || value.startsWith(`${other}/`))) {
        errors.push(`Cross-unit filesystem reference: ${value}`)
      }
    }

    if (appPackages.some(name => value === name || value.startsWith(`${name}/`))) {
      errors.push(`Application packages cannot be dependencies: ${value}`)
    }
    if (unit === 'packages/project-catalog' && (value === '@weapp/site-ui' || value.startsWith('@weapp/site-ui/'))) {
      errors.push(`The data catalog cannot depend on UI: ${value}`)
    }
    const pathLike = value.startsWith('.') || isAbsolute(value)
    if (pathLike) {
      const target = resolve(dirname(filename), value)
      for (const other of units) {
        if (other !== unit && (target === resolve(repositoryRoot, other) || target.startsWith(`${resolve(repositoryRoot, other)}/`))) {
          errors.push(`Use public package exports; direct cross-unit path: ${value}`)
        }
      }
    }
  }
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      check(node.text)
    }
    ts.forEachChild(node, visit)
  }
  for (const snippet of snippets) {
    visit(ts.createSourceFile(filename, snippet, ts.ScriptTarget.Latest, true))
  }
  if (/\.(?:astro|css)$/.test(filename)) {
    const references = [...source.matchAll(/(?:@(?:import|source)|(?:src|href)\s*=)\s*['"]([^'"]+)['"]/g)]
    references.forEach(match => check(match[1]))
    const urls = [...source.matchAll(/url\(\s*['"]?([^'"\s)]+)/g)]
    urls.forEach(match => check(match[1]))
  }
  if (unit.startsWith('packages/') && /(?:from|import\()\s*['"][^'"]*(?:donation|sponsors|services|contact)/.test(source)) {
    errors.push('Commercial modules do not belong in shared packages')
  }
  return errors
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.filter(entry => !excluded.has(entry.name)).map((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  }))).flat()
}

export async function checkRepository() {
  const errors = []
  for (const unit of units) {
    const directory = resolve(root, unit)
    const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      if (appPackages.includes(name) || (unit === 'packages/project-catalog' && name === '@weapp/site-ui')) {
        errors.push(`${unit}: application dependency ${name}`)
      }
    }
    for (const filename of await files(directory)) {
      if (!/\.(?:ts|mjs|js|astro|css|json)$/.test(filename) || filename.endsWith('/package.json')) {
        continue
      }
      const source = await readFile(filename, 'utf8')
      errors.push(...boundaryViolations(source, filename, unit).map(error => `${relative(root, filename)}: ${error}`))
    }
  }
  if (errors.length) {
    throw new Error(errors.join('\n'))
  }
  console.log('Application, catalog, and UI dependency boundaries verified.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkRepository()
}
