import { describe, expect, it } from 'vitest'
import { getReleaseLink } from './releases'

describe('release links', () => {
  it('returns the declared package URL for published projects', () => {
    expect(getReleaseLink('stable', 'https://www.npmjs.com/package/example')).toBe('https://www.npmjs.com/package/example')
  })

  it('does not invent links for planned or undocumented projects', () => {
    expect(getReleaseLink('planned', 'https://www.npmjs.com/package/example')).toBeNull()
    expect(getReleaseLink('stable')).toBeNull()
    expect(getReleaseLink('stable', 'http://www.npmjs.com/package/example')).toBeNull()
    expect(getReleaseLink('stable', 'not-a-url')).toBeNull()
    expect(getReleaseLink('stable', 'https://registry.npmjs.org/example')).toBeNull()
    expect(getReleaseLink('stable', 'https://www.npmjs.com/search?q=example')).toBeNull()
    expect(getReleaseLink('stable', 'https://www.npmjs.com/package/example?tab=readme')).toBeNull()
    expect(getReleaseLink('stable', 'https://www.npmjs.com/package/example#readme')).toBeNull()
  })
})
