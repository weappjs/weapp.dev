import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const cli = fileURLToPath(new URL('../bin/weapp.js', import.meta.url))
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

function run(...args) {
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
  })

  it('--version reports the package version', () => {
    const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, 'utf8'))
    const result = run('--version')

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(packageJson.version)
    expect(result.stderr).toBe('')
  })

  it('rejects unknown options', () => {
    const result = run('--unknown')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/Unknown option: --unknown/)
    expect(result.stderr).toMatch(/Usage:/)
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
    ]

    expect(readme.indexOf('<details>')).toBeGreaterThan(readme.indexOf('# weapp\n'))
    expect(readme).toMatch(/<summary>中文说明<\/summary>/)
    for (const slug of projectSlugs) {
      expect(readme).toMatch(new RegExp(`https://weapp\\.js\\.org/en/projects/${slug}/`))
      expect(readme).toMatch(new RegExp(`https://weapp\\.js\\.org/projects/${slug}/`))
    }
    expect(readme).not.toMatch(/npmjs\.com\/package\/weapp-sqlite/)
    expect(readme).toMatch(/No install command is available yet\./)
    expect(readme).toMatch(/当前还没有安装命令。/)
  })
})
