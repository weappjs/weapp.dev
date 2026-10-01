const site = {
  origin: 'https://weapp.js.org',
  name: 'weapp.js.org',
  heroWordmark: 'weapp.js.org',
  organizationUrl: 'https://github.com/weappjs',
  repositoryUrl: 'https://github.com/weappjs/weapp.dev',
  outputDir: 'dist',
  navigation: [
    {
      id: 'projects',
      path: '/projects/',
      label: {
        'zh-CN': '项目',
        'en': 'Projects',
      },
    },
    {
      id: 'about',
      path: '/#about',
      label: {
        'zh-CN': '生态介绍',
        'en': 'Ecosystem',
      },
    },
    {
      id: 'releases',
      path: '/#releases',
      label: {
        'zh-CN': '最近发布',
        'en': 'Releases',
      },
    },
    {
      id: 'collaboration',
      path: '/#collaboration',
      label: {
        'zh-CN': '参与贡献',
        'en': 'Contribute',
      },
    },
  ],
} as const
export type SiteProfile = typeof site
export function getSiteProfile(): SiteProfile {
  return site
}
export function getBuildOutputDir(): 'dist' {
  return 'dist'
}
export function isRetiredOpenSourcePath(pathname: string): boolean {
  return /^\/(?:en\/)?(?:pricing|sponsors|contributors)\/?$/.test(pathname)
}
