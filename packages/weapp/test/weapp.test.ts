import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
}

describe('weapp CLI', () => {
  it('prints official navigation links by default', () => {
    const result = run()

    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/https:\/\/weapp\.js\.org\//)
    expect(result.stdout).toMatch(/https:\/\/weapp\.js\.org\/en\/projects\//)
    expect(result.stdout).toMatch(/https:\/\/github\.com\/weappjs\/?\n/)
    expect(result.stdout).toMatch(/https:\/\/github\.com\/weappjs\/weapp\.dev\/issues/)
    expect(result.stderr).toBe('')
  })

  it('--help prints the same navigation entry point', () => {
    const result = run('--help')

    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/Usage:/)
    expect(result.stdout).toMatch(/npx weapp/)
    expect(result.stdout).not.toContain('play snake')
  })

  it('keeps the game reachable through its dedicated help', () => {
    const result = run('play', '--help', '--lang', 'en')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('play snake')
  })

  it.each([[], ['weapp-vite']])('requires a directory without an interactive terminal: create %j', (...args) => {
    const result = run('create', ...args, '--dry-run', '--lang', 'en')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: weapp create')
    expect(result.stdout).toBe('')
  })

  it('--version reports the package version', () => {
    const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, 'utf8'))
    const result = run('--version')

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(packageJson.version)
    expect(result.stderr).toBe('')
  })

  it('keeps the compiled CLI usable after the read-only README check', () => {
    const bundle = readFileSync(cli, 'utf8')
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/build.ts', '--check-readme'], { cwd: packageRoot, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(cli, 'utf8')).toBe(bundle)
    expect(run('--version').status).toBe(0)
  })

  it('rejects unknown options', () => {
    const result = run('--unknown')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/未知选项.*--unknown/)
    expect(result.stderr).toMatch(/Usage:/)
  })

  it('honors explicit language for errors, help and JSON without ANSI', () => {
    const missing = run('info', 'missing', '--lang', 'en')
    expect(missing.status).toBe(1)
    expect(missing.stderr).toMatch(/^Error:/)
    expect(missing.stderr).toContain('Unknown project')
    const badOption = run('--unknown', '--lang', 'zh-CN')
    expect(badOption.status).toBe(1)
    expect(badOption.stderr).toContain('未知选项')
    const catalog = run('projects', '--json', '--lang', 'zh-CN')
    expect(catalog.status).toBe(0)
    expect(JSON.parse(catalog.stdout)).toHaveLength(11)
    expect(catalog.stdout.includes(String.fromCharCode(27))).toBe(false)
  })

  it('README keeps the complete project catalog in both language sections', () => {
    const projectSlugs = [
      'weapp-vite',
      'weapp-tailwindcss',
      'varo',
      'weapp-sqlite',
      'vite-plugin-taro',
      'vue-mini',
      'rezor',
      'uni-helper',
      'wot-ui',
      'weapp-pandacss',
      'weapp-stylex',
    ]

    expect(readme.indexOf('<details>')).toBeGreaterThan(readme.indexOf('# weapp\n'))
    expect(readme).toMatch(/<summary>中文说明<\/summary>/)
    for (const slug of projectSlugs) {
      expect(readme).toMatch(new RegExp(`https://weapp\\.js\\.org/en/projects/${slug}/`))
      expect(readme).toMatch(new RegExp(`https://weapp\\.js\\.org/projects/${slug}/`))
    }
    expect(readme).not.toMatch(/npmjs\.com\/package\/weapp-sqlite/)
    expect(readme.match(/pnpm add @weapp-sqlite\/weapp-vite/g)).toHaveLength(2)
    expect(readme).toContain('weapp-sqlite is in beta')
    expect(readme).toContain('weapp-sqlite 处于测试阶段')
  })
})
