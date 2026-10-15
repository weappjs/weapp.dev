import type { CreateOperations } from './plan.js'

export class CreateError extends Error {
  readonly zh: string
  readonly en: string

  constructor(zh: string, en: string) {
    super(en)
    this.zh = zh
    this.en = en
  }
}
export function cancellationError() {
  const error = new Error('Project creation cancelled.')
  error.name = 'AbortError'
  return error
}
export function checkCancellation(operations: Pick<CreateOperations, 'signal' | 'isCancelled'>): void {
  if (operations.signal?.aborted || operations.isCancelled?.()) {
    throw cancellationError()
  }
}
