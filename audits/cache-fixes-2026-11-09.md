# Cache audit fixes

Implemented November 9, 2026. The Cloudflare zone remains dedicated to one deployment, as requested. Existing whole-zone rule ownership and restoration behavior is preserved.

## Resolved findings

| Audit finding | Implementation |
| --- | --- |
| Directory invalidation | The API separates directory prefixes from exact files. Both groups are attempted; any incomplete group prevents the remote write activity from being marked complete. Prefix purges include all child objects and cache-key variants. |
| Partial node images | Icon, avatar and banner upload paths now use bounded staging and atomic publication. The old image survives interrupted or truncated uploads. Service-level image copies use the same publication helper. If one multipart image commits and a later part fails, the committed image is still invalidated before the response finishes. |
| Cached deleted comments | Comment deletion, whole-video deletion and database restore invalidate the comment URL namespace with prefix purges. This includes state, historical revisioned bodies, reply pages and deltas, including old entries without tags. Ordinary additions still keep revisioned history caches warm. |
| Untrusted S3 cache metadata through Cloudflare | A managed response-cache ruleset supplies browser/edge policy independently of S3 object Cache-Control. Successful canonical images, segments, progressive files and static playlists receive browser revalidation and a 30-second shared TTL. Immutable, stale-on-error and stale-while-revalidate directives are removed. Dynamic/live playlists, errors, authenticated/cookie responses and excluded variants remain uncached. |
| Asset retention | Retained assets have a 512 MiB / 4,096-file admission budget and a seven-day window since their most recent advertisement by rendered HTML. Startup and hourly maintenance remove expired files and empty publication directories. Multiple workers coordinate through the publication lock. If the cache is busy/full, HTML advertises `?cache=off` and the origin serves current bytes with `no-store`, rather than advertising an unavailable immutable version. |

The S3 policy uses Cloudflare's [`http_response_cache_settings` phase](https://developers.cloudflare.com/cache/how-to/cache-response-rules/create-api/) and [`set_cache_control` action](https://developers.cloudflare.com/cache/how-to/cache-response-rules/settings/). It does not force a sub-minimum Edge TTL override or depend on object metadata being present. S3 live playlists are deliberately uncached because the edge cannot inspect playlist contents to distinguish complete live snapshots from startup/terminal files. Filesystem live playlists retain their existing one-second microcache where the origin can validate their contents.

The response rules participate in provider snapshot verification, rollback and removal. Legacy journals capture the previously unmanaged response phase before the first write. A saved previous managed snapshot permits interrupted policy upgrades to resume without treating the old managed rules as an unrelated external edit. Provider conflicts still stop the transition.

## Additional consistency fixes

- Cloudflare activation now builds both rule phases using the admitted **target public origin**, even though settings still contain the old/local address when provider rules are installed. Otherwise player requests carrying the new Origin could incorrectly bypass cache after initial activation.
- Hash-versioned fonts are included in the explicit resource cache rule.
- Visible, idle comment views perform periodic freshness checks using the existing 30-second gate, so moderated comments do not wait indefinitely for scrolling/manual refresh. Hidden/suspended pages avoid polling; pagehide clears the timer and resume reinstates it without duplicates.
- Homepage tag changes refresh the tag rail without revoking the reader's admitted video/comment snapshots when only new catalog entries have appeared.

## Validation

- Complete main/unit/cache run with real isolated S3 and process recovery: **3,594 passed, 38 skipped**, across **201 passing files and one skipped file**. Coverage enforcement was disabled for this run.
- SQLite cache/home/comment integration group: **42 passed**.
- PostgreSQL home/comment integration group: **36 passed**.
- Standalone client tests: **14 passed**.
- TypeScript: passed.
- Targeted source lint: **zero errors**, with 21 existing warnings.
- Production build, player build and declaration generation: passed.
- Diff whitespace check: passed.

Regression cases include actual multipart streams, concurrent public image reads, truncated uploads, a real SQLite comment deletion, exact/prefix provider payloads, byte/file retention pressure, cleanup protection, uncached asset fallback, browser idle/resume behavior, S3 header normalization, response-policy restoration, legacy journal upgrade and target-Origin activation.

Reproduce the main run:

```powershell
node audits/run-cache-audit.mjs --all
```

Run just the reproduced correctness and asset-retention regressions:

```powershell
node node_modules/vitest/vitest.mjs run --config audits/vitest.cache-audit.config.ts
```

## Deployment notes and limits

Deploy/restart the Node and **reapply its Cloudflare CDN configuration** to install the new response rules. The configuration transition verifies the saved provider state, installs both rule phases and performs final cache invalidation. Merely restarting an existing installation does not install new Cloudflare rules.

Existing browser responses already considered fresh cannot be remotely erased. Direct bucket URLs that bypass both Node and Cloudflare remain governed by the storage provider/uploader's metadata; this change does not rewrite production bucket objects or an uploader in another repository. Repository-owned S3 writers and migrations already emit explicit cache metadata. The managed Cloudflare delivery path now enforces its own contract even for legacy or incorrectly labeled objects.

Asset versions no longer advertised for seven days can disappear from origin; very old open pages may need reloading. Current releases continue renewing their advertised assets. The byte/file budgets prevent additional retention growth without evicting recently advertised versions; an installation already over budget falls back to uncached delivery until eligible old versions expire.

This report records the initial audit fixes. Media URL versioning was subsequently reverted. Video CDN freshness is now one year, while browsers revalidate and live playlists retain their short policy; see [current video cache policy and verification](cdn-video-lifetime-2026-11-09.md). Cloudflare file-size and plan limits still apply.

No production Cloudflare account or S3 bucket was modified during development. Actual POP behavior, deployed rule validation and real-browser cache traces remain deployment verification.
