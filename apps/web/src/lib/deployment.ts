const site = {
  origin: 'https://weapp.dev',
  name: 'weapp.dev',
  heroWordmark: 'weapp.dev',
  organizationUrl: 'https://github.com/weappjs',
  repositoryUrl: 'https://github.com/weappjs/weapp.dev',
  outputDir: 'dist',
  navigation: [
    {
      id: 'services',
      path: '/#services',
      label: {
        'zh-CN': '服务',
        'en': 'Services',
      },
    },
    {
      id: 'projects',
      path: '/projects/',
      label: {
        'zh-CN': '项目',
        'en': 'Projects',
      },
    },
    {
      id: 'process',
      path: '/#process',
      label: {
        'zh-CN': '合作流程',
        'en': 'Process',
      },
    },
    {
      id: 'contact',
      path: '/pricing/#contact',
      label: {
        'zh-CN': '联系咨询',
        'en': 'Contact',
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
