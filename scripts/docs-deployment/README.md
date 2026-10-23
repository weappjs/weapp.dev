# Website deployment adapters

These scripts are provider adapters for `repo docs deploy`. They do not select
release sources or advance repoctl's deployment pointer. repoctl owns those
operations and invokes the adapter inside its frozen checkout.

## Commands and build integration

- `node scripts/docs-deployment/cli.mjs managed`: deploy the site and channel in
  `REPO_DOCS_*`; write the confirmed result to `REPO_DOCS_RESULT_FILE`.
- `node scripts/docs-deployment/cli.mjs pr web` (or `open-source`): upload a Worker
  version from an already tested PR artifact; emit `url` and `versionId` through
  `GITHUB_OUTPUT`. This never writes repoctl state or changes Worker traffic.

Before testing the build, call `writeBuildIdentity(dist, env)` from `context.mjs`.
The resulting `repoctl-deployment.json` contains `schemaVersion: 1`, `site`,
`channel`, `sourceSha`, `releaseId`, and `deploymentId`. The adapter compares every
field before uploading. `buildIdentity(env)` is available when a build needs to
inspect these values. Ordinary local builds may have empty source/release IDs;
those artifacts cannot pass the managed deployment gate.

For a PR artifact, `await prContext(site, env, cwd)` returns the complete identity
computed from the trusted event. Write that exact identity to the artifact before
its tests. The page build still uses its preview/noindex presentation; the
artifact identity uses `channel: "pr"`. PR context requires `PR_NUMBER`,
`PR_HEAD_SHA`, and GitHub's `GITHUB_EVENT_PATH`; forks and non-PR events fail.
Both build and deployment jobs must explicitly check out the PR head SHA.
`prContext` also reads the actual Git HEAD and rejects synthetic merge commits
or any other checkout whose source differs from that head. Tests can inject
`{ readHead: () => sha }` as its fourth argument.

Managed deployment requires the `weappjs/weapp.dev` main workflow, a complete
source SHA, repoctl deployment ID and result path, and concurrency group
`docs-<site>-<channel>`. Stable requires a completed release ID. The build and
deployment receive the same environment from repoctl.

## Cloudflare targets

| Site/channel                        | Worker                      | Configuration                             |
| ----------------------------------- | --------------------------- | ----------------------------------------- |
| web/stable                          | `weapp-dev`                 | `apps/web/wrangler.jsonc`                 |
| web/preview and PR versions         | `weapp-dev-preview`         | `apps/web/wrangler.preview.jsonc`         |
| open-source/preview and PR versions | `weapp-open-source-preview` | `apps/open-source/wrangler.preview.jsonc` |

Wrangler is resolved from `@weapp-io/web`. Configurations use plain JSON syntax;
the preview configurations must enable `workers_dev` and `preview_urls`, omit
production routes, and point `assets.directory` at their application's `dist`.
The configured name and artifact directory are checked before invoking Wrangler.
Without a configured preview URL, the adapter queries the account's workers.dev
subdomain. Credentials are `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

Wrangler's `WRANGLER_OUTPUT_FILE_PATH` JSONL is the version source. The adapter
then independently verifies Cloudflare's active version, 100% traffic and
`workers/message` annotation. An already active matching deployment is reused.
PR upload reads `version-upload` output and verifies the version message and
alias. The uploaded version must not receive active traffic; a concurrent managed
main preview deployment may legitimately change the active version. PR comments
link to the immutable version preview URL, whose prefix must match the verified
version ID. The reusable `pr-N` alias is never used as the returned artifact link:
a cancelled upload or a later PR revision could move it to another commit.

New preview Workers require one managed main preview deployment first. Wrangler
4.151.3 explicitly rejects `versions upload` when the Worker does not yet exist.
After merging the migration to main, run Documentation for `web/preview` and
`open-source/preview` (or let its main-push run initialize both), then rerun PR
preview jobs. The PR adapter never substitutes `wrangler deploy` for this step.

## GitHub Pages

Only open-source/stable uses Pages, retaining `https://weapp.js.org`. The root
workspace installs exact `@actions/artifact` and `@actions/core` dependencies.
Execute repoctl from a Node.js action (for example a pinned
`actions/github-script` spawning `pnpm` with inherited `process.env`) so the
artifact SDK receives `ACTIONS_RUNTIME_TOKEN` and `ACTIONS_RESULTS_URL`.
A plain shell step does not supply the complete artifact runtime environment.

The job needs `contents: write`, `pages: write`, `id-token: write`, and
`GITHUB_TOKEN`. Both reusable-workflow callers must permit those permissions.
Use the `docs-open-source-stable` environment restricted to `main`, matching the
environment in the Pages REST request and repoctl's concurrency group.

The adapter uploads the official `artifact.tar` format, requests OIDC, creates
a Pages deployment, and polls the returned deployment ID. It only writes the
repoctl result after Pages reports success and the public identity file matches
the exact build. Every upload has a unique artifact name, so a safe retry within
the same workflow run does not collide with an earlier artifact. Tokens are never
included in reports.

Provider receipts are separate files on `repoctl-release-state`:
`provider-receipts/pages/<deploymentId>.json`. Each update uses the file revision
as a compare-and-swap condition. If a receipt write response is lost, the adapter
accepts it only after reading back the exact bytes and committed revision; a
different or unreadable state remains an error. These receipts never replace
repoctl's own state files. A known provider ID resumes polling without another upload. A lost
POST response is recovered only when the exact public artifact proves success;
otherwise the request remains pending and a second POST is prohibited. A known
terminal provider failure or definite creation rejection (400/401/403/404/422)
is recorded and can be retried, retaining its previous attempt. Conflicts, server
errors and connection failures preserve the unknown request. Keep the state
branch and receipts for recovery.

The CLI saves a sanitized success or failure summary under
`$GITHUB_WORKSPACE/.cache/docs-deployment/<site>-<channel>.json` for workflow
artifact collection. Outside Actions it uses the current workspace. Reports
contain the validated identity and provider result or failure phase, never the
environment or credentials.

Provider tests inject requests, commands, artifact clients, clocks and receipt
storage; running them performs no external deployment or publication.
