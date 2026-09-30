import type { ProjectMetrics, ProjectMetricsMap } from '../src/types/project'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import process from 'node:process'
import { projectDefinitionSchema } from '../src/content/schemas'
import { hasSameProjectMetricValues, usesLiveMetrics } from '../src/lib/metrics'

interface ProjectSource {
  slug: string
  packageName: string
  github: string
  npmUrl?: string
  status: string
}

const root = resolve(import.meta.dirname, '..')
const fallbackPath = resolve(root, 'src/data/project-metrics.fallback.json')
const cachePath = resolve(root, '.cache/project-metrics.json')
const projectsPath = resolve(root, 'src/content/projects')

async function loadProjectSources(): Promise<ProjectSource[]> {
  const files = (await readdir(projectsPath)).filter(file => extname(file) === '.json').sort()
  return Promise.all(files.map(async (file) => {
    const definition = projectDefinitionSchema.parse(JSON.parse(await readFile(resolve(projectsPath, file), 'utf8')))
    if (typeof definition.packageName !== 'string' || typeof definition.github !== 'string') {
      throw new TypeError(`${file} must define packageName and github`)
    }
    return {
      slug: basename(file, '.json'),
      packageName: definition.packageName,
      github: definition.github,
      ...(definition.npmUrl ? { npmUrl: definition.npmUrl } : {}),
      status: String(definition.status),
    }
  }))
}

async function fetchJson<T>(url: string, headers: HeadersInit = {}): Promise<T> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

async function fetchMetrics(project: ProjectSource): Promise<ProjectMetrics> {
  const githubHeaders: HeadersInit = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'weapp.dev-build',
  }
  if (process.env['GITHUB_TOKEN']) {
    githubHeaders['Authorization'] = `Bearer ${process.env['GITHUB_TOKEN']}`
  }

  const [repository, registry, downloads] = await Promise.all([
    fetchJson<{ stargazers_count: number }>(`https://api.github.com/repos/${project.github}`, githubHeaders),
    fetchJson<{ 'dist-tags': { latest: string }, 'time': Record<string, string> }>(`https://registry.npmjs.org/${project.packageName}`),
    fetchJson<{ downloads: number }>(`https://api.npmjs.org/downloads/point/last-week/${project.packageName}`),
  ])
  const version = registry['dist-tags'].latest
  const releasedAt = registry.time[version]
  if (!version || !releasedAt || !Number.isFinite(repository.stargazers_count) || !Number.isFinite(downloads.downloads)) {
    throw new Error('The metrics response did not contain the expected fields')
  }

  return {
    version,
    releasedAt,
    stars: repository.stargazers_count,
    weeklyDownloads: downloads.downloads,
    fetchedAt: new Date().toISOString(),
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

const fallback = JSON.parse(await readFile(fallbackPath, 'utf8')) as ProjectMetricsMap
const next = { ...fallback }
const projectSources = await loadProjectSources()
const failures: string[] = []
const requireFresh = process.argv.includes('--require-fresh')
const updateFallback = process.argv.includes('--update-fallback')

await Promise.all(projectSources.map(async (project) => {
  if (!usesLiveMetrics(project)) {
    if (project.status === 'planned') {
      console.log(`Skipping live metrics for ${project.slug}: planned project`)
      return
    }
    if (!fallback[project.slug]) {
      failures.push(project.slug)
    }
    console.log(`Using fallback metrics for ${project.slug}: no public npm package`)
    return
  }
  try {
    next[project.slug] = await fetchMetrics(project)
    console.log(`Updated metrics for ${project.slug}`)
  }
  catch (error) {
    failures.push(project.slug)
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Using fallback metrics for ${project.slug}: ${message}`)
  }
}))

if (requireFresh && failures.length > 0) {
  throw new Error(`Failed to refresh metrics for: ${failures.sort().join(', ')}`)
}

await writeJsonAtomic(cachePath, next)
if (updateFallback) {
  const updatedFallback = Object.fromEntries(Object.entries(next).map(([slug, metrics]) => {
    const previous = fallback[slug]
    return [slug, previous && hasSameProjectMetricValues(previous, metrics) ? previous : metrics]
  })) as ProjectMetricsMap
  await writeJsonAtomic(fallbackPath, updatedFallback)
}
