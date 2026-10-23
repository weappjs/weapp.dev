import { strict as assert } from 'node:assert'
import { Buffer } from 'node:buffer'
import { GitHubClient } from 'repoctl'
import { it } from 'vitest'

const key = 'docs/open-source/stable'
const originalRevision = 'a'.repeat(40)
const updatedRevision = 'b'.repeat(40)
const original = { pending: { phase: 'building' } }
const requested = { pending: { phase: 'deploying' } }

// Exercise the installed client's actual HTTP reconciliation. GitHub Contents
// can reject a file update when another file advances the shared state branch.
function fixture(onPut) {
  const calls = []
  const delays = []
  const remote = { revision: originalRevision, value: original }
  const client = new GitHubClient({
    token: 'fixture-token',
    repository: 'weappjs/weapp.dev',
    apiUrl: 'https://github.example.invalid',
    retryAttempts: 3,
    retryDelay: 5,
    sleep: async (delay) => { delays.push(delay) },
    fetch: async (input, options) => {
      const url = new URL(input)
      assert.equal(url.origin, 'https://github.example.invalid')
      assert.equal(url.pathname, `/repos/weappjs/weapp.dev/contents/.repoctl-automation/${key}.json`)
      calls.push(options.method)
      if (options.method === 'GET') {
        assert.equal(url.searchParams.get('ref'), 'repoctl-release-state')
        return Response.json({ sha: remote.revision, content: Buffer.from(JSON.stringify(remote.value)).toString('base64') })
      }
      assert.equal(options.method, 'PUT')
      const body = JSON.parse(options.body)
      assert.equal(body.branch, 'repoctl-release-state')
      assert.equal(body.sha, originalRevision, 'A retry must not overwrite a changed target revision')
      assert.deepEqual(JSON.parse(Buffer.from(body.content, 'base64').toString()), requested)
      return onPut({ remote, putCount: calls.filter(method => method === 'PUT').length })
    },
  })
  return { client, calls, delays, remote }
}

const conflict = () => Response.json({ message: 'State branch advanced while updating another file' }, { status: 409 })

it('retries a shared-branch conflict after confirming the target file is unchanged', async () => {
  const test = fixture(({ remote, putCount }) => {
    if (putCount === 1) {
      return conflict()
    }
    remote.revision = updatedRevision
    remote.value = requested
    return Response.json({ content: { sha: updatedRevision } })
  })
  assert.equal(await test.client.writeAutomationState(key, requested, originalRevision), updatedRevision)
  assert.deepEqual(test.calls, ['PUT', 'GET', 'PUT'])
  assert.deepEqual(test.delays, [5])
})

it('refuses to retry when a competing writer changed the target file', async () => {
  const competing = { current: { deploymentId: 'other-deployment' } }
  const test = fixture(({ remote }) => {
    remote.revision = updatedRevision
    remote.value = competing
    return conflict()
  })
  await assert.rejects(test.client.writeAutomationState(key, requested, originalRevision), /another publisher advanced it/)
  assert.deepEqual(test.calls, ['PUT', 'GET'])
  assert.deepEqual(test.delays, [])
  assert.equal(test.remote.value, competing)
})

it('stops after bounded retries when the shared branch stays busy', async () => {
  const test = fixture(conflict)
  await assert.rejects(test.client.writeAutomationState(key, requested, originalRevision), /checkpoint write failed/)
  assert.deepEqual(test.calls, ['PUT', 'GET', 'PUT', 'GET', 'PUT', 'GET'])
  assert.deepEqual(test.delays, [5, 10])
  assert.equal(test.remote.revision, originalRevision)
  assert.equal(test.remote.value, original)
})

it('recovers an accepted write with a lost response without submitting it twice', async () => {
  const test = fixture(({ remote }) => {
    remote.revision = updatedRevision
    remote.value = requested
    throw new TypeError('Response was lost after GitHub accepted the write')
  })
  assert.equal(await test.client.writeAutomationState(key, requested, originalRevision), updatedRevision)
  assert.deepEqual(test.calls, ['PUT', 'GET'])
  assert.deepEqual(test.delays, [])
})
