import type { CodePart } from './code'

export function sqliteCode(locale: 'zh-CN' | 'en'): CodePart[] {
  return [
    { text: locale === 'zh-CN' ? '// 先在 vite.config.ts 注册 weappSqlite()\n// 静态代码示例 · 此页未运行数据库\n' : '// Register weappSqlite() in vite.config.ts first\n// Static code example · no database runs on this page\n', tone: 'comment' },
    { text: 'import ', tone: 'keyword' },
    { text: '{ openSqlite } from ' },
    { text: '\'@weapp-sqlite/weapp-vite/runtime\'', tone: 'string' },
    { text: '\n\n' },
    { text: 'const ', tone: 'keyword' },
    { text: 'db = await openSqlite({ name: ' },
    { text: '\'app.sqlite\'', tone: 'string' },
    { text: ' })\ntry {\n  const result = await db.query(\n    ' },
    { text: '\'SELECT ? AS message\'', tone: 'string' },
    { text: ', [' },
    { text: '\'hello\'', tone: 'string' },
    { text: '],\n  )\n  console.log(result.rows)\n}\nfinally {\n  await db.close()\n}' },
  ]
}
