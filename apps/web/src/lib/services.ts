import type { Locale, ProjectDefinition } from '../types/project'

// Commercial service coverage is independent of open-source project maturity.
const implementationProjects = new Set(['weapp-vite', 'weapp-tailwindcss'])

export function projectService(project: { id: string, data: ProjectDefinition }, locale: Locale) {
  const planned = project.data.status === 'planned'
  const available = !planned && implementationProjects.has(project.id)
  const zh = locale === 'zh-CN'
  return {
    available,
    planned,
    label: planned ? (zh ? '规划中，暂不提供实施' : 'Planned; implementation unavailable') : available ? (zh ? '可沟通迁移与培训' : 'Migration and training available') : (zh ? '需先评估适配范围' : 'Compatibility assessment required'),
    scope: planned
      ? (zh ? '该项目尚未发布。本页仅记录未来可能的应用方向，不提供安装、购买或交付承诺。' : 'This project has not shipped. This page records possible future uses, with no installation, purchase, or delivery commitment.')
      : available
        ? (zh ? '围绕现有仓库评估接入方式，从单页试点到项目迁移，并提供团队培训。具体平台、改动范围、验收标准与报价在评估后书面确认。' : 'Assess adoption in your repository, from a single-page pilot to project migration and team training. Platforms, scope, acceptance criteria, and pricing are agreed in writing after assessment.')
        : (zh ? '可将该项目作为技术选型讨论的背景资料。尚未确认针对该工具的实施服务；需先核对官方文档、维护者支持范围与实际仓库，不代表官方合作或支持承诺。' : 'This project can inform a technical selection discussion. Implementation services for this tool are not confirmed. Review the official documentation, maintainer support, and repository first; no official partnership or support commitment is implied.'),
    openSourceUrl: `https://weapp.js.org${locale === 'en' ? '/en' : ''}/projects/${project.id}/`,
  }
}
