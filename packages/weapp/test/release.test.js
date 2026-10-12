import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
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
} from '../scripts/preflight.mjs'

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const workflow = readFileSync(
  new URL('../../../.github/workflows/publish-weapp.yml', import.meta.url),
  'utf8',
)
const script = readFileSync(
  new URL('../scripts/preflight.mjs', import.meta.url),
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
function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
function changed(path, value) {
  const cloned = structuredClone(manifest)
  let cursor = cloned
  const keys = path.split('.')
  for (const key of keys.slice(0, -1)) {
    cursor = cursor[key] ||= {}
  }
  cursor[keys.at(-1)] = value
  return cloned
}
async function expectSafeFailure(promise, stage, status) {
  const result = await promise.catch(error => error)
  expect(result).toBeInstanceOf(PreflightError)
  expect(result.stage).toBe(stage)
  expect(result.status).toBe(status)
  expect(result.message).not.toContain(jwt)
  expect(result.message).not.toContain(credential)
  expect(result.message).not.toContain(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
  return result
}

describe('weapp publication identity and artifact boundaries', () => {
  it('accepts only the public weapp package with the intended repository and minimum Node', () => {
    expect(validateManifest(manifest)).toEqual({
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
      ['optionalDependencies.local', 'file:../local'],
      ['peerDependencies.@weapp-io/catalog', '*'],
    ]) {
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
      '.env',
      'dist/.env.production',
      'node_modules/private/index.js',
    ]) {
      expect(() => validatePaths([...requiredPaths, extra]), extra).toThrow(
        PreflightError,
      )
    }
  })

  it('rejects existing versions and a different registry identity', () => {
    expect(() =>
      validateRegistryMetadata(
        { name: 'weapp', versions: { '0.0.1': {} } },
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
    const fetcher = vi.fn(async () =>
      response({ name: 'weapp', versions: { '0.0.1': {} } }),
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
    const body = vi.fn()
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

  it('requires a real matching tag and the same checked-out commit', () => {
    const sha = 'a'.repeat(40)
    const releaseEnv = { WEAPP_RELEASE_TAG: `weapp-v${manifest.version}`, GITHUB_REF: `refs/tags/weapp-v${manifest.version}`, GITHUB_SHA: sha }
    const git = vi.fn(() => sha)
    validateReleaseTag(manifest, releaseEnv, git)
    expect(git.mock.calls[0][0]).toEqual([
      'show-ref',
      '--verify',
      '--hash',
      `refs/tags/weapp-v${manifest.version}`,
    ])
    expect(git.mock.calls[1][0]).toEqual([
      'rev-parse',
      `refs/tags/weapp-v${manifest.version}^{commit}`,
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
      .fn()
      .mockResolvedValueOnce(response({ value: jwt }))
      .mockResolvedValueOnce(response({ token: credential }))
    const mask = vi.fn()
    expect(await verifyOidc({ env, fetcher, mask })).toEqual({
      verified: true,
    })
    const [url, request] = fetcher.mock.calls[0]
    expect(new URL(url).searchParams.get('audience')).toBe(
      'npm:registry.npmjs.org',
    )
    expect(new URL(url).searchParams.get('existing')).toBe('value')
    expect(request.method).toBe('GET')
    expect(request.headers.Authorization).toBe(
      `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    )
    const [exchangeUrl, exchange] = fetcher.mock.calls[1]
    expect(exchangeUrl).toBe(
      'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/weapp',
    )
    expect(exchange.method).toBe('POST')
    expect(exchange.headers.Authorization).toBe(`Bearer ${jwt}`)
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
    const fetcher = vi.fn()
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
      const invalid = vi.fn(async () => response(body))
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
      .fn()
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
        .fn()
        .mockResolvedValueOnce(response({ value: jwt }))
        .mockResolvedValueOnce(response(body))
      const mask = vi.fn()
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
    expect(workflow).toContain('node scripts/preflight.mjs --artifact')
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
