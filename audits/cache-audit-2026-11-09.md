# MoarTube browser and Cloudflare cache audit

Date: November 9, 2026 (America/New_York). Target: the current working tree, including its existing uncommitted cache changes.

**Follow-up:** This is the original, pre-fix assessment. Findings 1-4 and 6 have now been addressed in code; finding 5 is accepted because the zone belongs to one deployment. See [implementation and validation notes](cache-fixes-2026-11-09.md). The original evidence probes were converted into regression tests in `tests/cache/audit-fixes.test.ts` and run with the normal cache suite.

## Assessment

The cache architecture is substantially sound. Public reads are explicitly promoted from a default `no-store` policy; release assets have real content identities; comment and homepage reads use revisions; media replacement has targeted invalidation; and failed Cloudflare purges have durable, cross-worker retry machinery. This is much stronger than simply setting long cache headers everywhere.

It does **not** yet merit an unconditional clean bill of health. Three correctness gaps were demonstrated with isolated executable probes: directory invalidation is sent as an exact-file purge, node image uploads expose cacheable partial files, and deleted comments have no invalidation path for existing revisioned CDN entries. Two additional operational issues concern zone ownership and unbounded retained asset files. S3 object metadata is an important conditional risk because much of the media origin bypasses this server entirely.

No application implementation files were changed. The `audits/` directory contains this report and standalone evidence probes, outside the normal test suite. The probes assert the flawed **current** behavior; passing them documents the findings and does not mean those findings are fixed.

## Findings, in recommended investigation order

### 1. Directory invalidation silently purges only a literal directory URL — medium

