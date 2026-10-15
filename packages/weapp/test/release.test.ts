import type { PreflightFetcher, PreflightResponse } from '../scripts/preflight.js'
import { readFileSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { bundledDependencies, bundleReportPath, noticesPath, thirdPartyNotices, validateBundleCode, validatePublishedBundle } from '../scripts/bundle-policy.js'
import {
  PreflightError,
  requiredPaths,
  validateCiIdentity,
  validateManifest,
  validatePaths,
  validateRegistryMetadata,
  validateReleaseTag,
  verifyOidc,
  verifyUnpublished,
} from '../scripts/preflight.js'

const rawManifest: unknown = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const manifest = validateManifest(rawManifest)
const workflow = readFileSync(
  new URL('../../../.github/workflows/publish-weapp.yml', import.meta.url),
  'utf8',
)
const script = readFileSync(
  new URL('../scripts/preflight.ts', import.meta.url),
  'utf8',
)
const jwt
  = 'eyJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJucG06cmVnaXN0cnkubnBtanMub3JnIn0.c2lnbmF0dXJl'
const credential = 'npm_secret_exchange_credential'
const env = {
  GITHUB_ACTIONS: 'true',
  RUNNER_ENVIRONMENT: 'github-hosted',
  GITHUB_REPOSITORY: 'weappjs/weapp.dev',
  GITHUB_WORKFLOW_REF:
    'weappjs/weapp.dev/.github/workflows/publish-weapp.yml@refs/heads/main',
  ACTIONS_ID_TOKEN_REQUEST_URL:
    'https://actions.example.test/token?existing=value&audience=old',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'github-secret-request-token',
}
function response(body: unknown, status = 200): PreflightResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function changed(path: string, value: unknown): Record<string, unknown> {
  const cloned: unknown = structuredClone(rawManifest)
  if (!isRecord(cloned)) {
    throw new Error('Publication fixture must be an object')
  }
  let cursor = cloned
  const keys = path.split('.')
  for (const key of keys.slice(0, -1)) {
    const next = cursor[key]
    if (isRecord(next)) {
      cursor = next
    }
    else {
      const child: Record<string, unknown> = {}
      cursor[key] = child
      cursor = child
    }
  }
  cursor[keys[keys.length - 1]] = value
  return cloned
}
async function expectSafeFailure(promise: Promise<unknown>, stage: string, status?: number): Promise<PreflightError> {
  const result: unknown = await promise.catch((error: unknown) => error)
  expect(result).toBeInstanceOf(PreflightError)
  if (!(result instanceof PreflightError)) {
    throw new Error('Expected a safe publication failure')
  }
  expect(result.stage).toBe(stage)
  expect(result.status).toBe(status)
  expect(result.message).not.toContain(jwt)
  expect(result.message).not.toContain(credential)
  expect(result.message).not.toContain(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
  return result
}

describe('weapp publication identity and artifact boundaries', () => {
  it('accepts only the public weapp package with the intended repository and minimum Node', () => {
    expect(validateManifest(rawManifest)).toEqual({
      name: 'weapp',
      version: manifest.version,
    })
    for (const [path, value] of [
      ['name', '@weapp-io/site-ui'],
      ['private', true],
      ['type', 'commonjs'],
      ['version', 'v0.1.0'],
      ['version', 'main'],
      ['repository.url', 'git+https://github.com/sonofmagic/weapp.dev.git'],
      ['repository.directory', 'packages/not-weapp'],
      ['repository.type', 'svn'],
      ['publishConfig.access', 'restricted'],
      ['publishConfig.registry', 'https://registry.example.test'],
      ['engines.node', '>=20'],
      ['engines.node', '>=16'],
      ['engines.node', 'invalid'],
      ['bin.weapp', '../bin/weapp.js'],
      ['dependencies.local', 'workspace:*'],
      ['dependencies.qrcode', '1.5.4'],
      ['optionalDependencies.extra', '1.0.0'],
      ['peerDependencies.extra', '1.0.0'],
      ['bundledDependencies', ['qrcode']],
      ['bundleDependencies', true],
      ['optionalDependencies.local', 'file:../local'],
      ['peerDependencies.@weapp-io/catalog', '*'],
    ] satisfies [string, unknown][]) {
      expect(() => validateManifest(changed(path, value)), path).toThrow(
        PreflightError,
      )
    }
  })

  it('requires runtime data, lab fonts and licenses, and rejects path leaks', () => {
    expect(() => validatePaths([...requiredPaths])).not.toThrow()
    for (const required of requiredPaths) {
      expect(
        () => validatePaths(requiredPaths.filter(path => path !== required)),
        required,
      ).toThrow(`missing published resource: ${required}`)
    }
    for (const extra of [
      '../secret',
      '/absolute',
      'dist\\secret',
      'test/unit.js',
      'src/index.js',
      'scripts/publish.js',
      'dist/qrcode.d.ts',
      'dist/src/qr.js',
      '.env',
      'dist/.env.production',
      'node_modules/private/index.js',
    ]) {
      expect(() => validatePaths([...requiredPaths, extra]), extra).toThrow(
        PreflightError,
      )
    }
  })

  it('rejects external module leaks in both ESM and generated CommonJS calls', () => {
    expect(() => validateBundleCode(`import open from 'open'; import fs from 'node:fs'; await import('./create.js'); const req = createRequire(import.meta.url); req('node:path');`, 'cli.js')).not.toThrow()
    expect(() => validateBundleCode(`// require('pngjs')\nconst example = "import('qrcode')"; require_qrcode();`, 'cli.js')).not.toThrow()
    for (const code of [
      `import QRCode from 'qrcode'`,
      `export { default } from 'semver/functions/valid.js'`,
      `await import('string-width')`,
      `__cjs_require('pngjs')`,
      `require$1('yargs')`,
      `require.resolve('cross-spawn')`,
      `const load = createRequire(import.meta.url); load('dijkstrajs')`,
      `require(process.env.MODULE)`,
      `await import('../outside.js')`,
    ]) {
      expect(() => validateBundleCode(code, 'cli.js'), code).toThrow()
    }
  })

  it('ships the actual bundled dependency licenses and validates built chunk bytes', async () => {
    const notices = await thirdPartyNotices()
    expect(notices.packages.map(dependency => dependency.name).sort()).toEqual(Object.keys(bundledDependencies).sort())
    expect(notices.text).toContain('Copyright (c) 2009 Kazuhiko Arase')
    expect(notices.text).toContain('Copyright (c) 2011 Ryan Day')
    expect(notices.text).toContain('Wyatt Baldwin')
    expect(notices.packages.find(dependency => dependency.name === 'semver')?.license).toBe('ISC')
    await expect(validatePublishedBundle(fileURLToPath(new URL('../dist/', import.meta.url)))).resolves.toBeUndefined()
  })

  it('rejects a published artifact whose licenses, chunk bytes, or dependency inventory drift', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'weapp-bundle-guard-'))
    try {
      await cp(fileURLToPath(new URL('../dist/', import.meta.url)), directory, { recursive: true })
      const filename = join(directory, noticesPath)
      const notices = await readFile(filename, 'utf8')
      await writeFile(filename, `${notices}\nchanged`)
      await expect(validatePublishedBundle(directory)).rejects.toThrow('licenses changed')
      await writeFile(filename, notices)
      const entry = join(directory, 'cli.js')
      const code = await readFile(entry, 'utf8')
      await writeFile(entry, `${code}\n`)
      await expect(validatePublishedBundle(directory)).rejects.toThrow('bundle changed')
      await writeFile(entry, code)
      const report: unknown = JSON.parse(await readFile(join(directory, bundleReportPath), 'utf8'))
      expect(report).toHaveProperty('packages')
      if (typeof report !== 'object' || report === null || !('packages' in report) || !Array.isArray(report.packages)) {
        throw new Error('Expected built bundle report')
      }
      report.packages.pop()
      await writeFile(join(directory, bundleReportPath), JSON.stringify(report))
      await expect(validatePublishedBundle(directory)).rejects.toThrow('inventory differs')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects existing versions and a different registry identity', () => {
    expect(() =>
      validateRegistryMetadata(
        { name: 'weapp', versions: { '0.0.0': {} } },
        manifest,
      ),
    ).not.toThrow()
    expect(() =>
      validateRegistryMetadata(
        { name: 'weapp', versions: { [manifest.version]: {} } },
        manifest,
      ),
    ).toThrow('already published')
    for (const metadata of [
      null,
      {},
      { name: 'other', versions: {} },
      { name: 'weapp', versions: [] },
    ]) {
      expect(() => validateRegistryMetadata(metadata, manifest)).toThrow(
        PreflightError,
      )
    }
  })

  it('queries npm metadata without credentials and fails closed on network or status errors', async () => {
    const fetcher = vi.fn<PreflightFetcher>(async () =>
      response({ name: 'weapp', versions: { '0.0.0': {} } }),
    )
    await verifyUnpublished(manifest, fetcher)
    expect(fetcher.mock.calls[0][0]).toBe('https://registry.npmjs.org/weapp')
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty(
      'Authorization',
    )
    await expectSafeFailure(
      verifyUnpublished(manifest, async () => {
        throw new Error(credential)
      }),
      'metadata',
    )
    const body = vi.fn<() => Promise<unknown>>()
    const failure = await expectSafeFailure(
      verifyUnpublished(manifest, async () => ({
        ok: false,
        status: 503,
        json: body,
      })),
      'metadata',
      503,
    )
    expect(failure.message).toContain('HTTP 503')
    expect(body).not.toHaveBeenCalled()
  })

  it.each(['weapp@', 'weapp-v'])('requires a real matching %s tag and the same checked-out commit', (prefix) => {
    const sha = 'a'.repeat(40)
    const releaseTag = `${prefix}${manifest.version}`
    const releaseEnv = { WEAPP_RELEASE_TAG: releaseTag, GITHUB_REF: `refs/tags/${releaseTag}`, GITHUB_SHA: sha }
    const git = vi.fn<(args: string[]) => string>(() => sha)
    expect(validateReleaseTag(manifest, releaseEnv, git)).toBe(releaseTag)
    expect(git.mock.calls[0][0]).toEqual([
      'show-ref',
      '--verify',
      '--hash',
      `refs/tags/${releaseTag}`,
    ])
    expect(git.mock.calls[1][0]).toEqual([
      'rev-parse',
      `refs/tags/${releaseTag}^{commit}`,
    ])
    expect(() =>
      validateReleaseTag(manifest, { WEAPP_RELEASE_TAG: 'main' }, git),
    ).toThrow('tag must match')
    expect(() => validateReleaseTag(manifest, releaseEnv, () => '')).toThrow(
      'existing Git tag',
    )
    expect(() =>
      validateReleaseTag(manifest, releaseEnv, args =>
        args[1] === 'HEAD' ? 'b'.repeat(40) : sha),
    ).toThrow('checked-out commit')
    expect(() => validateReleaseTag(manifest, { ...releaseEnv, GITHUB_REF: 'refs/heads/main' }, git)).toThrow('workflow must run from the actual release tag')
    expect(() => validateReleaseTag(manifest, { ...releaseEnv, GITHUB_SHA: 'b'.repeat(40) }, git)).toThrow('workflow provenance commit')
  })

  it('rejects tag lookalikes, mismatched versions, and mixed canonical/legacy provenance', () => {
    const sha = 'a'.repeat(40)
    const git = vi.fn<(args: string[]) => string>(() => sha)
    for (const tag of [
      `weapp@v${manifest.version}`,
      `weapp-vv${manifest.version}`,
      `weapp@${manifest.version}-other`,
      `weapp-v${manifest.version}-other`,
      `refs/tags/weapp@${manifest.version}`,
      `weapp@${manifest.version}/extra`,
      'other@0.1.0',
      'weapp@99.99.99',
    ]) {
      expect(() => validateReleaseTag(manifest, { WEAPP_RELEASE_TAG: tag, GITHUB_REF: `refs/tags/${tag}`, GITHUB_SHA: sha }, git), tag).toThrow('tag must match')
    }
    expect(git).not.toHaveBeenCalled()
    for (const [tag, workflowTag] of [[`weapp@${manifest.version}`, `weapp-v${manifest.version}`], [`weapp-v${manifest.version}`, `weapp@${manifest.version}`]]) {
      expect(() => validateReleaseTag(manifest, { WEAPP_RELEASE_TAG: tag, GITHUB_REF: `refs/tags/${workflowTag}`, GITHUB_SHA: sha }, git)).toThrow('workflow must run from the actual release tag')
    }
  })
})

