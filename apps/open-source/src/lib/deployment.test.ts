import { expect, it } from 'vitest'
import { getBuildOutputDir, getSiteProfile } from './deployment'

it('publishes a fixed application identity', () => {
  expect(getSiteProfile().origin).toBe('https://weapp.js.org')
  expect(getBuildOutputDir()).toBe('dist')
  expect(getSiteProfile()).not.toHaveProperty('features')
})
