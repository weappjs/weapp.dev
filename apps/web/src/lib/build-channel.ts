import process from 'node:process'

export type BuildChannel = 'stable' | 'preview'

/** Build-time deployment channel; it never changes the application's identity. */
export function getBuildChannel(value = process.env.REPO_DOCS_CHANNEL): BuildChannel {
  if (value === undefined || value === 'stable') {
    return 'stable'
  }
  if (value === 'preview') {
    return 'preview'
  }
  throw new Error(`Unsupported REPO_DOCS_CHANNEL: ${value}. Expected stable or preview.`)
}
