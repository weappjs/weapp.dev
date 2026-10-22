import type { ProjectDefinition } from '@weapp-io/project-catalog/types'
import type { EventEmitter } from 'node:events'
import type { Readable } from 'node:stream'
import type { CreateOperations, CreateWizardSelection } from './commands/create.js'
import type { CreateWizardHooks } from './commands/create/plan.js'
import type { LabHandle } from './lab.js'
import type { ProjectActionOptions } from './project/actions.js'
import type { discoverProject, PackageManagerName } from './project/context.js'
import type { Workbench } from './terminal/workbench.js'

export type Language = 'zh-CN' | 'en'
export type CatalogProject = Omit<ProjectDefinition, 'visuals'> & { slug: string, id: string }

export interface LogoPoint {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly brightness: number
  readonly colorIndex: number
  readonly sparkle: number
}

export interface LogoData {
  points: readonly LogoPoint[]
  viewBox?: number
  palette?: readonly { css: string, rgb: readonly number[] }[]
}

/** Streams stay structural so commands can capture output without owning a TTY. */
export interface CliInput extends Partial<Pick<EventEmitter, 'on' | 'removeListener'>>, Partial<Pick<Readable, 'pause' | 'resume' | 'isPaused'>> {
  isTTY?: boolean
  isRaw?: boolean
  readableFlowing?: boolean | null
  setRawMode?: (raw: boolean) => unknown
  [Symbol.asyncIterator]?: () => AsyncIterator<string | Uint8Array>
}

export interface CliOutput extends Partial<Pick<EventEmitter, 'on' | 'once' | 'removeListener'>> {
  write: (value: string) => unknown
  isTTY?: boolean
  columns?: number
  rows?: number
}

export interface CliOptions {
  lang?: Language
  noColor?: boolean
  noMotion?: boolean
  help?: boolean
  version?: boolean
  seed?: number
  duration?: number
  noOpen?: boolean
  all?: boolean
  ecosystem?: string
  status?: string
  json?: boolean
  open?: boolean
  template?: string
  dryRun?: boolean
  install?: boolean
  packageManager?: PackageManagerName
  output?: string
  format?: string
  force?: boolean
}

export interface CliContext {
  stdin: CliInput
  stdout: CliOutput
  stderr: CliOutput
  lang: Language
  color: boolean
  motion: boolean
  interactive: boolean
  resources: { lab?: LabHandle, workbench?: Workbench }
  openUrl: (url: string) => Promise<unknown>
  catalog?: CatalogProject[]
  logo?: LogoData | readonly LogoPoint[]
  version?: string
  hub?: boolean
  cancelled?: boolean
  cancelledCode?: number
  operationSignal?: AbortSignal
  createOperations?: CreateOperations
  projectOperations?: ProjectActionOptions
  discoverProject?: typeof discoverProject
  createWizard?: (route: string, options: CliOptions, hooks?: CreateWizardHooks) => Promise<CreateWizardSelection | null>
}

export type CliOverrides = Partial<CliContext> & { env?: NodeJS.ProcessEnv }
