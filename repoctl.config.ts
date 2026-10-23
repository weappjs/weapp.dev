import { defineMonorepoConfig } from 'repoctl'

// These private workspaces are build inputs, not npm release candidates.
// Explicit inputs replace repoctl's default package-directory coverage.
const releaseInputs = {
  weapp: [
    // Frozen dependency resolution and patches can change the bundled CLI
    // without changing a source import or the package's own manifest.
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'patches/**',
    'packages/weapp/**',
    '!packages/weapp/test/**',
    '!packages/weapp/CHANGELOG.md',
    'packages/project-catalog/package.json',
    'packages/project-catalog/src/paths.ts',
    'packages/project-catalog/src/content/schemas.ts',
    'packages/project-catalog/src/lib/npm.ts',
    'packages/project-catalog/src/content/projects/**',
    'packages/project-catalog/public/brands/**',
    'packages/site-ui/package.json',
    'packages/site-ui/src/scripts/hero-logo.ts',
    'packages/site-ui/src/scripts/hero-logo-data.ts',
    'packages/site-ui/src/lib/hero-brand.ts',
    'tsconfig.json',
  ],
}

export default defineMonorepoConfig({
  commands: {
    upgrade: {
      // Application CI and tooling already have repository-specific contracts.
      mergeTargets: false,
      targets: [
        '.github/workflows/release.yml',
        '.github/workflows/repoctl-docs.yml',
        '.github/workflows/repoctl-docs-deploy.yml',
        'lefthook.yml',
      ],
    },
    release: {
      branches: { stable: 'main', prerelease: [] },
      nightly: { provider: 'npm', schedule: '0 18 * * *' },
      qualityScripts: ['release:verify'],
      hooks: { afterVersion: ['release:build'] },
    },
    docs: {
      sites: {
        'web': {
          packages: ['weapp'],
          releaseInputs,
          buildScript: 'docs:web:build',
          preview: { deployScript: 'docs:deploy' },
          stable: { deployScript: 'docs:deploy', url: 'https://weapp.dev' },
          patchPaths: [],
        },
        'open-source': {
          packages: ['weapp'],
          releaseInputs,
          buildScript: 'docs:open-source:build',
          preview: { deployScript: 'docs:deploy' },
          stable: { deployScript: 'docs:deploy', url: 'https://weapp.js.org' },
          patchPaths: [],
        },
      },
    },
  },
})