**Evidence:** [route schema](../src/routes/videos.ts#L497), [invalidation handler](../src/controllers/videos.ts#L432), [exact-file dispatch](../src/services/cloudflare.ts#L103).

`POST /videos/:videoId/cache/invalidate` accepts `paths: ["adaptive/m3u8/"]`. The handler sends every supplied path to `purgeFiles()`. Cloudflare's exact-file purge does not invalidate descendants. A successful response therefore leaves cached manifests and segments under that directory untouched.

The audit probe uses the actual route, schema, controller and Cloudflare service, with only the provider HTTP transport mocked. The route returns HTTP 200 and submits `files` for the directory URL and its Origin variant; it submits no `prefixes` purge. This is a real supported-input mismatch, independent of whether the desktop uploader currently exercises that input.

**Consequence:** a caller can believe adaptive media has been invalidated and release its write activity while old child objects remain cached. Correctly configured current media eventually expires after its short TTL; older S3 metadata can make the window much longer.

**Recommendation:** dispatch directory paths through `purgePrefixes(..., true)` and file paths through `purgeFiles(..., true)`, or reject directory paths from the public contract. Test a cached child, not just an accepted purge API response. [Cloudflare documents separate URL and prefix purge operations](https://developers.cloudflare.com/cache/how-to/purge-cache/).

### 2. Node icon, avatar and banner uploads publish partial files — medium

**Evidence:** [avatar/icon upload](../src/controllers/settings.ts#L420), [banner upload](../src/controllers/settings.ts#L466), [public file caching](../src/utils/public-file.ts#L134), [existing atomic upload helper](../src/utils/stream-files.ts#L13).

These controller paths stream directly into the final public filename with `createWriteStream`. Opening the output truncates the existing image immediately. In contrast, video/image upload and asset publication helpers stage complete files and rename them into place.

The audit probe starts an avatar replacement, pauses after seven bytes, then performs a public GET. It receives HTTP 200, the partial bytes, and `public, max-age=0, s-maxage=30, must-revalidate`. When the upload is then deliberately failed, the partial file remains and no image purge is requested.

**Consequence:** concurrent readers and Cloudflare can receive a broken image. A successful upload's final purge normally repairs the edge, but a failed upload leaves the previous complete image destroyed. File-descriptor consistency in the reader cannot solve an in-place write to the same file.

**Recommendation:** use staged, bounded, atomic publication for these three images; reject truncated uploads; retain the previous image on failure; purge only after the replacement is published. Apply the same publication rule to the service-level `updateAvatar`/`updateBanner` copy paths.

### 3. Destructive comment changes do not evict cached old revisions — medium

**Evidence:** [revisioned response policy](../src/utils/comment-cache.ts#L17), [comment deletion](../src/controllers/videos.ts#L1153), [video deletion](../src/services/videos.ts#L412), [video media purge](../src/services/cloudflare.ts#L838).

Comment bodies, history pages, replies and deltas can be stored at the edge for 3,600 seconds. They have no comment-specific cache tag. Deleting a comment calls `purgeHomePage()` without a video ID, which purges homepage-tagged content. It does not target the already cached `/videos/:id/comments...` responses. Whole-video deletion purges HTML tags and `/external/videos/:id/` media, also leaving the separate comment URL family untouched.

The audit probe uses a real SQLite database and actual comment routes. It obtains a cacheable revisioned comment, deletes it successfully, and confirms that the origin now returns 404 while no comment file/prefix invalidation was requested. The previously returned representation is still eligible for CDN reuse for its remaining TTL. This proves the missing invalidation path; an actual Cloudflare POP was not exercised.

**Consequence:** new revisions and the delta feed correctly remove the comment for cooperating clients, but a stored old URL can still return the deleted text for up to an hour. Browser IndexedDB removal and CDN eviction are different operations. Visible idle watch pages also do not periodically synchronize comments; freshness checks occur on access, resume, and explicit refresh.

**Recommendation:** retain revisioned caching for normal additions, but add per-video comment tags or purge `/videos/:id/comments` on destructive moderation and video deletion. Include state markers and relevant homepage snapshots. Decide and document the intended deletion visibility guarantee. Keep the shorter state TTL as resilience, not as the only deletion mechanism.

### 4. Existing/direct-uploaded S3 metadata can defeat the intended policy — high if affected objects exist

**Evidence:** [origin-controlled media rules](../src/services/cloudflare.ts#L885), [CDN activation stages](../src/controllers/settings.ts#L1189), [distribution invalidation](../src/controllers/settings.ts#L960), [migration metadata](../src/services/storage-migration.ts#L58), [server-generated S3 master metadata](../src/services/storage.ts#L309).

The Node policy hook and `servePublicFile()` do not run when Cloudflare fetches an object directly from S3. CDN activation/storage selection purges caches but does not inspect or normalize every existing object's cache metadata. The media rule follows explicit origin headers and bypasses caching when they are absent. Thus:

| Existing S3 metadata | Effect |
| --- | --- |
| No Cache-Control | Media is generally ineligible under the managed bypass-by-default rule; desired CDN offload is lost. |
| `no-store` | Media remains uncached even when a longer safe lifetime is intended. |
| Long browser/edge freshness on a mutable URL | Origin-defined freshness can outlast the intended 30-second policy; direct S3 browser delivery can also retain stale bytes. |
| Long freshness on a live playlist | Viewers can receive obsolete playlists and playback can stall. |

Repository-owned migration and finalization writers set explicit metadata. That does not prove metadata correctness for pre-existing objects or for the separate encoder/desktop uploader. This repository's `client/` directory is player source, not that uploader's full storage implementation.

**Recommendation:** verify the direct uploader contract end to end, inventory active-bucket metadata, and provide a repair/versioning path for legacy objects. Consider dedicated response policies by media class if metadata cannot be trusted. Changing origin metadata or purging Cloudflare cannot erase a response that a browser already considers fresh; use a new URL identity when necessary. Cloudflare's [origin-controlled TTL semantics](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/) and [browser cache warning](https://developers.cloudflare.com/api/resources/rulesets/subresources/phases/methods/update/) make this distinction explicit.

**Confidence:** the enforcement gap is confirmed from source. The presence of affected production objects is unverified; no bucket credentials or production object inventory were accessed.

### 5. Enabling CDN takes over the zone's request-cache rules — medium on a shared zone

**Evidence:** [managed rule definitions](../src/services/cloudflare.ts#L885), [entrypoint replacement](../src/services/cloudflare.ts#L1043), [zone settings](../src/services/cloudflare.ts#L1050), [provider snapshot/restoration](../src/services/cloudflare.ts#L198).

The implementation PUTs a replacement request-cache entrypoint containing nine MoarTube rules. Existing rules are saved for restoration but are not kept active alongside the managed rules. The rules match paths without constraining `http.host`. Zone-wide cache level, browser TTL, HTTPS and tiered settings also change.

**Consequence:** an unrelated subdomain can lose its cache rules or inherit MoarTube's path-based policy while CDN is enabled. Snapshot restoration is valuable recovery protection, but it does not preserve the other application's behavior during normal operation. Separate Cache Response Rules, Workers or later transformations are not covered by the captured request-cache snapshot and may also change effective behavior.

**Recommendation:** either make exclusive zone ownership an explicit supported-deployment requirement, or preserve unrelated rules and scope managed rules to the Node/media hostnames. Validate remaining rule capacity: nine rules fit within the current Free allowance of ten. [Cloudflare rule ordering](https://developers.cloudflare.com/cache/how-to/cache-rules/order/) and [plan limits](https://developers.cloudflare.com/cache/how-to/cache-rules/) are relevant here.

### 6. Retained immutable assets have no disk retention budget — medium operational risk

**Evidence:** [retained asset directory](../src/utils/asset-url.ts#L43), [publication and memory bound](../src/utils/asset-url.ts#L60).

Each distinct packaged asset version is copied to the data directory under `cache/assets/<hash>/...`. The publication lookup is capped at 512 entries, but no corresponding disk cleanup, age policy or byte quota exists. Restarts and builds preserve these files deliberately.

**Consequence:** repeated releases or editing large bundles accumulates files indefinitely. Disk exhaustion can eventually affect uploads, database writes, and HTML rendering when new versions cannot be retained.

**Recommendation:** establish a documented retention horizon and observable disk budget. Track published release manifests/last use and clean eligible versions outside request handling. Preserve versions referenced by supported open/old pages; arbitrary deletion of old assets would undo an otherwise correct immutable-URL design. If old pages must work indefinitely, use durable release storage and capacity management rather than promising bounded local retention.

## Current cache policy inventory

All browser/edge lifetimes below describe Node-owned responses or S3 objects written with the matching current metadata. S3 exceptions are covered in finding 4. CDN-disabled deployments still emit shared-cache directives; ordinary browser HTTP caching uses `max-age`, not `s-maxage`.

| Surface | Browser HTTP policy | Cloudflare policy | Invalidation / assessment |
| --- | --- | --- | --- |
| All routes by default | `no-store` | No public promotion | Good baseline, including validation/auth errors. |
| Authorization-bearing requests; Set-Cookie responses; non-GET/HEAD | `no-store` | Authorization/mutation bypass rules; origin guard | Good separation under the managed configuration. No cookie-based authentication currently needs an extra cookie cache key. |
| Homepage HTML `/`, including search/view queries | Revalidate (`max-age=0`) | 30 seconds | `moartube-home` tag; query retained in key. |
| Watch HTML and video/chat embeds | Revalidate | 30 seconds | Watch/video tags; main watch also tags recommendation dependencies. |
| `/home/state` | Revalidate | 30 seconds | State drives IndexedDB safety/settings refresh. `fresh=1` bypasses. |
| `/home/videos`, comments, tags, settings with valid revision | Revalidate | 3,600 seconds | Revision/snapshot identities; homepage tag. Unversioned/mismatched reads are not promoted. |
| Comment state | Revalidate | 30 seconds | Explicit refresh and auth bypass. Not currently comment-tagged. |
| Revisioned comment body/history/replies/deltas | Revalidate | 3,600 seconds | Before/after revision checks prevent publishing changed data under a requested revision. Destructive purge gap remains. |
| Unversioned comment reads | `no-store` | Uncached | Appropriate fallback. |
| Packaged JS/CSS/fonts with valid retained SHA-256 URL | One year, immutable | One year where eligible | Bytes retained before HTML advertises the URL; old hash serves old bytes. All current EJS JS/CSS references and dynamic player imports use the helper. |
| Unversioned packaged JS/CSS/fonts | Revalidate | 3,600 seconds where eligible | Compatibility fallback; deployment startup purges resource prefix. |
| Node images, video thumbnails/previews/posters | Revalidate | 30 seconds | Prefix purges cover query/Origin variants. Node image publication gap remains. |
| VOD playlists | Revalidate | 30 seconds | Adaptive prefix / exact manifest invalidation. |
| Complete live filesystem playlist snapshots | Revalidate | 1 second | Startup/invalid/terminal snapshots stay `no-store`; lifecycle is inferred from contents as well as URL alias. |
| Terminal dynamic filesystem playlists | `no-store` | Uncached | Prevents a completed live snapshot becoming a long-lived live response. |
| S3 live playlists | Depends on uploader metadata | Server-written dynamic master: 1 second; finalized dynamic objects: `no-store` | Live rendition uploads remain an external contract to verify. Migration conservatively writes dynamic manifests as `no-store`. |
| HLS segments / progressive MP4, WebM, OGV | Revalidate | 30 seconds | Exact replacement/removal purges and broader video/rendition purges. |
| Media with query strings, unusual key headers or foreign Origin | Node response: `no-store` | Explicit bypass | Makes exact media variant invalidation finite; reduces offload for external players and cache-busting URLs. S3 browser response policy still depends on its origin headers. |
| Legacy discovery APIs, video metadata/sources/permissions, counts, links, wallets, bandwidth | `no-store` | Uncached under current origin policy | Correct for dynamic/mixed-purpose endpoints; selective public caching is an optional optimization. |
| Account, settings, reports, exports, metrics, mutations | `no-store` | Uncached | No secret-bearing response was found explicitly promoted into the public cache set. |
| WebSocket/live chat transport | Outside HTTP response caching | No ordinary CDN object cache | Appropriate. Local dark-mode/player preferences are preferences, not response caches. |

The origin cache-policy hook is installed before routes and CORS, and the final send hook removes public cache tags on errors, authorization, Set-Cookie and excluded media variants. Error handlers also set `no-store`. Inspecting a controller in isolation is insufficient; these inherited hooks matter.

## Browser-managed data caches

### Homepage

`public/javascript/home.js` has a separate revision-keyed PageCache: 80 memory entries, 120 IndexedDB entries, and one-hour expiry reduced by the response's Age. Stable parameter ordering and in-flight request coalescing reduce duplicate identities. Epoch/safety checks prevent returning old bodies after a destructive catalog change. Storage failures fall back to memory. A visible-page timer runs every 15 seconds, with state checks gated to roughly 30 seconds; pageshow/visibility return forces state refresh.

Important behavior: state freshness is not identical to live-updating every visible list. Existing snapshots intentionally preserve paging order. Pure catalog inserts do not increment the safety revision, and the freshness handler does not reload tags solely because `tagsRevision` changed. Decide whether new arrivals should trigger a non-disruptive update indicator/tag refresh. This is a product freshness choice, not evidence that the snapshot key itself is wrong.

The entry-count budgets are bounded but are not byte budgets. Add byte observability if large catalogs/comment bodies make browser storage pressure significant. The `fetch(..., { cache: 'no-cache' })` choice should also be checked in a real browser/POP trace: request-side revalidation directives can affect intermediary reuse. The isolated tests establish cache logic, not actual browser networking decisions.

### Watch comments

`public/views/watch.ejs` uses `moartube-comments-v2` IndexedDB with per-video generations and tab ownership. Memory is capped at 500 bodies; disk is capped at 2,000 bodies and 200 reply pages per video with a 4 MiB combined budget; old videos are evicted to keep about 20 videos with a seven-day retention window. Coverage and body writes are coordinated, and ownership loss invalidates memory/coverage before falling back.

The change feed updates edited/deleted bodies and parent reply metadata. Epoch changes and backward revisions trigger reset/forced state reads. Age is accounted for in state freshness. Resume checks run before observers resume. These are good protections, exercised with fake-indexeddb and extracted production browser code. Actual Safari/Firefox/Chromium quota, BFCache and tab-scheduling behavior still require browser testing.

There is no application Service Worker or Cache Storage layer to purge in addition to these stores. Browser HTTP cache, IndexedDB, DOM state, and player buffers remain independent lifecycles.

## Mutation and lifecycle coverage

| Event | Observed coverage |
| --- | --- |
| Title, description, tags, video flags/permissions | Homepage plus relevant watch/recommendation dependency tags; database catalog/safety state advances for discovery-relevant fields. |
| Publish/unpublish | Homepage and affected watch tags; unpublish also purges media prefix. Purging is not origin access revocation: external media serving does not check publication state. |
| Delete video | Origin deletion precedes metadata deletion and HTML/media invalidation; failed storage removal preserves catalog/comments. Comment CDN family remains a gap. |
| Add comment/reply | Transactional counters/version changes; no broad purge; new revision and delta sync provide freshness. Good for retaining warm histories. |
| Delete comment | Tombstones/counters and homepage invalidation work; old revisioned CDN bodies remain. |
| Likes/dislikes/views | Bounded state/HTML freshness, no purge per engagement event. Appropriate to avoid purge storms. View writes are batched. |
| Replace video image | Atomic video image upload followed by image prefix purge. |
| Replace node image | Image prefix purge after successful upload, but in-place publication is unsafe during/following failed writes. |
| Replace manifest/progressive file/segment via Node | Atomic publication followed by exact canonical URL/Origin variant purges. New segment names skip unnecessary successful-body purges. |
| Direct remote write | Activity admission plus strict explicit cache invalidation exists. Caller must actually complete that contract; directory-path handling is currently wrong. Unused completion-notification helpers do not provide a substitute purge boundary. |
| Master/rendition changes | Adaptive prefix invalidation; rendition removal edits masters before origin deletion/refill. |
| Live stop/finalization | Final playlists published before invalidation; non-recorded streams retain a viewer-drain interval and durable cleanup job; generation checks protect resumed/reused streams. |
| Removed live segment | Origin removal before exact purge. Non-ENOENT removal failures are not reported as successful cleanup. |
| Node text/icons/links/wallets/Turnstile/toggles | Homepage/all-watch invalidation is present in applicable service/controller paths. Existing open pages still need their own refresh/event behavior. |
| Storage/CDN/address changes | Admission/locking, durable transition stages, previous/current-zone invalidation, provider snapshots/restoration and bounded recovery. Existing S3 metadata is not normalized. |
| Database selection / restore | Selection requires restart and rejects outstanding work. Restore runs transactional writes/triggers and purges HTML/home; comment old-revision CDN entries are not covered by that HTML purge. Epochs identify databases, while live restore also relies on monotonic trigger-maintained revisions. |
| Node startup/deployment | Purges public pages, resources and media prefixes after provisioning. Old asset bytes are retained across builds. Failed purges can retry. |

## Cloudflare dispatch and protocol assessment

The purge outbox is durable in the authoritative database, not just per-worker memory. Acknowledgement includes generation tokens, preventing an older successful purge from acknowledging a newer write. Dispatch leases and atomic reservations coordinate workers; prefix/whole-zone coverage coalesces narrower targets. Old-zone credentials allow cleanup after configuration changes. The master retries pending work every ten seconds.

The current Free-plan model matches the documented broad-purge allowance of five requests per minute with a burst of 25, and the separate 800-URL-per-second file lane. Calls are batched to 100 operations and honor Retry-After, including final attempts, with persisted backoff. This is an account quota shared across zones; MoarTube coordinates only users of the same authoritative database. Other applications or separate Nodes using the same Cloudflare account can consume the remaining allowance. [Provider limits](https://developers.cloudflare.com/cache/how-to/purge-cache/).

Potential tuning: node/video image methods use the scarce broad lane, and startup purges the complete media/resource prefixes even when many bytes are unchanged. Batch related broad invalidations and expose queue depth/oldest age/dead letters instead of relying only on logs. Purge failures remain durable, but many public-facing mutation helpers intentionally return success after logging/deferment; success does not imply every POP is already fresh.

Protocol handling is generally careful: weak validators for mutable files avoid unsafe If-Range joins; immutable hashes validate byte identity; byte ranges/416/HEAD are implemented; content and metadata use one file handle; gzip adds `Vary: Accept-Encoding`; errors retain `no-store`. Revalidation on mutable files intentionally prefers ETag over coarse Last-Modified dates. A 30-second media TTL is a freshness bound, not a browser download cache.

Query strings and cache-key headers matter. The implementation enumerates permitted Origin variants for exact media purges and bypasses the remaining variants; prefix purges cover variants without enumeration. HTML uses tags so watch/home query variants remain addressable. These choices align with Cloudflare's [default key components](https://developers.cloudflare.com/cache/how-to/cache-keys/).

## Performance opportunities and platform limits

1. **Give truly immutable media versioned identities.** Currently segments, recorded playlists and large progressive files share a 30-second edge policy and browser revalidation. Repeated viewing/backtracking/downloads can incur frequent origin work. Introduce generation/content-addressed media URLs before considering long browser TTLs; current mutable names are not safe for unconditional immutable caching.
2. **Account for progressive video size.** Cloudflare's current maximum cacheable object size on Free/Pro/Business is 512 MB; range requests do not raise the full-object limit. Larger progressive uploads may remain origin-served despite correct headers. Prefer segmented delivery and measure actual byte offload. [Size limits](https://developers.cloudflare.com/cache/how-to/configure-cache-status-code/), [range requirements](https://developers.cloudflare.com/cache/reference/range-requests/).
3. **Fonts are outside the explicit asset eligibility rule.** The helper and origin support hash-versioned fonts, but the managed JS/CSS rule omits `/external/resources/fonts/`. Currently no packaged font files were found, so this is a latent consistency issue rather than a current viewer failure. Future fonts depend on extension defaults until the rule is extended.
4. **Avoid broad caching of dynamic public APIs without splitting contracts.** Some sources/permissions/metadata reads could use a brief public TTL, but they also communicate current playback or moderation state. Keep administrative and mixed-purpose APIs `no-store`; optimize only after identifying hot reads and adding invalidation dependencies.
5. **Monitor live-playlist offload.** A one-second shared lifetime can coalesce viewers while browser reloads stay fresh, but low-audience streams and sparse POP traffic still hit origin frequently. S3 policies must match the intended live/terminal lifecycle.
6. **Measure browser and CDN separately.** Browser storage hits, HTTP 304s, `CF-Cache-Status`, Age, origin request count and origin bytes answer different questions. Origin-side bandwidth counters do not measure all bytes served by Cloudflare or direct S3.

## Validation performed

| Final validation group | Result |
| --- | --- |
| Cache tests and selected controller, browser-memory, Cloudflare, storage and migration suites with normal isolated Silo setup | 483 passed across 24 files |
| Real SQLite homepage/comments/CDN/counter/nested-quote integration | 42 passed |
| Real PostgreSQL homepage/comments/counter/nested-quote integration | 36 passed |
| Existing standalone client tests | 14 passed |
| New audit evidence probes | 3 passed, demonstrating the three current correctness gaps |
| TypeScript `tsc --noEmit` | Passed |

Total across these final runs: **578 passing checks**. This is targeted audit validation, not a claim that the entire repository's 100% coverage gate was run.

The initial no-container run had 277 passing tests and one S3 suite setup failure because that configuration intentionally omits Silo. The subsequent normal-fixture run included and passed the S3 suite. Docker access required sandbox escalation, which succeeded. The first typecheck invocation through `npm.ps1` was blocked by PowerShell execution policy; direct invocation of the installed TypeScript CLI passed.

Reproduce the evidence probes from the repository root:

```powershell
node node_modules/vitest/vitest.mjs run --config audits/vitest.cache-audit.config.ts
```

Reproduce the broad 483-test group (requires local Docker access for its isolated S3 fixture):

```powershell
node audits/run-cache-audit.mjs
```

The runner captures stdout/stderr directly and preserves the native Vitest exit status, avoiding PowerShell's misleading failure status when expected SDK warnings are redirected through the shell.

Database groups:

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.sqlite.integration.config.ts --coverage.enabled false tests/integration/sqlite/home.test.ts tests/integration/sqlite/comment-cdn.test.ts tests/integration/sqlite/comments.test.ts tests/integration/sqlite/nested-quotes.test.ts tests/integration/sqlite/comment-counts.test.ts
node node_modules/vitest/vitest.mjs run --config vitest.postgres.integration.config.ts --coverage.enabled false tests/integration/postgres/home.test.ts tests/integration/postgres/comments.test.ts tests/integration/postgres/nested-quotes.test.ts tests/integration/postgres/comment-counts.test.ts
node --test tests/client/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Run logs are local ignored `cache-audit-*.log` files. No production Cloudflare mutations, production bucket access, or live application configuration changes were performed.

## Remaining deployment verification

Code/tests cannot establish the actual effective policy of an unidentified live zone. No public deployment hostname or connected Cloudflare account was supplied. The following remain deployment checks rather than completed findings:

| Check | Required evidence |
| --- | --- |
| Effective rule stack | Managed request-cache rules plus any account rules, Cache Response Rules, Workers, transforms, Origin Cache Control, development mode, SSL/origin scheme and DNS proxy state. |
| Positive CDN caching | Repeated identical GETs from the same POP for hash assets, home/watch HTML, revisioned data, images, VOD segments and live playlists; inspect Age, CF-Cache-Status and actual origin traffic. |
| Negative caching | Missing/not-yet-uploaded segments and playlists, 404/416/500, malformed queries, auth, explicit refresh, foreign Origin, key headers and noncanonical media queries never acquire reusable public representations. |
| Purge effectiveness | Warm each identity, mutate/delete via the real API, then verify new bytes/status across relevant Origin/query variants and POPs. Provider HTTP success alone does not prove eviction. |
| Browser behavior | Chromium, Firefox and Safari: reload/back-forward, BFCache, multiple tabs, disabled/private storage, blocked IndexedDB upgrade, quota/eviction, offline/resume, and posting/deleting during in-flight reads. |
| Direct storage contract | Inspect actual S3 HEAD/GET metadata and CORS for old/new images, segments, progressive files, live/VOD/terminal playlists. Verify uploader activity + invalidation ordering. |
| Real range playback | MP4/WebM seeks/resume with If-Range and compression through Cloudflare; include files above plan size limits. |
| Fault recovery | Staging-only purge 429/5xx/network failures, restart mid-write/invalidation, multiple workers and old-zone cleanup; confirm queue recovery and freshness bounds. |

A successful Cloudflare purge response means the request was received, not that the asset was previously cached or demonstrably evicted; [Cloudflare explicitly recommends checking the subsequent cache status](https://developers.cloudflare.com/cache/how-to/purge-cache/).

Recommended next work: fix the three demonstrated correctness gaps, verify/repair the S3 metadata contract, settle shared-zone ownership and asset retention, then perform the live deployment/browser checks before increasing any media TTL.
