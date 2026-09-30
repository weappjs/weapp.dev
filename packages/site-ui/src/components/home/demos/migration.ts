import type { CodePart } from './code'

/** Published quick start from the VPT project catalog; no inferred plugin options. */
export function migrationCode(locale: 'zh-CN' | 'en'): CodePart[] {
  return [
    { text: 'npm create vite-taro@latest my-app\n\n' },
    { text: locale === 'zh-CN' ? '# 复用 React 与 Taro 组件和 API\n# 官方 HMR 演示：标题更新，计数器仍为 5' : '# Reuse React and Taro components and APIs\n# Official HMR demo: heading updated, counter still at 5', tone: 'comment' },
  ]
}
