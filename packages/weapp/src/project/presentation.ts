import type { CliContext } from '../types.js'
import type { ProjectContext, ProjectIssue } from './context.js'
import { sanitize, t } from '../shared.js'

export function issueLines(ctx: Pick<CliContext, 'lang'>, issues: ProjectIssue[]): string[] {
  return issues.flatMap(issue => [
    sanitize(ctx.lang === 'en' ? issue.message : issue.messageZh || issue.message),
    ...(issue.advice ? [sanitize(ctx.lang === 'en' ? issue.advice : issue.adviceZh || issue.advice)] : []),
  ])
}

/** A read-only summary shared by creation results and the existing-project home. */
export function projectLines(ctx: Pick<CliContext, 'lang'>, project: ProjectContext): string[] {
  const manager = project.packageManager
  return [
    `${t(ctx, '项目目录', 'Project directory')}: ${sanitize(project.projectRoot)}`,
    ...(project.manifest?.name ? [`${t(ctx, '名称', 'Name')}: ${sanitize(project.manifest.name)}`] : []),
    ...(project.frameworks.length ? [`${t(ctx, '框架', 'Frameworks')}: ${project.frameworks.join(', ')}`] : []),
    ...(project.workspace ? [`Workspace: ${sanitize(project.workspace.root)} (${sanitize(project.workspace.memberPath)})`] : []),
    ...(project.manifest ? [`${t(ctx, '包管理器', 'Package manager')}: ${manager.name ? `${manager.name}${manager.version ? `@${manager.version}` : ''} (${manager.source})` : t(ctx, '需要明确选择', 'Explicit selection required')}`] : []),
    ...issueLines(ctx, [...project.issues, ...manager.conflicts]),
    ...Object.entries(project.manifest?.scripts || {}).map(([name, script]) => `${sanitize(name)}: ${sanitize(script)}`),
  ]
}
