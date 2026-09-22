import process from 'node:process'

export type DeploymentTarget = 'weapp' | 'github-pages'

export function getDeploymentTarget(value: string | undefined = process.env.WEAPP_DEPLOY_TARGET): DeploymentTarget {
  return value === 'github-pages' ? 'github-pages' : 'weapp'
}

export function isGithubPagesBuild(value: string | undefined = process.env.WEAPP_DEPLOY_TARGET): boolean {
  return getDeploymentTarget(value) === 'github-pages'
}

export function getBuildOutputDir(value: string | undefined = process.env.WEAPP_DEPLOY_TARGET): 'dist' | 'dist-pages' {
  return isGithubPagesBuild(value) ? 'dist-pages' : 'dist'
}
