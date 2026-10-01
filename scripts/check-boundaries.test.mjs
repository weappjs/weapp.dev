import { strict as assert } from 'node:assert'
import { it } from 'vitest'
import { boundaryViolations } from './check-boundaries.mjs'

it('rejects cross-application imports and filesystem access', () => {
  for (const source of [
    'import x from \'../../open-source/src/lib/deployment\'',
    'readFile(new URL(\'../../open-source/src/i18n/ui.ts\', import.meta.url))',
    'import(\'@weapp/open-source\')',
  ]) {
    assert.ok(boundaryViolations(source, '/repo/apps/web/scripts/x.ts', 'apps/web', '/repo').length)
  }
})
it('allows local modules and public catalog exports', () => {
  assert.deepEqual(boundaryViolations('import x from \'../src/local\'; import y from \'@weapp/project-catalog/types\'', '/repo/apps/web/scripts/x.ts', 'apps/web', '/repo'), [])
})
it('rejects application modules in the shared catalog', () => {
  assert.ok(boundaryViolations('import x from \'../../../apps/web/src/lib/services\'', '/repo/packages/project-catalog/src/x.ts', 'packages/project-catalog', '/repo').length)
})

it('allows applications to consume UI but rejects UI in the catalog', () => {
  assert.deepEqual(boundaryViolations('import Hero from \'@weapp/site-ui/HomeHero.astro\'', '/repo/apps/web/src/x.ts', 'apps/web', '/repo'), [])
  assert.ok(boundaryViolations('import Hero from \'@weapp/site-ui/HomeHero.astro\'', '/repo/packages/project-catalog/src/x.ts', 'packages/project-catalog', '/repo').length)
})
it('checks Astro client scripts and CSS resources as well as frontmatter', () => {
  assert.ok(boundaryViolations('<script>import x from "../../open-source/src/client"</script>', '/repo/apps/web/src/x.astro', 'apps/web', '/repo').length)
  for (const directive of ['@import', '@source']) {
    assert.ok(boundaryViolations(`${directive} "../../open-source/src/styles.css";`, '/repo/apps/web/src/x.css', 'apps/web', '/repo').length)
  }
  assert.ok(boundaryViolations('<img src="../../open-source/public/logo.svg" />', '/repo/apps/web/src/x.astro', 'apps/web', '/repo').length)
})
it('rejects app dependencies in shared UI including filesystem reads', () => {
  assert.ok(boundaryViolations('readFile(new URL(\'../../../apps/web/src/lib/services.ts\', import.meta.url))', '/repo/packages/site-ui/src/x.ts', 'packages/site-ui', '/repo').length)
  assert.ok(boundaryViolations('import contact from \'./contact\'', '/repo/packages/site-ui/src/x.ts', 'packages/site-ui', '/repo').length)
})
