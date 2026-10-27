# Database setup and comment-cache provisioning

The TypeScript table schemas in `src/database/schemas/` define tables and indexes. Maintained operational SQL in `src/database/provisioning/comment-sql.ts` defines comment triggers and the existing-comment backfill. Generated migration history is not the only source of these definitions.

`npm run build`, `npm run dev`, `npm run dev:start`, and `npm run db:migrate` check both SQLite and PostgreSQL migration folders before proceeding. If a folder is completely absent, the preflight generates a new schema baseline. Builds then package those migrations. Generation and the source-tree migration CLI require the development dependencies. Packaged runtime startup provisions the database without those development tools. Building does not open or alter a database.

On startup, Node runs schema migrations and then provisions the operational SQL. `npm run db:migrate` uses this same initialization path. For SQLite, `DATABASE_URL` is a filesystem path and defaults to `./data/db/node_db.sqlite`; its parent directories are created. PostgreSQL requires `DATABASE_URL` and accepts either `DATABASE_DIALECT=postgres` or `postgresql`. The application startup still uses its configured database settings.

Provisioning is transactional and versioned with a fingerprint of the maintained SQL. Healthy restarts leave triggers, revisions, and database identity unchanged. Changed definitions or missing triggers cause a repair, rebuild of reply relationships, and comment-change backfill. A failed repair rolls back and prevents startup.

Each database receives an identity independent of per-video revisions. New databases and repaired provisioning receive a new identity. The watch page and explicit refresh use it to discard caches from a previous database even if video IDs, comment IDs, and revision numbers are reused. Existing caches from before identity support rebuild once.

## Starting with an empty database

`npm start -- --clean` deliberately removes the project-root `data/`, `drizzle/`, `dist/`, and `coverage/` directories, generates fresh SQLite and PostgreSQL migration baselines, rebuilds, and starts Node. This removes local settings, media, database records, and migration history; the default local database starts empty with its schema, triggers, and a new cache identity provisioned automatically. Incomplete old migration history does not block this reset. Cluster workers do not repeat the reset. Source files and installed dependencies remain in place.

Clean startup requires a source checkout and development dependencies. Once deletion begins, a later generation or build failure stops startup without restoring the erased data. This command resets the project-local installation; it does not erase externally configured data directories, PostgreSQL databases, or object storage.

Keep the maintained source files. If you discard generated `drizzle/` history as part of creating a new database, run `npm run build`; both dialect baselines will be regenerated. Start Node or run `npm run db:migrate` to apply the schema and install triggers. No custom SQL needs to be copied by hand.

## Existing database caveats

- Keep matching migration files and the database migration journal together. A new baseline is for an empty database; it is not a way to erase or reconstruct an existing database's migration history.
- Incomplete folders fail the build with an actionable error. The build does not overwrite or guess an existing history.
- Raw Drizzle commands only manage schema/history. Use the application's initialization or migration command for operational provisioning. `db:push` does not establish migration history and is not interchangeable with the deployment migration workflow.
- PostgreSQL requires permission to create/alter the application's tables, functions, and triggers.
- A fresh database has no video/catalog records. Media files and node settings live separately and are not reimported merely by recreating the schema.

Fresh baselines, source and bundled initialization, backfill, repair, rollback, healthy restarts, and browser database replacement are covered by regression tests.


## Direct replies and nested quotations

Only direct `>>number` references contribute reply backlinks. A line beginning with `>` is quoted material unless it starts with an exact `>>number` reference. References in quoted lines and longer `>>>number` runs remain clickable context, but do not create reply relationships. Plain-text inline direct references, adjacent references, and zero-padded IDs remain supported. Browser parsing, SQLite triggers, PostgreSQL triggers, and both database backfills use this same rule.

Updating the maintained SQL changes its provisioning fingerprint. The next application initialization or `npm run db:migrate` transactionally installs the new triggers and rebuilds existing relationships without changing comment text. It also rotates the cache identity so browsers and revision-specific CDN requests cannot keep treating old backlink metadata as current. Healthy subsequent starts do not repeat the rebuild.


The contextual quote composer prefixes each copied line with `> ` (including the space), while its direct reply header stays `>>number`. For example, copying `>123` produces `> >123`, never an accidental `>>123` reference. Repeated copying preserves both quotation depth and existing navigable references. Existing ambiguous text is left untouched because its author's intent cannot be recovered reliably.
