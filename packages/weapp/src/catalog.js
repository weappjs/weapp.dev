import { sanitize, t, write } from './shared.js'

export const aliases = { vite: 'weapp-vite', tw: 'weapp-tailwindcss', vpt: 'vite-plugin-taro', taro: 'vite-plugin-taro', uni: 'uni-helper', vue: 'vue-mini' }
const ecosystems = ['weapp', 'taro', 'vue-mini', 'rezor', 'uni-app']
const statuses = ['stable', 'beta', 'planned']

/** Human discovery starts with weapp; machine output retains the whole catalog. */
export function mainProjects(catalog) {
  return catalog.filter(project => project.ecosystem === 'weapp')
}

export function findProject(catalog, input) {
  const key = input.toLowerCase()
  return catalog.find(project => project.slug === (aliases[key] || key) || project.packageName.toLowerCase() === key || Object.values(project.locales).some(locale => locale.name.toLowerCase() === key))
}

export function searchProjects(catalog, query = '', options = {}) {
  if (options.ecosystem && !ecosystems.includes(options.ecosystem)) {
    throw new Error(`Unknown ecosystem: ${options.ecosystem}. Choose ${ecosystems.join(', ')}`)
  }
  if (options.status && !statuses.includes(options.status)) {
    throw new Error(`Unknown status: ${options.status}. Choose ${statuses.join(', ')}`)
  }
  const needle = query.toLowerCase()
  const alias = aliases[needle]
  return catalog.filter((project) => {
    const terms = [project.slug, project.packageName, project.role, project.ecosystem, ...project.keywords, ...Object.values(project.locales).flatMap(locale => [locale.name, locale.tagline, locale.description, locale.audience, ...locale.useCases, ...locale.capabilities])].join(' ').toLowerCase()
    return (!options.ecosystem || project.ecosystem === options.ecosystem)
      && (!options.status || project.status === options.status)
      && (!needle || terms.includes(needle) || project.slug === alias)
  })
}

export function renderProject(ctx, project) {
  const content = project.locales[ctx.lang]
  const label = (zh, en) => t(ctx, zh, en)
  const start = project.status === 'planned'
    ? label('当前还没有安装命令。', 'No install command is available yet.')
    : project.quickStart?.command || project.installCommand
  const note = project.quickStart?.note
  return [
    `${sanitize(content.name)} · ${project.status}`,
    sanitize(content.tagline),
    '',
    sanitize(content.description),
    '',
    `${label('适合', 'Best for')}: ${sanitize(content.audience)}`,
    `${label('生态', 'Ecosystem')}: ${project.ecosystem} · ${project.role}`,
    `${label('平台', 'Platforms')}: ${(project.platforms || [label('待确认', 'To be confirmed')]).join(', ')}`,
    '',
    `${label('能力', 'Capabilities')}:`,
    ...content.capabilities.map(value => `  • ${sanitize(value)}`),
    '',
    `${label('场景', 'Use cases')}:`,
    ...content.useCases.map(value => `  • ${sanitize(value)}`),
    '',
    `${label('开始', 'Start')}: ${start || label('请查看官方指南', 'See the official guide')}`,
    ...(note ? [sanitize(typeof note === 'string' ? note : note[ctx.lang])] : []),
    `Docs: ${project.docsUrl}`,
    `Source: https://github.com/${project.github}`,
    ...(project.npmUrl ? [`npm: ${project.npmUrl}`] : []),
    `${label('相关项目', 'Related')}: ${project.relatedProjects.join(', ')}`,
  ].join('\n')
}

export function printProjects(ctx, projects, options) {
  if (options.json) {
    write(ctx, JSON.stringify(projects))
    return
  }
  if (!projects.length) {
    write(ctx, t(ctx, '没有匹配的项目。试试 vite、样式、Vue 或 uni。', 'No projects matched. Try vite, styling, Vue, or uni.'))
    return
  }
  for (const project of projects) {
    const content = project.locales[ctx.lang]
    write(ctx, `${sanitize(content.name)} [${project.status}] · ${project.ecosystem}\n  ${sanitize(content.tagline)}\n  weapp info ${project.slug}`)
  }
}
