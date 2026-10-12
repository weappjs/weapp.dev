// Fixed assets, shared by the build and loopback server. Never use catalog paths
// as request paths: this list is the entire project's public logo boundary.
export const projectLogoFiles = Object.freeze({
  'weapp-vite': 'weapp-vite.svg',
  'weapp-tailwindcss': 'weapp-tailwindcss.svg',
  'weapp-pandacss': 'weapp-pandacss.svg',
  'weapp-stylex': 'weapp-stylex.svg',
  'varo': 'varo.svg',
  'weapp-sqlite': 'miniprogram.svg',
  'vite-plugin-taro': 'vpt.svg',
  'vue-mini': 'vue-mini.png',
  'rezor': 'rezor.png',
  'uni-helper': 'uni-helper.svg',
  'wot-ui': 'wot-ui.svg',
} as const)

export type ProjectLogoSlug = keyof typeof projectLogoFiles
export interface ProjectLogo {
  url: string
  fallback: boolean
}

export const projectLogos: Readonly<Record<string, ProjectLogo>> = Object.freeze(Object.fromEntries(
  Object.entries(projectLogoFiles).map(([slug, file]) => [slug, {
    url: `/logos/${file}`,
    fallback: slug === 'weapp-sqlite',
  }]),
))
