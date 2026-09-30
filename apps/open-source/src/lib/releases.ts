import { isCanonicalNpmPackageUrl } from './npm'

export function getReleaseLink(status: string, npmUrl?: string): string | null {
  if (status === 'planned' || !npmUrl) {
    return null
  }
  return isCanonicalNpmPackageUrl(npmUrl) ? npmUrl : null
}
