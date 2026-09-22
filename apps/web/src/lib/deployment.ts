import process from 'node:process'

export type DeploymentTarget = 'weapp' | 'github-pages'

export interface SiteNavigationEntry {
  id: string
  path: string
  label: { 'zh-CN': string, 'en': string }
}

export interface SiteProfile {
  target: DeploymentTarget
  origin: string
  name: string
  heroWordmark: string
  organizationUrl: string
  repositoryUrl: string
  outputDir: 'dist' | 'dist-pages'
  features: { services: boolean, sponsorship: boolean }
  navigation: SiteNavigationEntry[]
}

const projectNavigation: SiteNavigationEntry = { id: 'projects', path: '/projects/', label: { 'zh-CN': '项目', 'en': 'Projects' } }
const releaseNavigation: SiteNavigationEntry = { id: 'releases', path: '/#releases', label: { 'zh-CN': '最近发布', 'en': 'Releases' } }
const shared = {
  organizationUrl: 'https://github.com/weappjs',
  repositoryUrl: 'https://github.com/weappjs/weapp.dev',
}

const profiles: Record<DeploymentTarget, SiteProfile> = {
  'weapp': {
    ...shared,
    target: 'weapp',
    origin: 'https://weapp.dev',
    name: 'weapp.dev',
    heroWordmark: 'weapp.dev',
    outputDir: 'dist',
    features: { services: true, sponsorship: true },
    navigation: [projectNavigation, { id: 'about', path: '/#about', label: { 'zh-CN': '关于', 'en': 'About' } }, releaseNavigation, { id: 'services', path: '/pricing/#services', label: { 'zh-CN': '迁移与培训', 'en': 'Services' } }],
  },
  'github-pages': {
    ...shared,
    target: 'github-pages',
    origin: 'https://weapp.js.org',
    name: 'weapp.js.org',
    heroWordmark: 'weapp',
    outputDir: 'dist-pages',
    features: { services: false, sponsorship: false },
    navigation: [projectNavigation, { id: 'about', path: '/#about', label: { 'zh-CN': '生态介绍', 'en': 'Ecosystem' } }, releaseNavigation, { id: 'collaboration', path: '/#collaboration', label: { 'zh-CN': '参与贡献', 'en': 'Contribute' } }],
  },
}

export function getDeploymentTarget(value: string | undefined = process.env.WEAPP_DEPLOY_TARGET): DeploymentTarget {
  return value === 'github-pages' ? 'github-pages' : 'weapp'
}

export function getSiteProfile(value: string | undefined = process.env.WEAPP_DEPLOY_TARGET): SiteProfile {
  return profiles[getDeploymentTarget(value)]
}

export function isRetiredOpenSourcePath(pathname: string): boolean {
  return /^\/(?:en\/)?(?:pricing|sponsors|contributors)\/?$/.test(pathname)
}

export function isGithubPagesBuild(value: string | undefined = process.env.WEAPP_DEPLOY_TARGET): boolean {
  return getDeploymentTarget(value) === 'github-pages'
}

export function getBuildOutputDir(value: string | undefined = process.env.WEAPP_DEPLOY_TARGET): 'dist' | 'dist-pages' {
  return getSiteProfile(value).outputDir
}
