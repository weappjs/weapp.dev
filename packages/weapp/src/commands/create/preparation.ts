import type { CreateOperations, CreateProgress, QueryOptions, ScaffolderMetadata, ScaffoldPlan } from './plan.js'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Validate npm engines with the complete semver grammar on Node 18.
import satisfies from 'semver/functions/satisfies.js'
// eslint-disable-next-line e18e/ban-dependencies -- Validate exact published versions before invoking npm.
import valid from 'semver/functions/valid.js'
// eslint-disable-next-line e18e/ban-dependencies -- Reject malformed upstream engine declarations before execution.
import validRange from 'semver/ranges/valid.js'
import { cancellationError, checkCancellation, CreateError } from './errors.js'

type PreparationTarget = Pick<ScaffoldPlan, 'package' | 'cwd'>
type PreparationOutcome = { metadata: ScaffolderMetadata } | { error: unknown }
interface PreparedQuery {
  packageName: string
  cwd: string
  controller: AbortController
  outcome: Promise<PreparationOutcome>
}
interface PreparationOptions extends Pick<CreateOperations, 'nodeVersion' | 'signal' | 'isCancelled'> {
  query: (packageName: string, options: QueryOptions) => Promise<ScaffolderMetadata>
}

export function validateScaffolderMetadata(packageName: string, metadata: ScaffolderMetadata, nodeVersion = process.versions.node): void {
  if (!metadata || !valid(metadata.version)) {
    throw new CreateError('脚手架版本元数据无效。', 'The scaffolder version metadata is invalid.')
  }
  const requirement = metadata.engines?.node
  if (requirement && (!validRange(requirement) || !satisfies(nodeVersion, requirement))) {
    throw new CreateError(`${packageName}@${metadata.version} 要求 Node ${requirement}；当前为 ${nodeVersion}。请升级 Node 后重试。`, `${packageName}@${metadata.version} requires Node ${requirement}; current version is ${nodeVersion}. Upgrade Node and retry.`)
  }
}

/** One invocation owns one active lookup; editing templates in the same directory reuses it. */
export class CreatePreparation {
  private active?: PreparedQuery
  private current?: CreateProgress
  private readonly listeners = new Set<(progress: CreateProgress) => void>()
  private disposed = false
  private readonly abort = () => this.active?.controller.abort()

  constructor(private readonly options: PreparationOptions) {
    options.signal?.addEventListener('abort', this.abort, { once: true })
  }

  readonly subscribe = (listener: (progress: CreateProgress) => void): (() => void) => {
    if (this.disposed) {
      return () => {}
    }
    this.listeners.add(listener)
    if (this.current) {
      listener(this.current)
    }
    return () => this.listeners.delete(listener)
  }

  progress(progress: CreateProgress): void {
    if (this.disposed) {
      return
    }
    this.current = progress
    for (const listener of this.listeners) {
      listener(progress)
    }
  }

  prepare(plan: PreparationTarget): void {
    this.lookup(plan)
  }

  async resolve(plan: PreparationTarget): Promise<ScaffolderMetadata> {
    const outcome = await this.lookup(plan).outcome
    if (this.disposed) {
      throw cancellationError()
    }
    checkCancellation(this.options)
    if ('error' in outcome) {
      throw outcome.error
    }
    return outcome.metadata
  }

  dispose(): void {
    this.disposed = true
    this.options.signal?.removeEventListener('abort', this.abort)
    this.abort()
    this.listeners.clear()
    this.current = undefined
  }

  private lookup(plan: PreparationTarget): PreparedQuery {
    if (this.active?.packageName === plan.package && this.active.cwd === plan.cwd) {
      return this.active
    }
    this.abort()
    const controller = new AbortController()
    const startedAt = Date.now()
    const entry: PreparedQuery = {
      packageName: plan.package,
      cwd: plan.cwd,
      controller,
      // The stored promise always fulfills, so failures while the user edits cannot leak.
      outcome: Promise.resolve({ error: cancellationError() }),
    }
    this.active = entry
    if (this.disposed || this.options.signal?.aborted || this.options.isCancelled?.()) {
      controller.abort()
      return entry
    }
    this.progress({ phase: 'querying', packageName: plan.package, cwd: plan.cwd })
    entry.outcome = new Promise<PreparationOutcome>((resolve) => {
      let settled = false
      let abort: () => void
      const finish = (outcome: PreparationOutcome): void => {
        if (settled) {
          return
        }
        settled = true
        controller.signal.removeEventListener('abort', abort)
        resolve(outcome)
        // A superseded query may ignore abort; it must never update the current screen.
        if (this.active !== entry || controller.signal.aborted || this.disposed) {
          return
        }
        const elapsedMs = Date.now() - startedAt
        this.progress({
          phase: 'metadata' in outcome ? 'ready' : 'failed',
          packageName: plan.package,
          cwd: plan.cwd,
          version: 'metadata' in outcome ? outcome.metadata.version : undefined,
          elapsedMs,
          queryElapsedMs: elapsedMs,
        })
      }
      abort = () => finish({ error: cancellationError() })
      controller.signal.addEventListener('abort', abort, { once: true })
      Promise.resolve().then(() => {
        checkCancellation({ ...this.options, signal: controller.signal })
        return this.options.query(plan.package, { cwd: plan.cwd, signal: controller.signal })
      }).then((metadata) => {
        checkCancellation({ ...this.options, signal: controller.signal })
        validateScaffolderMetadata(plan.package, metadata, this.options.nodeVersion)
        return metadata
      }).then(metadata => finish({ metadata }), error => finish({ error }))
    })
    return entry
  }
}
