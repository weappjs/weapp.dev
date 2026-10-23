import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { prContext, run, sites, writeBuildIdentity } from './docs-deployment/context.mjs'

export async function prepareIdentity(site, cwd, env) {
  if (!Object.hasOwn(sites, site)) {
    throw new Error(`Unknown site: ${site}`)
  }
  let identityEnv = { ...env, REPO_DOCS_SITE: site }
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    const { identity } = await prContext(site, env, cwd)
    identityEnv = {
      ...identityEnv,
      REPO_DOCS_CHANNEL: identity.channel,
      REPO_DOCS_SOURCE_SHA: identity.sourceSha,
      REPO_DOCS_RELEASE_ID: identity.releaseId,
      REPO_DOCS_DEPLOYMENT_ID: identity.deploymentId,
    }
  }
  await writeBuildIdentity(path.join(cwd, sites[site].directory, 'dist'), identityEnv)
}

async function retainEvidence(site, cwd, env) {
  if (env.GITHUB_ACTIONS !== 'true' || !env.GITHUB_WORKSPACE) {
    return
  }
  const destination = path.join(env.GITHUB_WORKSPACE, '.cache/docs-artifacts', site, env.REPO_DOCS_CHANNEL)
  await mkdir(destination, { recursive: true })
  for (const directory of ['dist', 'test-results']) {
    try {
      await cp(path.join(cwd, sites[site].directory, directory), path.join(destination, directory), { recursive: true })
    }
    catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }
}

export async function buildSite(site, { cwd = process.cwd(), env = process.env, execute = run, identityOnly = false } = {}) {
  if (!Object.hasOwn(sites, site)) {
    throw new Error(`Unknown site: ${site}`)
  }
  if (!['stable', 'preview'].includes(env.REPO_DOCS_CHANNEL)) {
    throw new Error('Website builds require REPO_DOCS_CHANNEL=stable or preview.')
  }
  if (env.REPO_DOCS_SITE && env.REPO_DOCS_SITE !== site) {
    throw new Error('The build script does not match the selected repoctl site.')
  }
  if (identityOnly) {
    return prepareIdentity(site, cwd, env)
  }

  const buildEnv = { ...env, REPO_DOCS_SITE: site, HUSKY: '0', LEFTHOOK: '0', PLAYWRIGHT_MCP_HEADLESS: 'true' }
  const command = args => execute('pnpm', args, { cwd, env: buildEnv })
  const application = site === 'web' ? '@weapp-io/web' : '@weapp-io/open-source'
  try {
    await command(['check:boundaries'])
    for (const [workspace, scripts] of [
      ['@weapp-io/project-catalog', ['check', 'lint', 'test']],
      ['@weapp-io/site-ui', ['lint', 'lint:styles', 'check', 'test']],
      [application, ['lint', 'lint:styles', 'check', 'test', 'build']],
    ]) {
      for (const script of scripts) {
        await command(['--filter', workspace, script])
      }
    }
    await prepareIdentity(site, cwd, buildEnv)
    await command(['--filter', application, 'exec', 'playwright', 'install', ...(env.CI ? ['--with-deps'] : []), 'chromium'])
    await command(['--filter', application, 'exec', 'playwright', 'test'])
  }
  finally {
    await retainEvidence(site, cwd, buildEnv)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [site, option, ...extra] = process.argv.slice(2)
  if (extra.length || (option && option !== '--identity-only')) {
    throw new Error('Usage: docs-build.mjs <web|open-source> [--identity-only]')
  }
  await buildSite(site, { identityOnly: option === '--identity-only' })
}
