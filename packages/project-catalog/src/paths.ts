import { fileURLToPath } from 'node:url'

export const projectsDirectory = fileURLToPath(new URL('./content/projects/', import.meta.url))
export const showcasesDirectory = fileURLToPath(new URL('./content/showcases/', import.meta.url))
export const projectAssetsDirectory = fileURLToPath(new URL('../public/', import.meta.url))

export const projectMediaSourceDirectory = fileURLToPath(new URL('../media-source/', import.meta.url))
