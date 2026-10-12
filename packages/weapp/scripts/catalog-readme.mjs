const LANGUAGES = ['en', 'zh-CN']

function tableCell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\r?\n/g, '<br>')
}

export function renderCatalogTable(projects, lang) {
  const header = lang === 'en'
    ? '| Project | Status | Purpose |'
    : '| 项目 | 状态 | 定位 |'
  const rows = projects.map((project) => {
    const locale = project.locales[lang]
    const url = `https://weapp.js.org/${lang === 'en' ? 'en/' : ''}projects/${project.slug}/`
    return `| [${tableCell(locale.name)}](${url}) | ${tableCell(project.status)} | ${tableCell(locale.tagline)} |`
  })
  return [header, '| --- | --- | --- |', ...rows].join('\n')
}

function rowCells(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return null
  }
  const cells = []
  let cell = ''
  let escaped = false
  for (const character of trimmed.slice(1, -1)) {
    if (character === '|' && !escaped) {
      cells.push(cell.trim())
      cell = ''
    }
    else {
      cell += character
    }
    escaped = character === '\\' && !escaped
  }
  cells.push(cell.trim())
  return cells
}

function tableContent(block) {
  const rows = block.trim().split(/\r?\n/).map(rowCells)
  if (rows.length < 2 || rows.some(row => !row || row.length !== 3)) {
    return null
  }
  if (!rows[1].every(cell => /^:?-{3,}:?$/.test(cell))) {
    return null
  }
  // Padding and alignment in the separator row affect formatting, not catalog facts.
  return [rows[0], ...rows.slice(2)]
}

export function syncCatalogReadme(source, projects) {
  let readme = source
  const changedLanguages = []
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  for (const lang of LANGUAGES) {
    const start = `<!-- catalog:${lang}:start -->`
    const end = `<!-- catalog:${lang}:end -->`
    const startIndex = readme.indexOf(start)
    const endIndex = readme.indexOf(end)
    if (startIndex < 0 || endIndex < startIndex + start.length) {
      throw new Error(`README is missing catalog markers: ${lang}`)
    }
    if (readme.includes(start, startIndex + start.length) || readme.includes(end, endIndex + end.length)) {
      throw new Error(`README has duplicate catalog markers: ${lang}`)
    }
    const contentStart = startIndex + start.length
    const existing = readme.slice(contentStart, endIndex)
    const table = renderCatalogTable(projects, lang)
    const existingContent = tableContent(existing)
    if (existingContent && JSON.stringify(existingContent) === JSON.stringify(tableContent(table))) {
      continue
    }
    const replacement = `${newline}${newline}${table.replaceAll('\n', newline)}${newline}${newline}`
    readme = readme.slice(0, contentStart) + replacement + readme.slice(endIndex)
    changedLanguages.push(lang)
  }
  return { readme, changed: changedLanguages.length > 0, changedLanguages }
}
