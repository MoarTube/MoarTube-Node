# Database selection

The selected database owns the catalog and durable operational state: pending
Cloudflare invalidations and retry times, credentials needed to finish old-zone
invalidations, remote-write activity, CDN recovery, and stopped-stream cleanup.
These records are included in database backups. Older catalog-only backups can
still be restored.

PostgreSQL mode uses PostgreSQL advisory locks for cross-worker admission and
media writes. It does not open local SQLite coordination databases during normal
operation. SQLite mode uses the selected SQLite catalog for durable state and
local SQLite lock files for transient process coordination. Configuration,
credentials, logs, and media may remain on disk. Short writes to PostgreSQL-mode
configuration files use a local file lock, not another database.

Changing the selection requires an idle Node. Imports, publishing jobs, live
streams, active uploads, unfinished remote writes, pending invalidations, CDN
transitions, and stopped-stream cleanup must be stopped or completed first.
Both the current and destination databases are checked. A refusal leaves the
selection unchanged. The switch does not copy catalog data or move in-flight
operations; use the explicit backup/restore tools when a data transfer is wanted.

After a successful selection, restart MoarTube Node. Requests are refused with
HTTP 503 until that restart, so workers cannot continue serving with stale
database connections. Media and configuration are preserved.

On the first startup after upgrading, the primary process imports existing local
purge, remote-write, CDN, and stream-cleanup journals into the selected database.
This is a one-time compatibility step, not part of switching databases. It records
completion in the database and archives the old files with a `.migrated-...`
suffix. Subsequent startups and database selections ignore those archives.
Stop previous Node instances before upgrading.

Run `npm run test:database-authority` for the SQLite/PostgreSQL authority checks.
The tests create and drop uniquely named databases on the local test PostgreSQL
server at port 5432, using the same test credentials as the existing integration
suite. They do not use application databases.
