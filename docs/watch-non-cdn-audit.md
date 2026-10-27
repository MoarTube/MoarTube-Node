# Watch page audit: non-CDN distribution

Date: 2026-10-27. This pass inspects the current filesystem-backed Node watch page with Cloudflare CDN disabled. It covers public HTML/assets, VOD delivery, comments, browser storage, metadata, and concurrency. Application code, settings, video files, and comment content were not changed. Browser visits naturally generated ordinary view/bandwidth activity. All mutation/concurrency probes used temporary databases or recording stubs.

## Remediation completed: 2026-10-27

All eight findings below have been addressed. The original evidence is retained as a record of the pre-fix behavior.

| Finding | Implemented change |
| --- | --- |
| Public path traversal | Shared file-serving boundary validates decoded path segments and canonical filesystem containment, including symlink escapes. Schemas reject unsafe filenames before dispatch. File bodies continue to stream with backpressure. |
| Metadata execution | Inline models escape `<` in watch/video/chat embeds; recommendation titles/tags use DOM text and attribute setters. Tag dictionaries have no inherited keys. |
| Repeated transfer | Assets and VOD files receive ETag/Last-Modified validators and `public, max-age=0, must-revalidate`. Large text assets stream through gzip; rendered text/JSON responses negotiate gzip. Live manifests remain `no-store`. No immutable lifetime is assumed for overwriteable URLs. |
| Progressive ranges | Valid closed/open/suffix ranges have correct framing; oversized ends clamp, invalid/unsatisfiable byte ranges return 416, multipart/unknown units fall back to a full response. Conditional GET, HEAD, and date-based If-Range are covered. Weak ETags are not accepted as strong If-Range validators. |
| Rejected autoplay | The built-in preload controller defers initial segment loading (`preload="none"`) while autoplay is attempted. The source remains attached after a rejected play attempt; a successful Play starts loading. The unused HLS interstitial scheduler is disabled through its supported setting because it otherwise starts loading independently of preload. Normal autoplay, linked starting times, pause/rate, and quality-switch restoration remain functional. |
| Comment totals | Canonical SQLite/PostgreSQL triggers maintain counts in the comment mutation transaction. Service-layer increments/decrements were removed. Versioned provisioning repairs historical totals and rotates the browser-cache epoch once; healthy subsequent provisioning leaves it stable. |
| Traffic accounting | Per-video delivered-byte deltas flush on an anchored interval and increment stored totals atomically. Views also flush without waiting for traffic to stop. Shutdown flushes queued data and awaits in-flight database writes; asynchronous failures are logged. |
| Public feature state | Initial recommendations use the existing visible-only service. The watch model carries live/publishing state and effective global/video permissions. Disabled actions stay disabled, existing comments remain readable, and typed API errors retain their status. |

### Validation

- 2,827 unit tests, with the existing 100% per-file statement/branch/function/line coverage requirements retained.
- 60 SQLite and 57 PostgreSQL integration tests. Regression cases include racing deletes, concurrent inserts, row moves, counter repair, rollback, and successive/concurrent bandwidth batches.
- 342 comment browser scenarios passed across Chromium, Firefox, and WebKit, covering existing scrolling, quote navigation/hover, highlights, contextual forms, IndexedDB behavior, and simulated CDN behavior.
- 21 additional full-page browser cases passed; six playback cases were skipped because Windows Playwright WebKit exposes neither MediaSource nor native HLS, and an independent native-video probe cannot decode the generated H.264/AAC fixture. Its metadata and UI cases passed. Chromium and Firefox exercised real generated HLS and native MP4 playback. These fixtures generate their own media and do not mutate application data.
- TypeScript, production build, and source lint passed (zero lint errors; 36 warnings remain).
- The rebuilt local Node is active. Its database was backed up before provisioning. All six stored comment rows matched the pre-upgrade SHA-256 fingerprint afterward; stored and actual counts both equal six.
- Live HTTP probes rejected encoded traversal with 400, returned gzip HTML/player/CSS, and returned a body-free 304 for an unchanged segment. HEAD advertised the real file size without reading the body.

### First-click playback regression follow-up

A click on the poster outside its central button reached both the overlay's Play handler and the surface's tap-to-toggle handler. The latter waited 200 ms for a possible double tap, then paused the newly started video. The overlay is now marked `data-interactive`, so the gesture coordinator leaves its activation to the overlay alone. Ordinary surface click-to-pause/resume remains enabled once the overlay is hidden. The shared player applies this to watch and embed pages.

