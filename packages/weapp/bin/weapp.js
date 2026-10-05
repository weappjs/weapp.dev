#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import process from 'node:process'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const links = [
  ['Website', 'https://weapp.js.org/'],
  ['Projects', 'https://weapp.js.org/en/projects/'],
  ['GitHub', 'https://github.com/weappjs'],
  ['Issues', 'https://github.com/weappjs/weapp.dev/issues'],
]

function renderHelp() {
  return [
    'weapp — JavaScript mini-program open-source ecosystem',
    '',
    ...links.map(([label, url]) => `${label}: ${url}`),
    '',
    'Usage:',
    '  npx weapp          Print the official ecosystem links',
    '  npx weapp --help   Show this help',
    '  npx weapp --version  Show the package version',
  ].join('\n')
}

function main(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    process.stdout.write(`${renderHelp()}\n`)
    return 0
  }

  if (args.length === 1 && args[0] === '--version') {
    process.stdout.write(`${packageJson.version}\n`)
    return 0
  }

  process.stderr.write(`Unknown option: ${args[0]}\n\n${renderHelp()}\n`)
  return 1
}

process.exitCode = main(process.argv.slice(2))
