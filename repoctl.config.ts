import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    release: {
      branches: { stable: 'main', prerelease: [] },
      qualityScripts: ['release:verify'],
      hooks: { afterVersion: ['release:build'] },
    },
  },
})
