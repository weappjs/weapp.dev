import assert from 'node:assert/strict'
import { cp, mkdir, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const source = process.env.WEAPP_VITE_SOURCE
assert(source, 'Set WEAPP_VITE_SOURCE to the installed weapp-vite checkout.')
const target = fileURLToPath(new URL('../.cache/retail-capture/', import.meta.url))
await mkdir(target, { recursive: true })
await cp(path.join(source, 'apps/tdesign-miniprogram-starter-retail'), target, {
  recursive: true,
  filter: file => !['node_modules', 'dist', '.weapp-vite'].includes(path.basename(file)),
})
await symlink(path.join(source, 'apps/tdesign-miniprogram-starter-retail/node_modules'), path.join(target, 'node_modules'), 'dir').catch((error) => {
  if (error.code !== 'EEXIST') {
    throw error
  }
})
// Keep the original goods fixture; omit only the performance suite's substitutions.
const { readFile } = await import('node:fs/promises')
const ts = await import(path.join(source, 'node_modules/typescript/lib/typescript.js'))
const goodPath = path.join(target, 'model/good.js')
const code = await readFile(goodPath, 'utf8')
const tree = ts.createSourceFile(goodPath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'genGood')
assert(fn?.body, 'Expected the native retail genGood fixture.')
const replacement = `{
  const item = allGoods.find(good => good.spuId === id) || allGoods[Number(id) % allGoods.length]
  return { ...item, spuId: String(id), available, desc: item.desc || defaultDesc }
}`
await writeFile(goodPath, code.slice(0, fn.body.getStart(tree)) + replacement + code.slice(fn.body.end))
console.log(`Prepared ${target}\nBuild with: rtk pnpm --dir '${target}' build`)
