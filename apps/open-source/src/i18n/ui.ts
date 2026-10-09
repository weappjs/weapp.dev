import type { Locale } from '../types/project'

export const siteCopy = {
  'zh-CN': {
    languageName: '中文',
    alternateLanguage: 'English',
    nav: {
      projects: '项目',
      about: '关于',
      vision: '愿景',
      releases: '版本',
      github: 'GitHub',
      openMenu: '打开导航',
      closeMenu: '关闭导航',
      theme: '切换主题',
    },
    hero: {
      eyebrow: '为真实小程序工程而建',
      title: 'weapp.js.org',
      description: '汇集 JavaScript 与 TypeScript 小程序开源项目，从工程构建、样式与组件到运行时框架。',
      primary: '浏览开源项目',
      secondary: '查看 GitHub 组织',
      visualLabel: '构建透镜：源码、样式、构建与组件交付叠在同一层材料里。',
    },
    about: {
      eyebrow: '开源生态',
      title: '一个入口，发现小程序开源项目',
      description: 'weapp 是我们为小程序开源生态选择的共同名称。这里汇集 JavaScript 与 TypeScript 项目，帮助你了解各自的职责，并找到文档、源码和参与方式。',
      items: [
        {
          title: '找到项目',
          body: '按 weapp、Taro、Vue Mini、Rezor 和 uni-app 生态浏览，查看项目状态和适合的使用场景。',
        },
        {
          title: '了解边界',
          body: '构建、样式、组件、数据和运行时各有职责。项目可以独立采用，相关能力也可以组合。',
        },
        {
          title: '参与协作',
          body: '从真实仓库提交问题、改进文档或贡献代码。相关 weapp-* 仓库计划逐步汇集到 weappjs 组织，迁移前保留原有入口与维护者信息。',
        },
      ],
    },
    rail: {
      'label': '首页项目入口',
      'weapp': 'weapp',
      'taro': 'Taro',
      'vue-mini': 'Vue Mini',
      'rezor': 'Rezor',
      'uni-app': 'uni-app',
    },
    styling: {
      eyebrow: '样式工具',
      title: '选择适合你的样式写法',
      description: '用 Tailwind CSS 写原子类，用 Panda CSS 生成样式，或用 StyleX 编译样式。先看框架与平台适配范围，再选择适合现有项目的路线。',
      jump: '查看样式工具',
      action: '比较三个样式项目',
    },
    runtime: {
      eyebrow: 'Runtime',
      title: '选择小程序运行时',
      description: 'Vue Mini 提供 Vue 3 响应式与组合式 API，Rezor 提供 React Hooks。两条路线负责页面与状态更新，可按团队熟悉的写法和项目成熟度选择。',
    },
    ecosystems: {
      'weapp': {
        eyebrow: 'weapp 生态',
        title: '工程、组件与数据',
        description: 'weapp-vite 负责工程构建，Varo 提供可编辑组件源码，weapp-sqlite 规划本地数据能力。',
      },
      'taro': {
        eyebrow: 'Taro 生态',
        title: '把 Taro / React 工程接到 Vite',
        description: 'VPT 为已有 Taro 项目提供构建迁移入口。',
      },
      'uni-app': {
        eyebrow: 'uni-app 生态',
        title: 'Uni Helper 和 Wot UI',
        description: '它们服务 uni-app 组织，和 weapp 原生工具链分开列。',
      },
    },
    projects: {
      eyebrow: 'weapp 生态',
      title: '工程、样式、组件、数据',
      description: '覆盖工程、样式、组件与本地数据。样式路线按现有写法选择，各工具按需采用。',
      documentation: '阅读文档',
      details: '项目详情',
      weeklyDownloads: '周下载',
      stars: 'Stars',
      readinessTitle: '适配状态',
      readinessBody: '每个项目都可以独立采用，并通过明确的边界逐步组合成完整工具链。',
      status: {
        stable: '稳定版',
        beta: '测试版',
        planned: '规划中',
      },
      proof: {
        styleLabel: '样式构建',
        styleFile: 'app.wxss',
        buildLabel: '构建输出',
        buildFile: 'vite.config.ts',
        registryLabel: '组件注册',
        registryFile: 'registry.json',
        sqliteLabel: '数据能力',
        sqliteFile: 'database.ts',
        migrationLabel: '迁移边界',
      },
    },
    releases: {
      eyebrow: '最新版本',
      title: '持续发布，稳定演进',
      description: '版本信息在构建时从 npm 获取，并保留可靠的离线快照。',
      released: '发布于',
      viewPackage: '查看 npm',
    },
    collaboration: {
      eyebrow: '参与贡献',
      title: '从一个问题、一段文档开始',
      description: '在 weappjs 发现相关仓库，或进入项目自己的源码仓库参与讨论。这里的项目由各自维护者和社区共同维护。',
      action: '前往 weappjs',
    },
    project: {
      back: '返回工具栈',
      docs: '阅读文档',
      source: '查看源码',
      capabilities: '核心能力',
      platforms: '支持平台',
      metrics: '项目数据',
      version: '当前版本',
      downloads: '周下载',
      stars: 'GitHub Stars',
      futureDocs: '未来文档路径',
      futureDocsNote: '聚合文档上线后，此路径将成为 canonical 地址。',
      audience: '适合谁',
      useCases: '常见用法',
      install: '安装',
      copyInstall: '复制安装命令',
      copied: '已复制',
      visualProof: '真实运行结果',
      visualProofDescription: '以下截图来自项目官方仓库中的 demo 或回归基线，并在本站本地化保存。',
      faq: '常见问题',
      npm: '查看 npm',
      adjacentNote: '相邻工具和运行时能力可以按需组合，不要求一次性迁移整个项目。',
      readiness: '成熟度',
      readinessNote: '稳定性和发布状态以项目仓库与版本数据为准。',
      setupStatus: '当前不可直接安装',
      commandUnavailable: '该规划项目尚未发布安装命令。',
      plannedSetupNote: '该项目仍在规划中，安装命令将在正式发布后提供。',
    },
    footer: {
      description: 'JavaScript 与 TypeScript 小程序开源项目集合。',
      projects: '项目',
      resources: '资源',
      docs: '文档',
      source: '源码',
      releases: '版本订阅',
      privacy: '隐私说明',
      analyticsPreferences: '统计偏好',
      copyright: 'weapp.js.org，网站源码以 MIT License 开放。',
    },
    analytics: {
      dialogTitle: '统计偏好',
      dialogBody: '百度统计和 Google Analytics 在正式站点默认启用，用于了解访问与有限交互。你可以随时关闭。',
      enabled: '允许百度统计和 Google Analytics',
      privacySignal: '浏览器已启用全局隐私控制或“请勿跟踪”，第三方统计保持关闭。',
      save: '保存偏好',
      close: '关闭',
    },
    privacy: {
      eyebrow: '数据与隐私',
      title: '隐私说明',
      description: 'weapp.js.org 使用访问与有限交互统计来维护站点和改进开源项目内容。',
      updated: '更新日期：2026 年 9 月 22 日',
      contents: '本页目录',
      dataFlow: '数据流',
      dataFlowItems: [
        '访问站点',
        '检查统计偏好',
        '允许时发送统计',
      ],
      preferences: '打开统计偏好',
      sections: [
        {
          title: '收集哪些数据',
          body: '网站统计包括页面浏览、来源、国家或地区、设备类别、浏览器，以及项目、文档、GitHub、npm、语言和主题等有限交互。我们不向统计事件传入姓名、邮箱、输入内容、完整外链地址或用户身份。',
        },
        {
          title: '使用哪些服务',
          body: '正式站点使用百度统计和 Google Analytics 4 了解访问与有限交互。关闭统计或浏览器发出全局隐私控制、请勿跟踪信号时，不加载这两个平台；预览域名和本地开发也不会加载。',
        },
        {
          title: '如何控制统计',
          body: '你可以通过页脚的“统计偏好”随时允许或关闭第三方统计。选择保存在浏览器 localStorage 中。我们尊重 Global Privacy Control 和 Do Not Track，并在检测到这些信号时关闭第三方统计。',
        },
        {
          title: '数据用途与保留',
          body: '数据仅用于理解访问趋势、改善页面性能和评估开源项目内容。数据由对应平台按各自保留策略处理，我们不会出售这些数据，也不会用于广告个性化或跨站追踪。',
        },
      ],
    },
    notFound: {
      title: '页面不存在',
      description: '构建路径有效，但这里没有可发布的页面。返回首页继续浏览工具栈。',
      action: '返回首页',
      code: 'ROUTE_NOT_EMITTED',
    },
  },
  'en': {
    languageName: 'English',
    alternateLanguage: '中文',
    nav: {
      projects: 'Projects',
      about: 'About',
      vision: 'Vision',
      releases: 'Releases',
      github: 'GitHub',
      openMenu: 'Open navigation',
      closeMenu: 'Close navigation',
      theme: 'Change theme',
    },
    hero: {
      eyebrow: 'Built for real mini-app projects',
      title: 'weapp.js.org',
      description: 'Discover JavaScript and TypeScript open-source projects for mini-programs, from builds and styling to components and runtimes.',
      primary: 'Explore open-source projects',
      secondary: 'Visit the GitHub organization',
      visualLabel: 'Build lens: source, style, build, and component delivery in one layered material.',
    },
    about: {
      eyebrow: 'Open-source ecosystem',
      title: 'One starting point for mini-program open source',
      description: 'weapp is the umbrella name for our mini-program open-source ecosystem. Discover JavaScript and TypeScript projects, understand what each does, and find its documentation, source, and ways to contribute.',
      items: [
        {
          title: 'Find a project',
          body: 'Browse the weapp, Taro, Vue Mini, Rezor, and uni-app ecosystems, with project status and practical use cases.',
        },
        {
          title: 'Understand its role',
          body: 'Builds, styling, components, data, and runtimes have distinct responsibilities. Adopt tools independently or combine the capabilities you need.',
        },
        {
          title: 'Contribute together',
          body: 'Report issues, improve documentation, or contribute code in the original repositories. Related weapp-* repositories are planned to move into weappjs over time; current links and maintainer attribution remain in place until then.',
        },
      ],
    },
    rail: {
      'label': 'Homepage project links',
      'weapp': 'weapp',
      'taro': 'Taro',
      'vue-mini': 'Vue Mini',
      'rezor': 'Rezor',
      'uni-app': 'uni-app',
    },
    styling: {
      eyebrow: 'Styling tools',
      title: 'Choose how you write styles',
      description: 'Write utility classes with Tailwind CSS, generate styles with Panda CSS, or compile styles with StyleX. Check framework and platform support before choosing a path for your project.',
      jump: 'Explore styling tools',
      action: 'Compare the three styling projects',
    },
    runtime: {
      eyebrow: 'Runtime',
      title: 'Choose a mini-program runtime',
      description: 'Vue Mini brings Vue 3 reactivity and the Composition API; Rezor brings React Hooks. Choose the runtime for pages and state updates based on your team’s workflow and each project’s maturity.',
    },
    ecosystems: {
      'weapp': {
        eyebrow: 'weapp ecosystem',
        title: 'Builds, components, and data',
        description: 'weapp-vite handles builds, Varo provides editable component source, and weapp-sqlite plans local data support.',
      },
      'taro': {
        eyebrow: 'Taro ecosystem',
        title: 'Move a Taro / React project onto Vite',
        description: 'VPT provides a build migration path for existing Taro projects.',
      },
      'uni-app': {
        eyebrow: 'uni-app ecosystem',
        title: 'Uni Helper and Wot UI',
        description: 'They serve the uni-app org and are listed apart from the weapp native toolchain.',
      },
    },
    projects: {
      eyebrow: 'weapp ecosystem',
      title: 'Engineering, styling, components, data',
      description: 'Builds, styling, components, and local data. Choose a styling path for your workflow and adopt each tool as needed.',
      documentation: 'Read the docs',
      details: 'Project details',
      weeklyDownloads: 'Weekly downloads',
      stars: 'Stars',
      readinessTitle: 'Adoption status',
      readinessBody: 'Each project can be adopted independently and composed into the full toolchain through clear boundaries.',
      status: {
        stable: 'Stable',
        beta: 'Beta',
        planned: 'Planned',
      },
      proof: {
        styleLabel: 'STYLE BUILD',
        styleFile: 'app.wxss',
        buildLabel: 'BUILD OUTPUT',
        buildFile: 'vite.config.ts',
        registryLabel: 'REGISTRY',
        registryFile: 'registry.json',
        sqliteLabel: 'DATA LAYER',
        sqliteFile: 'database.ts',
        migrationLabel: 'MIGRATION',
      },
    },
    releases: {
      eyebrow: 'Latest releases',
      title: 'Ship steadily, evolve carefully',
      description: 'Release data is fetched from npm at build time with a reliable offline snapshot.',
      released: 'Released',
      viewPackage: 'View on npm',
    },
    collaboration: {
      eyebrow: 'Contribute',
      title: 'Start with an issue or a documentation fix',
      description: 'Discover repositories in weappjs, or join a project through its own source repository. Each project is maintained by its respective maintainers and community.',
      action: 'Visit weappjs',
    },
    project: {
      back: 'Back to the stack',
      docs: 'Read the docs',
      source: 'View source',
      capabilities: 'Core capabilities',
      platforms: 'Platforms',
      metrics: 'Project metrics',
      version: 'Current version',
      downloads: 'Weekly downloads',
      stars: 'GitHub Stars',
      futureDocs: 'Future documentation path',
      futureDocsNote: 'This path will become canonical when aggregated documentation launches.',
      audience: 'Who it is for',
      useCases: 'Common use cases',
      install: 'Install',
      copyInstall: 'Copy install command',
      copied: 'Copied',
      visualProof: 'Real runtime output',
      visualProofDescription: 'These images come from official project demos or regression baselines and are stored locally on this site.',
      faq: 'Frequently asked questions',
      npm: 'View on npm',
      adjacentNote: 'Adjacent tools and runtime capabilities can be composed as needed without migrating an entire project at once.',
      readiness: 'Maturity',
      readinessNote: 'Stability and release status follow the project repository and version data.',
      setupStatus: 'Not directly installable yet',
      commandUnavailable: 'This planned project does not have a published install command yet.',
      plannedSetupNote: 'This project is still planned; an install command will be provided after release.',
    },
    footer: {
      description: 'JavaScript and TypeScript open-source projects for mini-programs.',
      projects: 'Projects',
      resources: 'Resources',
      docs: 'Documentation',
      source: 'Source',
      releases: 'Release feed',
      privacy: 'Privacy notice',
      analyticsPreferences: 'Analytics preferences',
      copyright: 'weapp.js.org. Website source available under the MIT License.',
    },
    analytics: {
      dialogTitle: 'Analytics preferences',
      dialogBody: 'Baidu Analytics and Google Analytics are enabled by default on the production site to measure visits and limited interactions. You can turn them off at any time.',
      enabled: 'Allow Baidu Analytics and Google Analytics',
      privacySignal: 'Your browser has enabled Global Privacy Control or Do Not Track, so third-party analytics remains off.',
      save: 'Save preference',
      close: 'Close',
    },
    privacy: {
      eyebrow: 'Data and privacy',
      title: 'Privacy notice',
      description: 'weapp.js.org uses visit and limited interaction metrics to maintain the site and improve its open-source project content.',
      updated: 'Updated September 22, 2026',
      contents: 'On this page',
      dataFlow: 'Data flow',
      dataFlowItems: [
        'Visit the site',
        'Check analytics preferences',
        'Send metrics when allowed',
      ],
      preferences: 'Open analytics preferences',
      sections: [
        {
          title: 'What we collect',
          body: 'Website analytics includes page views, referrers, country or region, device category, browser, and limited interactions with projects, documentation, GitHub, npm, language, and theme controls. We do not pass names, email addresses, input content, complete outbound URLs, or user identities to analytics events.',
        },
        {
          title: 'Services we use',
          body: 'The production site uses Baidu Analytics and Google Analytics 4 to measure visits and limited interactions. Neither platform loads when analytics is disabled or the browser signals Global Privacy Control or Do Not Track. Preview domains and local development do not load them either.',
        },
        {
          title: 'Your controls',
          body: 'Use “Analytics preferences” in the footer to allow or disable third-party analytics at any time. Your choice is stored in localStorage. We honor Global Privacy Control and Do Not Track by keeping third-party analytics off.',
        },
        {
          title: 'Purpose and retention',
          body: 'We use the data only to understand traffic trends, improve page performance, and evaluate open-source project content. Each provider processes data under its retention policy. We do not sell this data or use it for personalized advertising or cross-site tracking.',
        },
      ],
    },
    notFound: {
      title: 'Page not found',
      description: 'The build path is valid, but no page was emitted here. Return home to explore the stack.',
      action: 'Return home',
      code: 'ROUTE_NOT_EMITTED',
    },
  },
} as const
export function getSiteCopy(locale: Locale) {
  return siteCopy[locale]
}

export function localizePath(locale: Locale, path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (locale === 'en') {
    return normalized === '/' ? '/en/' : `/en${normalized}`
  }
  return normalized
}

export function projectPath(locale: Locale, slug: string): string {
  return localizePath(locale, `/projects/${slug}/`)
}

export function alternatePath(locale: Locale, currentPath: string): string {
  if (locale === 'en') {
    return currentPath.replace(/^\/en(?=\/|$)/, '') || '/'
  }
  return currentPath === '/' ? '/en/' : `/en${currentPath}`
}
