# Standalone architecture adjustment report

MoarTube Node now hosts and serves content without communicating with the retired
MoarTube backend platform. The maintained application is the TypeScript/Fastify
implementation in `src`.

## Removed

- Indexer HTTP service, dependency injection registration, startup dependency,
  and the cluster master's three-second index synchronization job.
- Video index submission, removal, update payloads, backend terms/Turnstile
  submission requirements, and image-to-base64 helpers used only by submissions.
- Backend node identification, token proof types/validation, identification file
  paths, and identification file reads/writes.
- Backend synchronization during node name, about, ID, network, avatar, and video
  metadata/length/view/stream updates.
- Index query/update repository methods and operational checks against indexing
  flags. Deletion and finalization retain importing, publishing, and streaming
  safeguards.
- Retired API endpoints: `GET /videos/:videoId/alias`,
  `POST /videos/:videoId/index/add`, `POST /videos/:videoId/index/remove`, and
  `POST /videos/:videoId/index/outdated`, including controllers and validators.
- Aliaser configuration, URL generation, alias share controls, and alias/index
  fields in formatted video data and video creation notifications.

## Replacement behavior

- Removed the obsolete central-service configuration files and their loading,
  validation, and application-config API. Startup uses node settings and environment
  variables directly.
- Sharing uses direct node watch URLs and local embed URLs. Social share URLs
  encode their parameters; Facebook sharing no longer uses a platform app ID.
- Page logos navigate to the node's own home page. Package/API documentation links
  point to the repository, and retired website guides/install-script references
  were removed from the README.
- Settings persist locally. Optional Cloudflare node-page invalidation remains
  available after personalization changes, without depending on indexed videos.
- Upload completion still invalidates optional CDN image caches.

## Compatibility and deployment notes

The `_src` directory is retained unchanged as a historical source of truth and
reference. It includes the previous implementation and its backend integrations.
The maintained standalone application and launchers use `src`/`dist`.

This release starts with fresh databases. The `drizzle` directory was regenerated
from the current standalone schemas: one `0000_standalone.sql`, initial snapshot,
and single-entry journal per dialect. Both video schemas contain 35 columns,
with no indexing state. No previous-build migration history, upgrade SQL, or
legacy upgrade test helper is included.

Initialize an empty SQLite or PostgreSQL database for this release. Existing
databases from previous builds are not supported by this fresh baseline.
PostgreSQL reports conflicting-table errors instead of silently skipping schema
initialization. Node settings remain independent of the Drizzle history.

Configure the node's public address and replace old `moartu.be` links with direct
node URLs. Direct links require the node's address to remain reachable. This
repository cannot keep retired domain redirects alive or modify previously shared
links.

MoarTube Client or other API consumers must remove indexing/alias calls and stop
depending on removed formatted-data/notification fields. No separate Client
repository was modified in this change.

Filesystem/SQLite operation, authentication, publishing, streaming, playback,
comments, chat, moderation, and operator-configured PostgreSQL/S3/Cloudflare
integrations remain. Axios is retained because Cloudflare uses it. Standalone
operation does not require those optional external providers.

## Validation

- `npm test`: 2,678 unit tests, 27 SQLite integration tests, and 30 PostgreSQL
  integration tests pass. Each suite reports 100% statement, branch, function,
  and line coverage within its configured scope.
- Regression coverage verifies endpoint absence, no indexer registration, startup
  without central-service configuration files, and normal video operations.
- Both real database suites verify fresh physical schema parity, one initial
  migration, idempotent initialization, persisted data, and migration failures.
- Obsolete backend mocks and indexing fields were removed from current test
  fixtures. Absence tests intentionally name the removed fields/endpoints.
- `npm run typecheck`, `npm run lint:src`, and `npm run build` pass.
- Integration tests also pass their dedicated TypeScript check.
- Node and watch EJS templates were rendered with sample data; inline scripts
  were parsed successfully and rendered output checked for retired service URLs.
- Source/template audit found no retired backend URLs or identification code in
  the active application. Fresh SQL creates the standalone schemas directly.
- `npm run lint` has an existing tooling limitation: it requests `tests`, while
  ESLint ignores that directory. Source lint was run successfully instead.

## Packaging audit

- Fixed the npm launcher to import the ESM build explicitly, including its `.js`
  extension. A subprocess smoke test using an isolated package layout passes.
- Fixed the Docker build stage to include `public` assets and `drizzle` migrations
  before tsup copies them into `dist`.
- Latest SQLite and PostgreSQL snapshots were checked for the standalone columns.
- `npm pack --dry-run --ignore-scripts` succeeds. The package contains the ESM
  launcher and both new migrations in source and bundled layouts, with no removed
  central configuration files or active indexer module. The restored `_src`
  reference tree is intentionally retained and may be included in npm packaging;
  it is not used by the standalone runtime.

Standalone here means independent of the retired MoarTube platform. Optional
operator-configured Cloudflare/S3/PostgreSQL integrations, browser wallet/CDN
scripts, and outbound social sharing remain. It does not imply offline operation.

Validation does not include a Docker image build, a manual browser playback/upload
session, or testing against a separately updated MoarTube Client. No operator
application database was migrated during this audit; database tests use disposable
fixtures.
