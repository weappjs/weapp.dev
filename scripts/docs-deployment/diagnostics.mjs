import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { sites } from './context.mjs'

export function sanitizeMessage(value, env = process.env) {
  let message = String(value)
  const secrets = Object.entries(env)
    .filter(([key, secret]) => /token|secret|password|private.?key|authorization|credential|access.?key|api.?key/i.test(key) && typeof secret === 'string' && secret.length >= 4)
    .map(([, secret]) => secret)
    .sort((left, right) => right.length - left.length)
  for (const secret of secrets) {
    message = message.replaceAll(secret, '[REDACTED]')
  }
  return message
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[REDACTED JWT]')
    .replace(/\b(?:gh[pousr]_\w+|github_pat_\w+)\b/g, '[REDACTED TOKEN]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
}

export async function writeDiagnostic({ context, site, channel, result, error, phase, env = process.env, cwd = process.cwd() }) {
  const safeSite = Object.hasOwn(sites, context?.site ?? site ?? '') ? (context?.site ?? site) : 'unknown'
  const safeChannel = ['preview', 'stable', 'pr'].includes(context?.channel ?? channel) ? (context?.channel ?? channel) : 'unknown'
  const directory = path.join(env.GITHUB_WORKSPACE || cwd, '.cache/docs-deployment')
  const file = path.join(directory, `${safeSite}-${safeChannel}.json`)
  const diagnostic = {
    schemaVersion: 1,
    site: safeSite,
    channel: safeChannel,
    phase,
    status: error ? 'failed' : 'success',
    ...(context && { identity: Object.fromEntries(['schemaVersion', 'site', 'channel', 'sourceSha', 'releaseId', 'deploymentId']
      .map(key => [key, typeof context.identity[key] === 'string' ? sanitizeMessage(context.identity[key], env) : context.identity[key]])) }),
    ...(result && { result: { url: sanitizeMessage(result.url, env), versionId: sanitizeMessage(result.versionId, env) } }),
    ...(error && { message: sanitizeMessage(error.message ?? error, env).slice(0, 4000) }),
  }
  await mkdir(directory, { recursive: true })
  // Serialize only explicitly selected fields; never persist the environment,
  // provider request/response bodies, error objects or stack traces.
  await writeFile(file, `${JSON.stringify(diagnostic)}\n`)
  return file
}