describe('explicit CI npm OIDC exchange', () => {
  it('requires the canonical repository/workflow and GitHub-hosted CI', () => {
    expect(() => validateCiIdentity(env)).not.toThrow()
    for (const [key, value] of [
      ['GITHUB_ACTIONS', 'false'],
      ['RUNNER_ENVIRONMENT', 'self-hosted'],
      ['GITHUB_REPOSITORY', 'sonofmagic/weapp.dev'],
      [
        'GITHUB_WORKFLOW_REF',
        'weappjs/weapp.dev/.github/workflows/weapp-cli.yml@refs/heads/main',
      ],
    ]) {
      expect(() => validateCiIdentity({ ...env, [key]: value }), key).toThrow(
        PreflightError,
      )
    }
  })

  it('requests the exact audience and exchanges JWT without a body or persistent token', async () => {
    const fetcher = vi
      .fn<PreflightFetcher>()
      .mockResolvedValueOnce(response({ value: jwt }))
      .mockResolvedValueOnce(response({ token: credential }))
    const mask = vi.fn<(value: string) => void>()
    expect(await verifyOidc({ env, fetcher, mask })).toEqual({
      verified: true,
    })
    const [url, request] = fetcher.mock.calls[0]
    expect(new URL(url).searchParams.get('audience')).toBe(
      'npm:registry.npmjs.org',
    )
    expect(new URL(url).searchParams.get('existing')).toBe('value')
    expect(request.method).toBe('GET')
    expect(request.headers?.Authorization).toBe(
      `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    )
    const [exchangeUrl, exchange] = fetcher.mock.calls[1]
    expect(exchangeUrl).toBe(
      'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/weapp',
    )
    expect(exchange.method).toBe('POST')
    expect(exchange.headers?.Authorization).toBe(`Bearer ${jwt}`)
    expect(exchange).not.toHaveProperty('body')
    expect(mask.mock.calls.map(([value]) => value)).toEqual([
      env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
      jwt,
      credential,
    ])
    expect(script).not.toMatch(
      /(?:writeFile|execute)\([^\n]*(?:exchange\.token|result\.value)/,
    )
    expect(script).not.toMatch(
      /execute\([^\n]*['"]publish['"]|npm publish --dry-run/,
    )
  })

  it('never falls back when credentials or a valid JWT are absent', async () => {
    const fetcher = vi.fn<PreflightFetcher>()
    for (const badEnv of [
      { ...env, ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' },
      { ...env, ACTIONS_ID_TOKEN_REQUEST_URL: '' },
      {
        ...env,
        ACTIONS_ID_TOKEN_REQUEST_URL: 'http://actions.example.test/token',
      },
    ]) {
      await expectSafeFailure(
        verifyOidc({ env: badEnv, fetcher }),
        'oidc-request',
      )
    }
    expect(fetcher).not.toHaveBeenCalled()
    for (const body of [null, {}, { value: '' }, { value: credential }]) {
      const invalid = vi.fn<PreflightFetcher>(async () => response(body))
      await expectSafeFailure(
        verifyOidc({ env, fetcher: invalid }),
        'oidc-request',
      )
      expect(invalid).toHaveBeenCalledTimes(1)
    }
  })

  it('reports stage/status without reading a rejected response or leaking network errors', async () => {
    const body = vi.fn(async () => ({ token: credential, value: jwt }))
    const rejected = vi
      .fn<PreflightFetcher>()
      .mockResolvedValueOnce(response({ value: jwt }))
      .mockResolvedValueOnce({ ok: false, status: 403, json: body })
    const error = await expectSafeFailure(
      verifyOidc({ env, fetcher: rejected }),
      'oidc-exchange',
      403,
    )
    expect(error.message).toBe('oidc-exchange: request rejected (HTTP 403)')
    expect(body).not.toHaveBeenCalled()
    await expectSafeFailure(
      verifyOidc({
        env,
        fetcher: async () => {
          throw new Error(`${credential} ${jwt}`)
        },
      }),
      'oidc-request',
    )
    await expectSafeFailure(
      verifyOidc({
        env,
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error(jwt)
          },
        }),
      }),
      'oidc-request',
      200,
    )
  })

  it('fails on missing exchange token and masks no rejected response text', async () => {
    for (const body of [
      null,
      {},
      { token: '' },
      { token: '  ' },
      { token: 123 },
    ]) {
      const fetcher = vi
        .fn<PreflightFetcher>()
        .mockResolvedValueOnce(response({ value: jwt }))
        .mockResolvedValueOnce(response(body))
      const mask = vi.fn<(value: string) => void>()
      await expectSafeFailure(
        verifyOidc({ env, fetcher, mask }),
        'oidc-exchange',
      )
      expect(mask.mock.calls.map(([value]) => value)).toEqual([
        env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
        jwt,
      ])
    }
  })
})

describe('publication workflow mode boundaries', () => {
  it('defaults dispatch to preflight/main and retains release publishing', () => {
    expect(workflow).toMatch(
      /mode:\n\s+description:[^\n]+\n\s+required: true\n\s+default: preflight\n\s+type: choice\n\s+options: \[preflight, publish\]/,
    )
    expect(workflow).toMatch(
      /tag:\n\s+description:[^\n]+\n\s+required: true\n\s+default: main/,
    )
    expect(workflow).toMatch(/release:\n\s+types: \[published\]/)
    expect(workflow).toContain('startsWith(github.event.release.tag_name, \'weapp@\')')
    expect(workflow).toContain('startsWith(github.event.release.tag_name, \'weapp-v\')')
    expect(workflow).toContain(
      `WEAPP_PREFLIGHT_MODE: \${{ github.event_name == 'release' && 'publish' || inputs.mode }}`,
    )
    expect(workflow).toContain('fetch-depth: 0')
  })

  it('only gives OIDC permission to the GitHub-hosted publish job and never defines an environment', () => {
    const [beforeJobs, jobs] = workflow.split('\njobs:\n')
    expect(beforeJobs).not.toContain('id-token: write')
    expect(jobs).toContain('  publish:')
    expect(jobs).toContain('runs-on: ubuntu-24.04')
    expect(jobs).toContain('id-token: write')
    expect(workflow.match(/id-token: write/g)).toHaveLength(1)
    expect(workflow).not.toMatch(/^\s+environment:/m)
  })

  it('requires preflight success before the one guarded publish call on its exact artifact', () => {
    expect(workflow).toContain('pnpm exec tsx scripts/preflight.ts --artifact')
    expect(workflow).toContain('pnpm --filter weapp exec tsx scripts/check-release.ts')
    expect(workflow).not.toContain('continue-on-error: true')
    expect(workflow).not.toMatch(/npm publish[^\n]*--dry-run/)
    const publishStep = workflow.slice(
      workflow.indexOf('      - name: Publish with npm provenance'),
    )
    expect(publishStep).toContain(
      'if: github.event_name == \'release\' || inputs.mode == \'publish\'',
    )
    expect(publishStep).toContain(
      `WEAPP_VALIDATED_ARTIFACT: \${{ steps.preflight.outputs.artifact }}`,
    )
    expect(publishStep).toContain(
      'npm publish "./$WEAPP_VALIDATED_ARTIFACT" --ignore-scripts --access public --provenance',
    )
    expect(workflow.match(/run: npm publish/g)).toHaveLength(1)
    expect(workflow.indexOf('id: preflight')).toBeLessThan(
      workflow.indexOf('      - name: Publish with npm provenance'),
    )
  })
})
