# Video CDN lifetime and versioning removal — 2026-11-09

Media release versioning has been removed. The original URLs, filesystem layout, S3 keys, upload APIs, publishing flow, and rendition removal are restored. Publishing does not stage release directories or copy existing qualities. There are no release IDs, retained media versions, release cleanup jobs, or compatibility handlers.

Earlier cache audit fixes remain, including bounded durable purges, exact replacement invalidation, atomic uploads, mutable-file validators, cache variant bypasses, and browser asset retention.

| Content | Browser freshness | Shared/CDN freshness |
| --- | --- | --- |
| Recorded HLS playlists | Revalidate (`max-age=0`) | 31,536,000 seconds |
| HLS segments and progressive video | Revalidate (`max-age=0`) | 31,536,000 seconds |
| Complete active HLS snapshots, filesystem or explicitly marked S3 objects | Revalidate | 1 second |
| Unmarked/unknown S3 dynamic HLS playlists | `no-store` | `no-store` |
| Startup/terminal live responses, errors, authenticated/noncanonical media requests | `no-store` | `no-store` |
| Images and other cache policies | Existing policy | Existing policy |

Recorded media uses `public, max-age=0, s-maxage=31536000, must-revalidate`, without `immutable`. Node responses, repository-owned S3 manifest writers, and storage migration metadata follow this policy. Managed Cloudflare response rules enforce it for successful S3 video responses regardless of existing object metadata, while keeping images at their existing 30-second shared lifetime.

Replacing a file invalidates its exact public URL; playlist replacement covers both aliases. Republish, deletion, finalization, and rendition removal invalidate the relevant video namespace. Segment deletion invalidates the individual segment. Broad invalidation uses bounded prefix operations without listing every segment; failed provider operations remain queued for retry. Long freshness depends on these purge paths and does not guarantee that Cloudflare retains an object for a full year.

Validation: the full suite passed with 3,590 tests and 38 skipped. After adding final policy assertions, the focused HTTP, Cloudflare response-rule, and real S3 migration checks passed all 47 tests. TypeScript checking, production build, and source lint passed; lint reports 70 warnings and no errors.

Subsequent live-playlist alignment passed the full Node suite with 3,610 tests and 38 skipped, plus 17 focused Client/S3 tests including real FFmpeg playback. See [S3 live-playlist policy](s3-live-playlists-2026-11-09.md) for the writer contract and rollout requirements.

Deploy/restart Node and reapply the Cloudflare CDN configuration to install the updated edge rules and perform transition invalidation. Restarting alone does not update the Cloudflare configuration. No production Cloudflare account or S3 bucket was modified during this work.
