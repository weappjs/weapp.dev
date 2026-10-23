import { appendFile } from 'node:fs/promises'
import process from 'node:process'
import { deployCloudflare, uploadPrPreview } from './cloudflare.mjs'
import { managedContext, prContext } from './context.mjs'
import { sanitizeMessage, writeDiagnostic } from './diagnostics.mjs'
import { deployPages } from './pages.mjs'

const [command, site] = process.argv.slice(2)
let context
let phase = 'context'
try {
  if (!['managed', 'pr'].includes(command)) {
    throw new Error('Usage: node scripts/docs-deployment/cli.mjs managed | pr <site>')
  }
  context = command === 'managed' ? managedContext() : await prContext(site)
  phase = 'provider'
  const result = command === 'pr'
    ? await uploadPrPreview(context)
    : context.site === 'open-source' && context.channel === 'stable'
      ? await deployPages(context)
      : await deployCloudflare(context)
  phase = 'output'
  if (command === 'pr' && process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `url=${result.url}\nversionId=${result.versionId}\n`)
  }
  await writeDiagnostic({ context, result, phase: 'complete' })
  console.log(JSON.stringify(result))
}
catch (error) {
  try {
    await writeDiagnostic({ context, site: command === 'pr' ? site : process.env.REPO_DOCS_SITE, channel: command === 'pr' ? 'pr' : process.env.REPO_DOCS_CHANNEL, phase, error })
  }
  catch (diagnosticError) {
    console.error(`Could not save deployment diagnostics: ${sanitizeMessage(diagnosticError.message)}`)
  }
  console.error(sanitizeMessage(error.message ?? error))
  process.exitCode = 1
}
