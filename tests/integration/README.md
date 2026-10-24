# Database integration tests

The SQLite suite uses real better-sqlite3 connections, real Drizzle queries, and
the shipped `drizzle/sqlite` migrations. No database or ORM mocks are used.
Each repository test owns a fresh database file in an OS temporary directory;
native handles are closed and temporary files removed after each test. These
tests do not read application configuration or touch the application's database.

The PostgreSQL suite connects to the existing local Docker server at
`localhost:5432`, using username `postgres`, password `postgres`, and the
`postgres` database as its administration connection. The server must be running;
the tests fail if it is unavailable rather than silently skipping PostgreSQL.
No container creation or extra configuration is required.

Each PostgreSQL test creates a uniquely named `moartube_test_<uuid>` database,
runs the shipped `drizzle/postgres` migrations through the production connection
module, and closes its connections and drops that database afterward. The
`postgres` role needs permission to create databases, as provided by the standard
Docker setup. Existing databases and records are not used for repository tests.
Both backends exercise all nine repositories. PostgreSQL also verifies bigint
timestamps, independent connections, database isolation/cleanup, and transactional
migration rollback.

Run from the repository root (use `npm.cmd` in PowerShell if `npm.ps1` is blocked):

```sh
npm test
```

`npm test` runs three separate Vitest processes and generates three reports:

| Suite                        | HTML report                                | Coverage scope                                   |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------ |
| Unit tests, including mocks  | `coverage/index.html`                      | All application source                           |
| SQLite integration tests     | `coverage/sqlite-integration/index.html`   | SQLite connection, repositories, and schemas     |
| PostgreSQL integration tests | `coverage/postgres-integration/index.html` | PostgreSQL connection, repositories, and schemas |

Each report directory also contains `coverage-final.json` and
`coverage-summary.json`. Mocked unit-test execution never contributes to either
integration report. All three suites run even if an earlier suite fails, and
`npm test` fails if any suite or coverage threshold fails.

The unit run cleans `coverage/` first, then the integration runs populate their
subdirectories. Run `npm test` to refresh all three reports. Individual commands
are also available:

```sh
npm run test:unit
npm run test:integration:sqlite
npm run test:integration:postgres
```

`npm run test:coverage` is an alias for the complete three-suite run.
`npm run test:watch` watches the unit suite with coverage enabled.

The integration tests measure real query behavior:
CRUD and bulk operations, ordering/limits, timestamp boundaries, text search,
boolean/null/default conversion, counters/index state, constraints, transaction
rollback, file persistence, and migrations. SQLite `RAISE(IGNORE)` triggers test
the repositories' empty-insert guards without replacing the database with mocks.
PostgreSQL uses real `BEFORE INSERT` triggers returning `NULL` for those guards.

SQLite and PostgreSQL integration coverage is 100% for statements, branches,
functions, and lines. Ungrouped count queries always return one row, including zero
matches; the repositories express that guaranteed result shape without unreachable
missing-result fallbacks. Migration resolution is tested with real source,
bundled, and standalone directory layouts and the shipped migration SQL.

PostgreSQL also tests error handling with a closed native connection, migration
rollback, and preservation of existing tables when the migration journal is
missing. Each backend's coverage is measured independently of the other backend
and the mocks.

The unit report enforces 100% statements, branches, functions, and lines per
file across all application source, including startup, configuration, services,
controllers, plugins, database code, and WebSocket handlers.
Both integration reports enforce 100% statements, branches, functions, and
lines per file.

Type-check the integration suite with:

```sh
node node_modules/typescript/bin/tsc -p tests/integration/tsconfig.json
```
