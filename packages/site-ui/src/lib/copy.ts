export interface ProjectProofLabels {
  styleLabel: string
  styleFile: string
  buildLabel: string
  buildFile: string
  registryLabel: string
  registryFile: string
  sqliteLabel: string
  sqliteFile: string
  migrationLabel: string
}
export interface ProjectLabels {
  documentation: string
  details: string
  weeklyDownloads: string
  stars: string
  readinessTitle: string
  readinessBody: string
  status: { stable: string, beta: string, planned: string }
  proof: ProjectProofLabels
}