The regression was reproduced before the fix. Expanded tests exercise poster clicks, the central button, Enter, and Space, and assert continued time advancement after the delayed gesture window as well as subsequent surface pause/resume. Chromium and Firefox pass these playback checks; the local Node was rebuilt/reloaded and a real-browser single-poster-click probe confirmed continuing playback.

### Built-in preload simplification

The custom suspended-source flag, source clearing/restoration, `media.play()` override, and restoration helper have been removed. Initial sources use the installed player/browser's `preload="none"` behavior. After a video has played, quality changes use `preload="metadata"` to preserve paused position and rate restoration. Native progressive sources rely on the source setter; an explicit `load()` call was removed because it forced an early request despite `preload="none"`.

Tracing the installed HLS stack showed its interstitial scheduler calling `startLoad()` even when `autoStartLoad` was false and the video was paused. MoarTube emits no interstitials, so the supported `enableInterstitialPlayback: false` option disables that scheduler and leaves loading to the preload controller. No dependency files were modified. The local Node was rebuilt/reloaded, and a blocked-play probe against the real video confirmed the source stayed attached, zero segments loaded before activation, and one poster click started sustained playback. Manifest requests can still occur before Play; the regression contract is zero HLS segment downloads after blocked autoplay. Tests also verify the source stays attached and the initial manifest/page are not fetched again when Play is clicked.

### Observed non-CDN traffic after the fixes

With a fresh isolated normal Chromium profile, browser disk caching enabled, and the same local 15.7-second 720p sample:

| Load | Node requests | Bytes transferred from Node | 304 validations | Comment API requests |
| --- | ---: | ---: | ---: | ---: |
| Cold | 22 | 21,087,226 | 0 | 1 |
| Warm reload | 21 | 50,919 | 18 | 0 |

The earlier warm-load audit transferred 22,284,146 bytes. The new normal-profile observation is about 99.8% lower. Requests still validate overwriteable resources; cached bodies are reused instead of retransmitted. This is a local sample observation, not a capacity guarantee. A private Chromium context declined to retain the two largest segments (about 8 MB each) and retransferred them; the server cannot force browser storage/eviction policy.

Observed gzip response bodies: watch HTML 43,837 bytes; player module 260,144 bytes; Bootstrap CSS 30,814 bytes. A deterministic blocked-autoplay fixture downloaded zero media segments before a Play action.

Cloudflare production-edge behavior remains a separate audit. The existing simulated-CDN comment regressions passed; no Cloudflare account settings or S3 deployment configuration were changed.

## Original audit findings

## Summary

The comment cache and bounded comment window held up in the focused checks. The audit nevertheless found two public-serving security issues and several concrete delivery/correctness problems. Fix the security issues first, then the media/file-serving path, then the smaller concurrency and page-state defects. This is an audit report, not a capacity certification or a completed CDN review.

## 1. Critical: public file routes allow path traversal

**Evidence:** Anonymous requests with encoded parent-directory separators returned the project-root `package.json` through JavaScript, CSS, and progressive-video routes (HTTP 200; 4,096 bytes; package name matched the Node project). Only this non-sensitive file was requested; credentials, configuration contents, and database files were not requested.

**Cause:** Filename schemas accept arbitrary strings. Controllers pass decoded filename/manifest/segment parameters to `path.join()` without validating basename boundaries or verifying that the resolved file stays in its intended directory. The same pattern exists across resource and video handlers. Escaping the configured base directory is enough to reach other files readable by the Node process.

**Essential fix:** Reject decoded separators, parent-directory segments, absolute paths, and invalid resource names; enforce resolved-path containment at every file-serving boundary. Include encoded slash and Windows backslash cases. Use a safe static-serving implementation where appropriate, without changing streaming/backpressure behavior.

Sources: `src/validators/schemas/common.ts:51`, `src/validators/schemas/external-videos.ts`, `src/controllers/external-resources.ts`, `src/controllers/external-videos.ts:263`.

## 2. High: video metadata can execute script in the watch page

**Evidence:** In an isolated rendered document, a harmless script marker placed in the model's description executed by closing the inline JSON script element. Separately, a browser-only recommendation title containing an image error handler executed another harmless marker when `loadRecommendedVideo()` appended it. Neither test altered stored metadata or sent data elsewhere.

