# Node Links

Links is an ordered list of general-purpose HTTP(S) resources. Entries keep the existing `{ url, description }` shape, validation limits, editing controls, and responsive presentation. They can point to articles, projects, tools, other nodes, or any other website.

The canonical saved configuration key is `nodeLinks: NodeLink[]`, defaulting to `[]`. Node validates it with `src/config/node-links.ts`. `SettingsService.updateNodeLinks` persists it and invalidates the homepage. The Node endpoint is `POST /settings/personalize/links` with `{ nodeLinks }`; Client exposes `POST /settings/node/personalize/links` and forwards the same body. `/home/settings` and page bootstrap expose `nodeLinks`. Client editing lives in `public/javascript/settings-links.js` and `src/validators/node-links.ts`.

At settings load, legacy `nodeNeighbors` entries are validated and migrated to `nodeLinks` under the settings writer lock with an atomic file replacement. Existing `nodeLinks` takes precedence, including an explicit empty array. The legacy key is removed on persistence; invalid legacy values fail validation without rewriting the original file. Patches reread current disk settings under the same lock before saving, preserving concurrent and unrelated edits. This migration does not change user data directories or database tables: these entries are stored in `_node_settings.json`.

The separate `/links/*` social-icon API and its database table still serve watch/index header icons. They are distinct from the editable `nodeLinks` resources list. Upgrade Node and Client together because the personalization API and settings DTO names changed. Old Neighbors route names are retired; only the stored legacy key is accepted for migration.

Verification: 3,370 Node unit tests (including migration), 12 Client API/editor and settings checks, 9 SQLite and 8 PostgreSQL homepage integration checks, and 36 Chromium/WebKit homepage checks pass. Node/Client types, source lint, and production builds pass. Restart both applications together to load the renamed API and trigger saved-settings migration.
