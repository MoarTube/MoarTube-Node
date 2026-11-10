# S3 live-playlist alignment — 2026-11-09

Active S3 live playlists now use the same freshness policy as validated filesystem snapshots:

```http
Cache-Control: public, max-age=0, s-maxage=1, must-revalidate
```

Startup/empty, malformed, terminal, and unknown dynamic playlists remain `no-store`. Recorded playlists and video retain one-year CDN freshness and browser revalidation. Images and other policies are unchanged.

## Writer contract

Node and Client use the same bounded head/tail validation helper. Active media snapshots require a valid HLS header, a positive target duration, a valid media entry, and no terminal/VOD marker. Live masters require a live marker and a rendition URI.

Validated active S3 writes include object metadata `moartube-live-playlist=active`. S3 exposes this as `x-amz-meta-moartube-live-playlist: active` on reads. Node master writes and Client rendition uploads set this marker together with the one-second policy. Growing Client archive streams supply the matching validated rolling snapshot without buffering the entire archive. Generic file uploads, unknown streams, and migrations do not promote unknown lifecycle state to active.

Cloudflare grants one-second freshness only to marked HLS objects at dynamic-manifest paths on successful GET/HEAD responses. The rule excludes authorization, cookies, query/header/Origin variants, partial/error responses, and missing or ambiguous lifecycle metadata. It explicitly removes immutable and stale-serving directives. Unmarked objects use the existing uncached default.

Finalization clears active metadata from dynamic rendition and master playlists. Rendition removal preserves it only if the source was explicitly active and the rewritten master still has valid live entries. Empty or unknown rewrites stay uncached. Existing exact and namespace invalidation paths remain in place.

## Verification

- Full Node suite: 3,610 passed, 38 skipped.
- Client S3 upload/lifecycle/cancellation tests and opt-in HLS integration: 17 passed. The HLS integration generates and decodes real media with FFmpeg through anonymous reads from isolated S3 test storage.
- TypeScript checks and production builds passed for Node and Client. Source lint passed with warnings and no errors.
- The local PostgreSQL dependency was unavailable during the first broad run. The successful full run used a disposable database container, removed afterward; the existing stopped database container was left untouched.

No production CDN configuration or bucket objects were changed. Deploy both Node and Client, then reapply Node's Cloudflare CDN configuration to install the updated response rule. Old/unmarked objects safely remain uncached until a validated writer replaces them.