**Cause:** `JSON.stringify(model)` is emitted directly inside `<script>`; JSON quoting does not neutralize an HTML `</script>` sequence. Recommended titles and tag values are also interpolated into HTML strings. Video creation stores titles/descriptions as supplied, so these fields cannot be treated as HTML-safe. The input boundary here is metadata creation/import, not the sanitized comment submission path.

**Essential fix:** Serialize inline JSON safely for its HTML context, and construct recommendation/tag DOM with text/attribute setters. Fix both paths: escaping only the inline JSON would leave the DOM-insertion issue.

Sources: `public/views/watch.ejs:1407`, `public/views/watch.ejs:1582`, `public/views/watch.ejs:1639`, `src/services/videos.ts:245`.

## 3. High: normal reloads unnecessarily retransmit assets and VOD data

**Measured with Chromium, a fresh context, browser cache enabled, and both localhost hostnames counted as the same Node:**

| Load | Origin requests | Browser cache hits | Origin bytes | Comment API requests |
| --- | ---: | ---: | ---: | ---: |
| Cold watch load | 22 | 0 | 22,285,666 | 1 |
| Reload in the same context | 21 | 0 | 22,284,146 | 0 |

The sample is a 15.7-second 720p video. Most traffic is video data, so these numbers are sample-specific, not a claim about every video. The comment cache correctly eliminated its repeated body request.

JavaScript, CSS, images, VOD manifests, and segments were served without `Cache-Control`, `ETag`, or `Last-Modified`. Text responses were also uncompressed. The player JavaScript response alone was 922,850 bytes; Bootstrap CSS was 232,871 bytes; watch HTML was roughly 205 KB. Repeated asset requests returned full 200 responses rather than validation responses.

**Essential fix:** Establish browser caching and conditional requests for static assets and VOD data, plus compression/precompression for text. Keep live manifests fresh. Initially prefer validators/revalidation for paths that can be overwritten; long-lived immutable caching requires build/content versioned URLs. Do not apply long cache lifetimes indiscriminately to unchanged filenames or republished media paths.

Sources: `src/controllers/base.ts:64`, `src/controllers/external-resources.ts:40`, `src/controllers/external-videos.ts:184`, `src/plugins/index.ts`.

## 4. High: progressive-video byte ranges are incorrect

An isolated HTTP controller served a temporary 1,000-byte file with the following results:

| Range | Actual result | Required behavior |
| --- | --- | --- |
| `bytes=0-15` | 206, 16 bytes | Correct baseline |
| `bytes=-16` | Bytes 0?16, 17 bytes | Last 16 bytes: 984?999 |
| `bytes=1000-` | 500 | Unsatisfiable range response, 416 |
| `bytes=20-10` | 500 | Handle invalid range without an internal error |
| `bytes=0-9999` | Advertised 10,000 bytes; sent 1,000 | Clamp the range end to 999 |
| `bytes=abc-def` | 500 and a NaN bandwidth update | Reject/ignore malformed range safely; never update metrics with invalid values |

**Impact:** These defects affect progressive seeking, resuming, suffix probes, and response framing. They are separate from the working HLS playback path. Range parsing currently updates accounting before validating the range.

**Essential fix:** Parse and validate supported byte ranges completely before opening the stream or changing counters. Handle suffix ranges, clamp valid ends, return correct unsatisfiable responses, and define safe behavior for multiple/unsupported ranges. Add real HTTP tests with actual temporary files.

Sources: `src/controllers/external-videos.ts:280`, `src/controllers/base.ts:85`.

## 5. Medium: rejected autoplay still downloads the sample video

Autoplay is intentional in the current watch player, so automatic downloading during successful playback is not itself a defect. In a fault-injection test, the custom media element's `play()` returned a `NotAllowedError` until user activation. The player remained paused at time zero, but fetched all three sample segments: 20,589,107 bytes including transfer overhead.

**Essential optimization:** Avoid continuing large segment downloads when the initial play request is rejected and the user has not started playback. Preserve normal autoplay and resume on a genuine play action. Test this condition explicitly rather than changing autoplay policy as an incidental optimization.

Sources: `client/videojs-10.2.0.js:130`, `client/videojs-10.2.0.js:167`, `client/videojs-10.2.0.js:327`.

## 6. Medium: concurrent deletion corrupts the stored comment count

**Evidence:** Two concurrent service deletion attempts against one comment in a temporary real SQLite database returned `[true, false]`. The actual comment table contained zero comments, but the video's stored comment counter was `-1`.

