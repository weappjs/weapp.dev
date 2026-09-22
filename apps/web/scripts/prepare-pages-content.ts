import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { isGithubPagesBuild } from '../src/lib/deployment'

// The full build keeps the checked-in public references verbatim.
if (isGithubPagesBuild() || process.argv[2]) {
  const root = resolve(process.argv[2] || join(import.meta.dirname, '..', 'dist-pages'))
  const publicRoot = resolve(import.meta.dirname, '..', 'public')
  const llms = (await readFile(join(publicRoot, 'llms.txt'), 'utf8'))
    .replace(/^- \[Sponsorship and services\].*$/m, '- [Open-source sponsorship](https://weapp.dev/pricing/): One-time sponsorship tiers with a 60/25/15 public split and a contributors fund.')
    .replace(/^- Sponsorship is not a purchase.*\n/m, '')

  const full = (await readFile(join(publicRoot, 'llms-full.txt'), 'utf8'))
    .replace(/## Delivery and sponsorship[\s\S]*$/, `## Open-source sponsorship

The sponsorship page at https://weapp.dev/pricing/ describes one-time permanent recognition tiers: ¥20 supporter, ¥200 Bronze, and ¥1,000 Silver. ¥200 and above may display a GitHub avatar, username, and profile link after GitHub identity confirmation, maintainer review, and explicit authorization. Approved records may be shown on weapp.dev, tw.weapp.dev, and vite.weapp.dev.

Confirmed open-source sponsorship is split net of payment fees: 60% core maintenance, 25% contributors fund, and 15% nearby open source. The contributors fund pays quarterly thank-you amounts for eligible merged work and optional bounties; if a quarter is under ¥500 it rolls forward. Destinations are announced quarterly. Public recognition never exposes payment amounts or private ledger data.

The contributor program at https://weapp.dev/contributors/ and https://weapp.dev/en/contributors/ explains how confirmed sponsorship is shared with eligible contributors.
`)

  const graphLinks = '\n## Sponsor graph\n\n- [Chinese sponsor graph](https://weapp.dev/sponsors/)\n- [English sponsor graph](https://weapp.dev/en/sponsors/)\n'
  await writeFile(join(root, 'llms.txt'), llms + graphLinks, 'utf8')
  await writeFile(join(root, 'llms-full.txt'), full + graphLinks, 'utf8')
}
