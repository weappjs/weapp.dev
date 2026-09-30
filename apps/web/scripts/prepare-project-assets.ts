import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectAssetsDirectory } from '@weapp/project-catalog/paths'

const output = resolve(import.meta.dirname, '../.cache/public')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(projectAssetsDirectory, output, { recursive: true })
await cp(resolve(import.meta.dirname, '../public'), output, { recursive: true })