**Cause:** Both operations can observe the comment before deletion. The losing deletion still calls `decrementComments()` even though it removed no row. Creation/deletion and their counter updates also happen as separate operations. The watch HTML initially uses this stored counter; other comment responses count the real rows, producing inconsistent totals.

**Essential fix:** At minimum, decrement only after a successful deletion. Keep comment mutations and counters transactionally consistent, and add concurrency regressions for both supported databases.

Sources: `src/services/comments.ts:233`, `src/database/repositories/comments/sqlite.ts:178`, `src/database/repositories/comments/postgres.ts`, `src/database/repositories/videos/sqlite.ts:197`, `src/controllers/watch.ts:219`.

## 7. Medium: traffic accounting misattributes bytes and can postpone writes indefinitely

**Evidence:** An isolated controller received 1,000 bytes for video A and 2,000 bytes for video B before its timer fired. It wrote one update for B with 3,000 bytes. The segment and progressive counters/timers are shared across all videos handled by a worker.

The timers are also trailing debounces: continuous traffic resets the deadline. An isolated view-count test sent one increment every 100 ms for 800 ms; there were no database writes during that period. The write occurred only after traffic stopped. Sustained popular-video traffic can keep this behavior going, and the pending state is held in worker memory. There is no shutdown flush in this path.

**Essential fix:** Keep accounting per video and flush at bounded intervals rather than waiting for silence. Validate byte counts and handle asynchronous flush errors. Do not turn this into a new metrics subsystem.

Sources: `src/controllers/external-videos.ts:63`, `src/controllers/external-videos.ts:315`, `src/controllers/external-videos.ts:340`, `src/services/videos.ts:519`.

## 8. Medium: the public watch model is not fully wired to public filtering and feature state

- **Recommendations:** The watch controller requests `getVideos({limit:10, sortBy:'creation_timestamp', sortDirection:'desc'})`, without a published/live filter. An isolated controller test returned an unpublished, non-live draft in the public recommendation model. The existing `getRecommendedVideos()` service uses the intended visible-only filter, but this initial-page path bypasses it.
- **Disabled actions:** The model includes per-video comments/reports flags, but the watch script does not consume them to disable the corresponding UI, and effective global permissions are not supplied. Posting to a disabled feature reaches the backend and is reported as a generic 500 communication failure because controller catch blocks mask deliberate disabled/forbidden errors.
- **Live/publishing labels:** `loadVideo()` reads `isLive` and `isPublishing`, but the watch controller omits both from the main video model. The embed controller already includes them. This produces incorrect state-specific messages/captions; streaming transport still uses the separately supplied `isStreaming` field.

**Essential fix:** Use the existing public recommendation filter and finish the watch model's effective feature/status contract. Preserve existing comments when disabling new submissions; show an accurate disabled state and return appropriate errors.

Sources: `src/controllers/watch.ts:175`, `src/controllers/watch.ts:267`, `src/services/videos.ts:1040`, `public/views/watch.ejs:1741`, `src/controllers/videos.ts:930`.

## Checks that passed

- 24 focused non-CDN comment checks across Chromium, Firefox, and WebKit: retained history bounds, IndexedDB persistence, repeat-body avoidance, concurrent request deduplication, database replacement, and repeated quote generation.
- Actual HLS playback/seeking/rate/mute/pause checks passed in Chromium and Firefox. A first combined Chromium probe timed out; a separate sequential check reproduced working seeking and controls, so that timeout is not listed as a product defect.
- File delivery uses `createReadStream()` and Fastify streams. No whole-video buffering was found in the Node serving path.
- Comment history requests remain bounded; the reviewed DOM/RAM comment windows retain their existing limits. No new unbounded comment-history buffer was identified.
- The sample's warm watch load made zero comment API requests, as intended.

## Scope limits and follow-up

Cloudflare edge behavior and the S3-provider deployment path were not exercised. No live producer was started and no comment/video content was changed. The Windows WebKit test engine reported no native HLS support and failed to load the HLS sample with the current Safari-UA native selection; this is recorded as a compatibility test limit, not a confirmed Safari-on-Apple defect. Its comment/browser-storage scenarios passed.

No sustained capacity or long-session heap certification was performed. The network measurements are local sample observations. Minor cosmetic changes, speculative rewrites, and architectural replacements are deliberately excluded from the fix list.
