# MoarTube Node homepage implementation report

Prepared and revised November 6, 2026. Status: local implementation complete; local verification recorded below. Live CDN verification is a deployment follow-up.

## Scope and authority

Implement the Node's public `/` page in `MoarTube-Node/public/views/index.ejs` from the approved [desktop mockup](mockups/homepage-desktop-approved.png) and [mobile mockup](mockups/homepage-mobile-approved.png). The user's written requirements govern behavior; the image supplies the visual reference. Sample names, videos, tags, counts, comments, and settings copy in the image are illustrative data, not content to hard-code. The latest approved mobile mockup is the Videos/About/Community design with black link/comment links, black bulletin diamonds, compact mobile sort/tag dropdowns with collapsed video search, and no MoarTube Network label in mobile About. Desktop retains underline-style filters. Comment links include the video comment total; their text is black and their arrows are magenta. Later loading requirements supersede the five-comments-total limit: comments load **five per batch/page**, with infinite scrolling on mobile and Previous/Next pagination on desktop.

This report lives in `MoarTube-Node/docs`. The Node runtime implementation is now present; Client changes provide browser regression tests for the Node page. Bootstrap responsive layout/components are encouraged, following the watch page, with scoped styling to match the approved designs.

Execute milestones in order. Each milestone depends on the accepted output of the preceding milestone; its checklist is the gate for advancing. Proposed choices below make the roadmap executable but are identified separately from requirements and observed source behavior.

## Implementation record

The original source findings below are historical context. Runtime changes now live in `public/views/index.ejs`, `public/css/home.css`, `public/javascript/home.js`, `src/routes/home.ts`, `src/controllers/home.ts`, `src/services/home.ts`, `src/database/repositories/home.ts`, and `src/database/provisioning/home.ts`, with root/DI/database/CDN/settings integration in the existing modules.

| Milestone | Implementation status |
| --- | --- |
| 1 - Contract | Final attached mockups adopted; mobile dropdowns/collapsed search supersede earlier mobile filter rows. Five comments is a batch/page size, not a feed limit. |
| 2 - Data | Both database dialects implement exact tags, literal Unicode-aware search, facets, four sorts, real recent activity, and global comment pages. |
| 3 - Caching | Persistent epochs/revisions, a separate safety revision for edits/deletions/visibility, atomic shared snapshots, origin cache policies, and bounded IndexedDB/memory page storage. |
| 4 - Routes | Root renders a safe typed model; read-only `/home/*` APIs expose public projections. Legacy browse/watch routes stay intact. |
| 5 - Layout | Desktop grid/sidebar and mobile Videos/About/Community use Bootstrap 5.3 assets and scoped CSS matching the approved layouts. |
| 6 - Interactions | Async queries, address-bar/history restoration, keyboard tag selection, synchronized controls, tab state, and collapsed search. |
| 7 - Loading | Video infinite scroll on every device; mobile comment infinite scroll; desktop five-row Previous/Next; retries, stable cursors, responsive transitions, and offscreen card unmount/rehydration. |
| 8 - Verification | Local type/lint/build, database, and browser evidence below. Live CDN and production-scale load checks remain deployment follow-ups. |

Adopted limits: 12 videos/page, 5 comments/page, 50 tag options/request, at most 32 persisted query snapshots, 61-minute snapshot retention, 48-hour activity retention, 80 memory-cache entries, and 120 IndexedDB entries. Snapshot publication/eviction runs in a database transaction so concurrent workers cannot delete half-built snapshot rows. Expired/evicted or revoked-content cursors return a no-store reset instead of mixing datasets. A pinned comment traversal survives new inserts; edits, deletion, and visibility changes invalidate its safety revision.

State markers include `epoch`, `revision`, `commentsRevision`, `commentsVersion`, `settingsRevision`, `catalogRevision`, `safetyRevision`, `statsRevision`, and `rankingWindow`. The unfiltered count is returned by the tags API; matched count is returned by the videos API. API preview URLs are built client-side through the watch media-base convention. Client persists a last-seen state marker and requires an origin freshness check before accepting older comment/catalog/ranking state or changed settings during initialization. There are no periodic or focus/visibility state checks, automatic feed resets for newly available content, or new-content notices. Users discover updates by refreshing the page; search, pagination, and expired-result recovery continue to load on demand.

New searches accept the current revision even when the page's original revision is older. Existing snapshots, including rehydration of their first page, retain their pinned revision and eligibility checks. Tags use a separate `tagsRevision` derived from the node epoch and catalog, so a ranking-window rollover does not expire tag pagination. Responses that advance a requested revision remain `no-store` to avoid caching current data under an older version's URL.

Validation evidence:

- Node source type check and source lint (no errors; repository warning-level lint rules remain).
- Full Node unit suite: 179 files / 3,406 tests passed.
- Full SQLite integration suite: 11 files / 69 tests passed; homepage tests also cover concurrent publication and snapshot eviction.
- Full PostgreSQL integration suite: 11 files / 65 tests passed; equivalent homepage query/cache tests run against real PostgreSQL.
- Homepage browser suite in Client: 18 tests across Chromium and WebKit, covering desktop/mobile layouts, search/tag/URL state, pagination, infinite scroll, late responses, retry, IndexedDB reuse, blocked storage, narrow width, breakpoint changes, and older CDN comment-state detection.
- Existing Chromium watch-page regression suite: 9 tests passed.
- Production Node build succeeds and ships the new homepage view, CSS, and JavaScript.
- Desktop and all three mobile states inspected via deterministic browser screenshots. Fixture preview images are neutral placeholders; production uses node media, and no illustrative mockup content is inserted into runtime settings or videos.

Deployment follow-ups: verify actual Cloudflare edge hits/Age, query isolation, and purge behavior in the deployed environment; reapply managed CDN settings for an already configured node so its provider rules include root and `/home/*`. The implementation extends the existing page rule and retains the ten-rule limit and final bypass precedence. No external CDN settings were changed in this task. Production-scale storage/query benchmarks and manual touch-device review are not claimed by the local tests.

## Findings from the current implementation

Paths in this section are relative to the MoarTube-Node project root. These findings come from the initial inspection; recheck affected code before implementation.

| Source inspected | Current behavior and implication |
| --- | --- |
| `public/views/index.ejs`, `src/routes/base.ts` | Empty HTML body; root renders `index` without a model, validation, or explicit cache policy. The homepage needs a data-backed route/controller. |
| `src/controllers/watch.ts`, `src/routes/watch.ts` | Validated public route with optional authentication; controller composes a typed `model` through services. Successful anonymous HTML uses `public, max-age=0, s-maxage=30, must-revalidate`; authorization-bearing responses and errors remain `no-store`. Watch HTML includes comment state markers, not comment bodies. |
| `src/utils/comment-cache.ts` | Revisioned comment reads are CDN-cacheable for 3600 seconds only if epoch/revision match both before and after the data read. Missing markers, mismatches, authorization, and errors retain `no-store`. Browser HTTP max-age remains zero. |
| `public/views/watch.ejs` | IndexedDB comment storage (`moartube-comments-v1`) with memory fallback, coverage tracking, request deduplication, generation guards, and version synchronization. Reads state before trusting cached pages; respects CDN `Age`, rechecks after 30 seconds, and uses `fresh=1` against obsolete state. Epoch change resets storage. URL parameter ordering is stable. Infinite loading serializes requests. |
| `src/controllers/node.ts`, `src/routes/node.ts`, `public/views/node.ejs` | Existing browsing page is `/videos`; `/node` redirects there. `/node/search` has `searchTerm`, `tagTerm`, `sortTerm`, and offset pagination. Its unfiltered mode pages tag groups, not a single flat grid. Reusing it unchanged would fail this mockup. Its raw video responses should not become the new public homepage DTO. |
| `src/services/videos.ts`, `src/database/repositories/videos/{interface,sqlite,postgres}.ts` | Existing title/description/tag search, exact trimmed comma-delimited tag membership, tag extraction, counts, and creation/views sorting are reusable primitives. There is no Hot ranking or comments sort in `VideoQueryOptions`. Current search uses SQL `LIKE`, whose case behavior differs by dialect. |
| `src/database/schemas/{sqlite,postgres}/videos.ts` | Video metadata includes title, tags, duration, creation timestamp, views, likes, dislikes, comments, publish/live/hidden flags. Lifetime counters alone do not measure recent trending activity. |
| `src/database/repositories/comments/{interface,sqlite,postgres}.ts` | Existing per-video history and broad search operations do not provide the required public, joined, globally ordered, cursor-paginated projection with five rows per page. Avoid loading all comments or requesting every video's history. |
| `src/database/provisioning/comment-sql.ts` | Database triggers update video comment totals and comment cache changes. New homepage revisions must cover these mutation paths, including deletion and bulk operations. |
| `src/config/schema.ts`, `src/config/node-bulletin.ts`, `src/config/node-links.ts` | Settings already contain `nodeName`, `nodeHeadline`, `nodeAbout`, ordered `nodeBulletin: string[]`, and ordered `nodeLinks: {url, description}[]`. Links have no separate display-name field; derive the label from the validated URL hostname. |
| `src/utils/viewer-urls.ts`, watch recommendation rendering | Reuse `viewerMediaBase` and `pageCanonicalOrigin`. Watch preview images use `/external/videos/:videoId/images/preview.jpg`; watch navigation uses `/watch?v=...`. Comment navigation supports `#p<commentId>`. |
| `src/services/cloudflare.ts`, `src/services/settings.ts` | CDN rules preserve complete query strings and bypass mutations, authorization, and `fresh=1`. Existing page/search rules and `purgeNodePage()` target `/videos` and old search variants, not the new root/API family. Bulletin and links saves currently persist without the purge used by name/headline/about saves. These paths need explicit homepage invalidation. |

The existing `visibleOnly` repository predicate is `(is_published OR is_live)`; it does not also exclude `is_hidden`. Define the homepage's public eligibility explicitly and use it for cards, counts, tags, latest comments, and trending. Do not silently assume the existing helper already enforces that policy.

## Visual and functional specification

At the supplied desktop size, reproduce the compact white page, vivid magenta accents, light gray borders, soft gray panel headers, pink headline strip, and dense typography. Approximate geometry measured from the reference: 14px outer gutters; identity/tag row at the top; node-banner/search row around y=56–109; headline strip y=127–212; content starts y=232; main column about 1114px wide; 16px gutter; sidebar about 429px wide. Main content has three equal card columns, with the first row starting around y=302. Preview frames are approximately 354 × 228px in this image. Match the image's crop and proportions deliberately rather than assuming all previews are 16:9. These measurements guide implementation; screenshot comparison is the acceptance evidence.

| Mockup region | Required render data | Required behavior |
| --- | --- | --- |
| Upper-left gray identity area | `nodeName` | Render `MoarTube Network / <nodeName>`, with the node name emphasized. |
| Top tag rail | Real tag labels, selected tag | `All` plus real tags; selecting one updates the grid, selected rail item, dropdown, count, and URL. Overflow remains accessible. |
| Brand and search row | Saved node banner; current `searchTerm` | Search asynchronously within the selected tag and sort. Enter and Search button commit immediately; typed input also debounces. |
| Node introduction | `nodeName`, `nodeHeadline`, `nodeAbout` | Desktop: headline/about strip below search and name in upper-left identity. Mobile: name, headline, and about together in the About pink panel, without a MoarTube Network label. Wrap long saved text. |
| Sort controls | `hot`, `new`, `discussed`, `viewed`; selected sort | Hot is default. Every sort respects the selected tag and video query. |
| Count and tag dropdown | Matched distinct video total; selected tag; tag options | Display total matching current video query and tag, not number currently loaded. Searchable scrollable dropdown stays synchronized with rail. |
| Video cards | ID, title, preview URL, duration/live state, creation timestamp, views, likes, dislikes, comment count | Thumbnail/title open watch page. All three engagement indicators are display only: no vote, comment, or mutation handlers on those indicators. Infinite scrolling appends cards. |
| Latest comments | Eligible comments across videos, newest first, five per batch/page, with video title/preview/comment total | Global feed independent of grid tag/query/sort. Mobile: Community tab with infinite scrolling. Desktop: sidebar with Previous/Next buttons. Show Anonymous, relative time, excerpt, and watch/comments links. Multiple comments may belong to one video. |
| Bulletin | Saved `nodeBulletin` items | Render all items in saved order, escaped as text. Use black diamond bullets; no invented welcome copy when settings are empty. |
| Links | Saved `nodeLinks` | Render in saved order with hostname label, actual URL as link target, description alongside on desktop and below on mobile. Hostname links are black and underlined. No mock hosts hard-coded. |

### Approved responsive layout

The desktop reference and approved mobile mockup define two presentations of the same responsive page, using shared models, query state, and cached data. Do not append the desktop sidebar beneath an infinite video feed on mobile.

| Presentation | Videos | Node information | Latest comments |
| --- | --- | --- | --- |
| Desktop | Main grid; three columns at reference size; infinite scrolling | Network/name identity, headline/about strip, bulletin and links sidebar | Sidebar; five comments per page with Previous/Next buttons |
| Mobile | Videos tab; single-column cards; infinite scrolling | About tab: node name, node headline, node about, bulletin, links | Community tab; five comments per batch; infinite scrolling |

Mobile header: the saved node banner, node name below, then Videos / About / Community tabs. Videos is the default. Its content order is one compact row with sort dropdown, searchable tag dropdown, and collapsed-search icon; matched count; then single-column cards. The search form is hidden initially unless a query is present in the URL. The toolbar search icon expands/collapses the existing video search form and focuses its input when opened. Search appears only in Videos and preserves its query when collapsed or when switching tabs. There is no additional header search control. About contains the pink node introduction, Bulletin, then Links. Community is headed Latest comments. Use subtitle copy such as 'Newest comments across this node', not 'The 5 newest comments', since older batches remain accessible.

The final mobile design supersedes the earlier tag/sort underline rows with dropdowns to reclaim vertical space. The sort dropdown contains Hot, New, Discussed, Views, corresponding to desktop Hot, New, Most discussed, Most viewed. Tag selection uses the same searchable, scrollable picker on both layouts. Only desktop has the magenta tag rail and underline-style sort row; those controls have no filled pill backgrounds or button borders. Preserve comfortable touch targets.

Link links, comment video-title links, and View # comments link text is black and underlined, with only the trailing arrow magenta. Mobile comment thumbnails also display duration/live badges. Bulletin diamonds are black. Apply these refinements consistently across responsive presentations. Engagement icons remain magenta with black counts, no button outlines, and no interaction. Retain white/light-gray surfaces and the pink introduction. Mobile About has no MoarTube Network label; the desktop upper-left identity still reads MoarTube Network / <nodeName>.

Implemented Bootstrap mapping: mobile tabs below `lg` (992px), desktop main/sidebar at `lg` and above. Cards use one column below 600px, two columns at 600-1199px, and three at 1200px and above; desktop sidebar begins at 992px. Reuse the watch page's Bootstrap assets/version rather than introducing another version. Scope custom styling to match the references.

Use one source of truth for data and presentation mode. Tab changes preserve video filters, loaded video/comment pages, per-tab scroll position, and appropriate focus on return. Lazy-load inactive tab bodies. On breakpoint changes, map the currently visible comment batch to the corresponding desktop page or restore its equivalent mobile position using shared page boundaries. Do not duplicate fetches, active observers, DOM IDs, or accessible content between layouts. Desktop comments never auto-append; mobile comments never require pagination buttons. No bottom navigation is implied by the approved design.

## Proposed interaction and query contract

Use shared video query state `{searchTerm, tagTerm, sortTerm, tagSearch}`, plus independent navigation/comment state `{view, commentSnapshot, commentPageCursors, commentPageIndex}`. Keep the existing naming convention for video/tag selection while defining a homepage-specific sort enum; do not change legacy `/videos` sort meanings accidentally.

- Root examples: `/`, `/?tagTerm=music`, `/?searchTerm=guitar&sortTerm=new&tagTerm=music`, `/?tagSearch=mus&tagTerm=music`.
- Absence of `tagTerm` means all tags, including untagged videos. `All` is a synthetic option with no database tag or literal `tagTerm=all` sentinel. A genuine stored tag named `all` must remain selectable as an ordinary tag.
- `searchTerm` filters title, description, and tags, combined with exact tag membership using AND. Match literal text; escape SQL wildcard characters and use consistent case-insensitive behavior in both databases. Trim query whitespace without changing stored labels.
- `tagSearch` searches option labels in the dropdown, independent of the video query. It updates the address bar but does not select the first match or filter videos until an option is chosen. Closing/reopening preserves its state; selecting a tag clears `tagSearch` and records the final selection.
- Counts next to tag options are distinct eligible videos for that tag under the video query, without the currently selected tag restriction. The synthetic All count includes untagged videos. The main count applies both query and selected tag. Sorting changes order, not totals.
- Implemented stable rail order: real tags alphabetically, All first; overflow scrolls horizontally. Dropdown has a bounded-height list, dedicated text input, and counts. Its option lookup is paginated for large catalogs, retaining the selected option even outside the loaded page.
- Explicit search submit, tag selection, and sort changes push history. Debounced input changes replace history to avoid an entry per keystroke. `popstate` restores controls and matching results without reload. Refresh/deep links produce the same initial state. Cursor/cache markers stay in API URLs, not shareable page URLs.
- Changing grid criteria invalidates pending request generations, increments a generation, clears the old cursor, and begins page one. Late results from prior generations cannot append cards or overwrite counts.
- Empty results, loading, end of list, and request failure have distinct states. Failed append requests preserve existing cards and offer retry. Search failures never label old results as successful matches for a new query.

Latest comments has a magnifier on both layouts that toggles a collapsible text search. `commentSearch` is independent of video/tag/sort and participates in URL history and API/snapshot/cache keys. Changes restart comment paging from the newest matching comments; clearing the field restores the global feed.

Implemented mobile navigation query: `view=about` or `view=community`; omit `view` for Videos. Preserve video query parameters across tabs. Back/forward and reload restore the selected mobile tab and video criteria. Desktop preserves the mobile tab value for return to mobile but shows its normal grid/sidebar. Comment cursors, snapshots, loaded-page history, and scroll offsets remain application state rather than public query parameters.

Both comment presentations share five-row cursor pages. Page one starts with the newest eligible comment; Next requests older comments and Previous returns to a stored preceding page. Disable Previous on page one and Next at the end; prevent duplicate navigation while loading. Mobile appends these same pages using a sentinel. Pin a snapshot/head boundary while browsing so new insertions do not shift boundaries or duplicate rows; offer controlled refresh when newer comments exist. Refresh resets the page stack to the newest page. Deletions and visibility changes override retained content as described below.

## Proposed data and application architecture

### Public models and endpoints

Add a dedicated homepage controller/service and validated schemas. Wire the root through the existing route registration and DI container, following the watch controller's typed model composition. Reuse existing services/repositories where their semantics match. Retire the `/videos` browsing page, `/node` redirect, and `/node/search` in favor of `/` and `/home/*`. Preserve authenticated moderation APIs and shared video/comment APIs.

Suggested new endpoints (names are implementation proposals):

| Read | Purpose and response |
| --- | --- |
| `GET /` | Render `index.ejs` with node identity/settings, normalized query state, canonical/media bases, initial tag metadata, and small cache state markers. Load grid bodies through the browser cache/API pattern used by watch comments. |
| `GET /home/state` | Lightweight epoch and catalog/safety/comment/settings/ranking revisions as listed in the implementation record. `fresh=1` bypasses CDN; result counts accompany video/tag reads. |
| `GET /home/videos` | Query + revision/snapshot + cursor → `{videos, totalCount, nextCursor, hasMore, epoch, revision, snapshot}`. Default 12 cards; fetch one lookahead row. A flat list even when All is selected. |
| `GET /home/tags` | Video query + option-label query + revision + tag cursor → `{tags:[{label, count}], allCount, nextCursor, hasMore}`. Same public eligibility/count semantics as videos. |
| `GET /home/comments` | Comment revision/snapshot + cursor returns `{comments, nextCursor, hasMore, epoch, revision, snapshot}` with up to five joined rows; read one lookahead. Shared by mobile append and desktop Previous/Next through stored page cursors. |
| `GET /home/settings` | Settings revision → public node name/headline/about, ordered bulletin, ordered links. Allows browser cache refresh without downloading HTML or exposing private config. |

`HomeVideo` contains only `{videoId, title, lengthSeconds, creationTimestamp, views, likes, dislikes, comments, isLive, isStreaming}` plus any explicitly required feature flags. Exclude password, source paths, operational state, provider credentials, and internal outputs. `HomeComment` contains `{commentId, videoId, timestamp, text, videoTitle, videoCommentCount, lengthSeconds, isStreaming}`. Preview URLs are derived client-side from the shared media base and encoded video ID, as on watch. Escape all text in templates and construct client DOM text safely; serialize the initial model safely for script context.

### Eligibility, ordering, and storage

Implemented public eligibility is `(is_published OR is_live) AND NOT is_hidden`, matching published/live discovery intent while honoring hidden status. Apply it before limiting, ranking, counting, or joining latest comments. Passworded videos are excluded from public homepage discovery and comment excerpts; the existing watch route is unchanged. Do not expose a protected comment excerpt through the feed if viewing it requires authorization.

New sorts: creation timestamp descending (New), comment total descending (Most discussed), views descending (Most viewed), and recent activity score descending (Hot). Add deterministic creation timestamp/video ID tie-breakers. Most discussed and Most viewed use lifetime totals; Hot uses recent activity, not a rename of lifetime popularity or likes.

Implemented Hot definition: record persisted hourly engagement buckets for existing accepted view, like, and comment creation events; aggregate trailing 24-hour totals as `recentViews + 3 * recentLikes + 5 * recentComments`, ignoring dislikes. Use the same accepted events as current counters, not homepage clicks. Retain 48 hours of buckets; periodically remove older rows. Comment deletion removes its contribution where retained. Publish ranking snapshots on a 30-second cadence, and advance the time window even when no new events occur. Start new installations with no fabricated historical activity; zero-score ties use New ordering. These defaults are implemented in both database dialects. Views/likes use hourly buckets (an hourly approximation of the 24-hour window); comments use their actual timestamps and disappear from the score on deletion.

Cursor pagination must reflect the full sort tuple and normalized filters. Because counters and ranking change while scrolling, pin a bounded-lifetime persisted snapshot of ranked eligible IDs and relevant projection/count data; use set-based database operations, not full-catalog JavaScript arrays. Reuse snapshots by normalized query/revision and cap their lifetime/cardinality/storage. Revisions must remain resolvable for at least the 3600-second CDN data TTL, or expired reads must return a no-store reset signal; never serve current data as though it belonged to an old revision. Test concurrent writes explicitly. If a snapshot expires, restart from current state with an explanatory refresh affordance rather than mix snapshots.

Removal or loss of public eligibility overrides a pinned snapshot: recheck eligibility when serving rows; do not continue disclosing removed/hidden data solely for pagination stability. Revision refresh resets counts and pages. Already delivered CDN/browser content cannot be recalled; document the 30-second state freshness and purge limitations.

Each comment page uses one bounded joined query ordered by `(timestamp DESC, comment_id DESC)` across eligible videos. Return five rows plus a separate hasMore determined by one lookahead row. Use a composite keyset cursor and pinned snapshot/head boundary for subsequent pages. Continue through older comments, not five videos with one comment each. Add an appropriate global time/order index after examining query plans; the current per-video history index alone is insufficient. Handle deleted/orphaned videos and final partial pages normally. Cache page coverage/cursor boundaries separately from individual records so Previous restores the actual preceding page.

### CDN and browser cache design

Use watch's split between small freshness metadata and reusable revisioned bodies; add homepage-specific state rather than treating a per-video comment version as a catalog version.

| Response/store | Proposed policy |
| --- | --- |
| Successful anonymous homepage HTML and state | `public, max-age=0, s-maxage=30, must-revalidate` |
| Successful anonymous revisioned grid/tags/comments/settings data | `public, max-age=0, s-maxage=3600, must-revalidate`, only when epoch/revision is verified throughout the read or a matching immutable snapshot is read |
| Unversioned data, stale/mismatched revision, errors/validation failures, authorization-bearing requests, fresh bypass | `no-store`; stale revision returns an explicit reset response rather than poisoning a revision URL |
| Browser application data | IndexedDB with bounded memory fallback; key by origin/node epoch, schema version, relevant revision(s), canonical query, snapshot, and cursor |

Set no-store in an early request hook before validation/auth, then opt successful public reads into caching. Include every filter, tag search, sort, cursor, epoch, revision, and ranking window in canonical API cache keys with stable parameter ordering. Never use a per-request timestamp cache buster for ordinary reads. Retain full query strings in CDN keys and extend managed CDN rules for exact root and `/home/*`; preserve bypass rule precedence. Validate behavior with origin headers and an actual configured CDN when available; local tests alone do not prove an edge cache hit.

On navigation, read lightweight state, account for CDN `Age`, then reuse matching IndexedDB pages or fetch missing pages. Recheck after 30 seconds while active and on focus after an idle interval. Detect older state, use a single fresh bypass to confirm, and prevent revision rollback. Invalidate only affected caches; an epoch/schema change makes incompatible cache keys unreachable; bounded eviction removes old entries. Keep in-flight deduplication, generation checks, bounded writes, eviction, and memory fallback when IndexedDB is unavailable, full, or fails. Browser HTTP caching and IndexedDB serve different roles; zero browser max-age does not prohibit application caching.

For a changed dataset during scrolling, keep the currently pinned view until a controlled refresh unless eligibility is revoked. Keep video/statistics refresh internal: no new-video/statistics notice is displayed. Comment revisions may offer refresh; committing a new video query uses current state. Cache individual page coverage, cursor, and hasMore explicitly, so a card fetched elsewhere does not imply that its page is complete. Neither video nor mobile-comment infinite scrolling may require downloading or retaining the entire catalog/history. Cache comment pages independently of video queries and share them between responsive modes. Bound page/cursor history; if an evicted or expired page cannot be reconstructed, offer controlled refresh rather than mix revisions.

Homepage revision coverage must include:

| Change | Invalidate/advance |
| --- | --- |
| Publish/unpublish, hide/unhide, title/tag edits, live transitions, video deletion/import/bulk changes | Catalog, relevant tag/count/page state; comments visibility where applicable |
| Accepted views/likes/dislikes and comment totals | Coalesced stats revision; rankings at next 30-second snapshot |
| Comment create/edit/delete, bulk/video deletion | Latest-comments revision, card stats, discussed ranking, retained trend contribution |
| Name/headline/about/bulletin/links save, including direct config reload | Settings revision and root HTML/state |
| Database replacement/restore, revision reset | New databases receive a persistent epoch; supported restore operations advance trigger-backed revisions. Older catalog state requires a fresh check before reuse |
| Storage/media-base configuration or replaced preview | Relevant URL/model revision and existing media purge mechanism |

Persist revisions in shared storage, not worker-local counters. Coalesce high-frequency statistics changes to avoid a catalog purge per view. Commit data/revision updates atomically where possible; integrate with existing CDN invalidation/recovery facilities. Extend homepage purges for root query variants and state. Prefer revisions for arbitrary search URLs rather than enumerating every query in purge lists; retain the 30-second TTL as a fallback when provider purge fails. Audit all settings mutation paths: bulletin/links currently do not invoke page purge.

## Sequential milestones and acceptance gates

### Milestone 1 — Lock the page contract and visual baseline

Deliverable: measured layout notes, public eligibility policy, endpoint/model/query schemas on paper, and deterministic fixture specification. Resolve proposed Hot weights/window, top rail ordering, responsive breakpoint, and passworded video/feed policy before implementation relies on them.

- [x] Every user note maps to a region, data field, and observable behavior in this report.
- [x] Fixture includes at least 30 eligible videos, untagged/multi-tag videos, equal sort keys, hidden/unpublished/protected cases, long titles, zero counts, live content, and at least 23 eligible global comments spanning five pages, including multiple comments on one video and equal timestamps.
- [x] Identity/settings strings come from saved settings; all sample image content is clearly fixture data.
- [x] Default Hot, All semantics, search scopes, facet counts, history rules, mobile tabs, and five-comments-per-page/batch behavior are settled.
- [x] Desktop reference geometry, image cropping, available logo/font assets, and mobile breakpoints are documented. Identify any missing original assets before promising pixel-identical typography.

### Milestone 2 — Build query and ranking foundations

Deliverable: shared public eligibility/query primitives, both database implementations, global latest-comment projection, tag facets/counts, trend event buckets, deterministic sorts, and bounded snapshot/cursor storage.

- [x] SQLite and PostgreSQL return the same IDs, ordering, counts, and tags for the fixture.
- [x] Search AND tag filters apply to all four sorts; tag membership is exact, tags count videos once, and All includes untagged videos.
- [x] Literal `%`, `_`, quotes, Unicode, commas in query text, empty strings, and case differences behave as specified without SQL injection.
- [x] Comments traverse eligible history newest first in five-row pages with deterministic ties. Lookahead, final partial page, and hasMore are correct; no full-history scan into application memory or N+1 history requests.
- [x] Hot changes with recent accepted activity and time-window expiry; an old high lifetime count does not automatically win. Restart/multiple workers preserve ranking inputs.
- [x] Multi-page iteration has no duplicates or omitted unchanged eligible videos at equal sort keys or during concurrent stats writes. Snapshot expiration and eligibility revocation have defined results.
- [x] Index/query-plan checks cover video ordering, tag aggregation, trend aggregation, and global comments. Schema changes have a safe install/upgrade path in both dialects.

### Milestone 3 — Establish revision and cache correctness

Deliverable: persistent homepage cache state, atomic/coalesced mutation hooks, shared cache-header helpers, managed CDN configuration changes, and browser storage interface.

- [x] Every mutation in the coverage table advances the right revision, including bulk actions, comment triggers, settings reload, and live transitions.
- [x] Anonymous HTML/state use the 30-second policy; verified revisioned reads use the 3600-second policy; errors, authorization, unversioned/mismatched reads, and fresh bypass stay no-store.
- [x] A mutation between before/after revision checks cannot generate a publicly cacheable mixed-version response.
- [x] Root and API CDN rules honor full queries and bypass precedence; invalidation handles root/settings updates and provider failure fallback.
- [x] Browser storage supports page coverage, deduplicated requests, bounded eviction, epoch reset, and memory fallback without altering watch's existing comment database.
- [x] Older CDN state cannot roll back a newer browser revision; Age and fresh-state behavior are tested.

### Milestone 4 — Wire root rendering and public read APIs

Deliverable: homepage controller/service, route registration, query/response validation, safe public DTOs, and an `index.ejs` bootstrap model.

- [x] `/` renders real saved node information, canonical/media bases, normalized query controls, and revision markers through DI/services, following watch architecture.
- [x] Grid/tag/comment bodies are loaded through their revisioned interfaces; HTML does not redundantly embed the browser-cached collections.
- [x] APIs return correct totals, bounded pages, cursors/hasMore, settings order, and cursor-paginated five-row comment results; invalid inputs have tested status codes and no-store headers.
- [x] No private video fields, passwords, raw config, paths, or credentials appear in HTML or public JSON.
- [x] All text is escaped and initial JSON cannot terminate its script context; link links use validated HTTP(S) URLs.
- [x] The retired `/videos` browsing page, `/node` redirect, and `/node/search` are removed; watch, settings, media, moderation, and shared video/comment APIs retain their contracts.

### Milestone 5 — Implement the mockup layout with live data

Deliverable: homepage EJS, scoped styling, reusable card/panel rendering, and required brand/icon assets.

- [x] At 1584 × 993, layout matches the reference's identity row, magenta tag rail, node-banner/search row, pink strip, sort/count/dropdown toolbar, three-column grid, and sidebar hierarchy.
- [x] Actual node name replaces `backyard.tube`. Desktop keeps its network/name identity and headline/about strip; mobile About has node name/headline/about with no network label. Saved bulletin/links preserve order.
- [x] Cards show preview crop, duration/live indication, title, views, relative time, and three display-only statistics with matching icon/color treatment.
- [x] Desktop comments shows up to five rows plus Previous/Next; mobile Community starts with five and can append older batches. Copy does not imply a five-comment total cap; excerpts never overflow.
- [x] Mobile Videos/About/Community match the approved mockup; desktop retains its sidebar. Link/comment links and bulletin diamonds are black; mobile uses compact filter dropdowns and collapsed search while desktop uses underline filters, and statistics have no button outlines.
- [x] Bootstrap assets align with watch; responsive transitions preserve data/page position without duplicated active content or requests.
- [x] Long/missing images/text, empty settings, no videos/comments, and unavailable previews produce deliberate layouts without fabricated content.
- [x] At representative desktop/tablet/mobile widths, controls remain readable and no content overlaps or causes page-wide horizontal scrolling.

### Milestone 6 — Connect asynchronous search, tags, sorts, and history

Deliverable: one client query-state controller and searchable, scrollable tag selector integrated with cache-backed APIs.

- [x] Rail/dropdown select the same tag; selecting either resets the grid and updates its matched total. All removes only the tag filter.
- [x] Video input debounces (proposed 250ms), Search/Enter submit immediately, and every request preserves the selected tag and sort.
- [x] Dropdown input searches tag labels, scrolls through large option sets, retains selected tag visibility, and updates `tagSearch` in the URL without silently filtering videos.
- [x] All four sorts operate inside the same video/tag filters; active controls and counts agree with the returned generation.
- [x] Address bar updates for searches, tag selections, and mobile tabs; back/forward, reload, and pasted URLs restore controls/results. Tab switching preserves filters, per-tab scroll positions, and loaded pages.
- [x] Mobile toolbar search expands the video search form and focuses its existing input; the form is hidden on About/Community. Comments remain independent of video/tag/sort criteria.
- [x] Rapid search/tag/sort changes cannot show stale responses. Loading, empty, error, and retry states are accessible and distinct.
- [x] Keyboard users can open, search, navigate, choose, and close the dropdown; focus, selected states, labels, and result announcements work without a mouse.

### Milestone 7 — Complete responsive loading, pagination, and cache lifecycle

Deliverable: video infinite scrolling on every device, mobile comment infinite scrolling, desktop comment Previous/Next pagination, and a shared bounded cache lifecycle with stable snapshots and revision checks.

- [x] Initial grid and subsequent pages form one flat list; one active append per generation; deduplication uses video ID within the pinned snapshot.
- [x] Video/mobile-comment sentinels keep loading while visible and stop at hasMore=false; empty terminal pages never loop. Each feed has independent request locks, generations, and retry state.
- [x] Desktop comment Previous/Next replaces the visible five-row page and restores stored page cursors; unavailable controls are disabled. No auto-append on desktop.
- [x] Comment loading has no duplicate/skipped unchanged rows at equal timestamps or concurrent insertion. New comments are discovered on page refresh; deletion, lost eligibility, and expired snapshots recover correctly.
- [x] Breakpoint changes preserve equivalent comment position and video/tab state. Mobile observers disconnect in desktop mode; hidden controls cannot trigger background loads.
- [x] Filter/sort changes invalidate old appends and restart; expired snapshots recover automatically; failed loads retry the correct cursor in the background every five seconds. Retry timers from superseded queries are canceled or ignored, and no retry/refresh buttons or error notices are shown.
- [x] Returning to a matching query reuses verified cached pages; refreshing the page discovers newer settings, tags, statistics, and comments without background availability checks.
- [x] IndexedDB blocked/quota/error modes, offline failures, database replacement, and cross-tab changes recover without stale-generation writes or a blank permanent screen.
- [x] Page/cache storage stays bounded. If accumulated DOM grows large, window old card rows with preserved scroll height and rehydrate from cached pages; loading a long video catalog or comment history does not retain an unbounded DOM. Preserve scroll anchors when windowing; desktop comments mount only the current page.

### Milestone 8 — Verify visual fidelity and release readiness

Deliverable: screenshots/comparison notes, automated evidence, and a concise implementation summary with any remaining differences.

- [x] Capture deterministic-fixture screenshots at the reference size and representative smaller widths; compare spacing, typography, crop, color, borders, and active states against the desktop reference and latest approved mobile mockup. Verify all three tabs, black links/diamonds, underline filters, and no mobile About network label. Document dynamic-content and pagination-control differences separately.
- [x] Focused repository/service/API tests cover filtering, facets/counts, trend/window expiry, multi-page global comments, cursor concurrency, public DTOs, revisions, and headers in both SQLite and PostgreSQL.
- [x] Browser tests cover real asynchronous flows, dropdown keyboard use, deep-link/history restoration, video/mobile-comment infinite-scroll races/retry/end, desktop Previous/Next, tab/breakpoint restoration, cache revisit, stale edge state, and storage failure fallback.
- [ ] Verify filesystem and configured object-storage preview URL behavior, direct/LAN access, and configured public/tunnel URL generation using existing helpers.
- [x] Run Node `npm run typecheck`, `npm run lint`, focused `npm run test:unit`, affected SQLite/PostgreSQL integration suites, and the relevant Client Playwright watch regression checks. Run a production build after source checks pass. Record unavailable external services as unverified, not passing.
- [ ] Verify an actual configured CDN's headers/Age/cache hits and changed-query isolation when credentials/environment are available; otherwise record this release check as outstanding.
- [x] Review diff for unrelated changes and legacy route regressions; report changed files, test outcomes, known visual/operational limitations, and completed checklist evidence.

## Completion definition

The page is complete when all milestone gates pass: saved node content renders in the approved layout, every grid operation shares one consistent query state, real recent activity drives Hot, global comments load five at a time through mobile infinite scrolling and desktop pagination, videos infinite-scroll on every device with bounded resource use, mobile tabs and desktop sidebar preserve coherent state across responsive transitions, and CDN plus browser caching remains coherent through mutations and revision resets. The user authorized implementation after approving the final desktop/mobile images. Deployment and changes to an external CDN account were not performed.

The two unchecked release checks concern live media/network/CDN deployment behavior. Public/LAN/media URL helpers retain their existing unit coverage; the homepage browser fixture does not connect to an object-storage provider or a live CDN. Query-plan statements for all four data access patterns execute successfully in both database test suites; this is not a production load benchmark.

## Follow-up corrections

The upper-left header now renders the saved node banner through `/external/resources/images/banner.png`, using the existing custom-image/default-image resolution. It no longer reconstructs a MoarTube wordmark. The video/statistics update notice has been removed; cache freshness and retry behavior remain internal. End-of-feed messages are empty instead of displaying a caught-up message. SQLite Unicode search functions are registered when each connection opens, so worker connections can load tags and search videos without running schema provisioning. A real worker-style connection and `/home/tags` regression test cover this path.

Follow-up verification: SQLite integration suite 69/69, connection/root unit checks 18/18, and homepage browser checks 14/14 passed. Type checks, source lint, and the production build passed. Running Nodes must restart to load the rebuilt bundle and register the SQLite helper on their worker connections.

## Comment search and accent update

The homepage accent is now `#cb0c9f`. Latest comments has a magnifier that toggles an accessible, collapsible text-search form on desktop and mobile. `commentSearch` is independent of video query/tag/sort, participates in the address bar and API/cache/snapshot keys, and resets comment paging when changed. Comment search retains desktop pagination and mobile infinite scrolling. Link labels use `View 1 comment` for exactly one comment and plural for all other counts.

Comment-search verification: focused SQLite homepage tests 9/9, focused PostgreSQL homepage tests 8/8, and Chromium/WebKit homepage browser checks 18/18 passed. These include literal text matching, ampersands, Unicode, paging, independent video/comment filters, query-specific snapshot rejection, singular labels, collapse/expand keyboard behavior, URL history, and exact accent color.

## Node-page retirement

The former `node.ejs` browsing page, `/videos` page route, `/node` page redirect, and `/node/search` discovery API are removed in favor of `/` and `/home/*`. The watch-page avatar links to `/`. Page-only controller/service/proxy/cache code and obsolete page tests are removed. The authenticated `/node/newContentCounts` and `/node/contentChecked` moderation APIs remain because the Client still uses them. Shared `/videos/*` management and watch-comment APIs remain active. This supersedes the earlier requirement to preserve the legacy browsing page/search contracts.

## Approved banner and sidebar restructure

The approved desktop revision is saved as `docs/mockups/homepage-desktop-restructured-approved.png`. It supersedes the earlier header/control placement: the saved node banner spans the page width; the gray network/node identity sits above the headline/about introduction in the sidebar, immediately before Latest comments. The video toolbar contains sorting and the video search input without a submit button. The tag rail sits beneath it with the approved thin gray divider above the tags. The video count and searchable tag dropdown are removed. All fetched tags remain selectable in the horizontally scrollable rail, with More tags for additional catalog pages.

Mobile retains Videos/About/Community tabs and the compact sort selector; the video search input is directly available alongside it, followed by the scrollable tag rail. Node introduction remains in the mobile About tab. Video search still debounces and supports Enter, retains selected tag/sort, and updates history. Comments search, five-row desktop pagination, mobile comments infinite scroll, and video infinite scroll retain their behavior. Asset version URLs advance to v4.

Acceptance checks:

- [x] Banner spans both columns above the content.
- [x] Sidebar order is network identity, introduction, Latest comments, Bulletin, Links.
- [x] Tags sit beneath sorting/search with a 1px divider above them.
- [x] Video count, tag dropdown, and video search button are absent.
- [x] Responsive search, tag selection, keyboard selection, and URL back/forward work.
- [x] Chromium/WebKit homepage checks pass (18/18), including responsive overflow and existing cache/scroll/comment checks.

## Mobile controls clarification

The header restructure approval applies to desktop. Desktop retains its full-width saved banner, inline video search, tag rail with divider, and sidebar introduction. Mobile retains both sort and searchable tag dropdowns, plus a magenta search icon that expands/collapses the shared search input and focuses it on opening. The desktop tag rail is hidden on mobile. Video count remains removed; the current mobile banner and About/Community layouts are unchanged by this correction. This supersedes the previous paragraph describing an always-visible mobile search and tag rail. Asset version URLs advance to v5.

Mobile video search expands beneath the dropdown/icon row, keeping the controls in place. Stylesheet version advances to v6.

## Approved desktop community styling

Reference: `docs/mockups/homepage-desktop-community-approved.png`. Desktop uses light gray gutters, white bordered video and sidebar surfaces, a shallow full-width saved node banner, compact gray sans-serif sidebar headings, and a white node introduction with a magenta rule in place of the pink fill. The three-column video grid remains in the left content region; the toolbar, tag divider, and sidebar order retain their approved positions. The actual saved banner is displayed, not the illustrative mockup artwork. All new styling is scoped to desktop (992px and wider). Mobile dropdowns, expandable search below the controls, tabs, cards, and community presentation retain their existing behavior and styles. Stylesheet version advances to v7.

## Viewer corner controls and search focus

The homepage now includes the watch-page MoarTube SVG at upper left and saved public social links, Donate, and Settings at upper right, above the saved node banner. The banner subtitle containing the node name is removed on mobile. Search inputs use a neutral focus border rather than the global magenta square outline; other interactive controls retain keyboard focus indicators.

The Settings dialog uses the watch page's `dark-mode-enabled` local-storage preference and applies homepage dark styling. Public links load from `/links/all` with safe external-link attributes and SVG images. Donations load configured addresses from `/monetization/all`, present the missing-wallet link or an address/amount form, and use the same EIP-1193 chain/account/transaction sequence as watch. Decimal amounts convert with exact integer arithmetic at the watch flow's 18-decimal precision. No transaction occurs before explicit form submission and wallet approval. Optional header data failures do not block the video/comment feeds. Stylesheet version is v8; header behavior is isolated in `home-header.js`.

Verification: all 24 Chromium/WebKit homepage checks pass, including saved links, neutral focus, absent mobile subtitle, persisted theme, missing-wallet state, and configured donation requests against a mocked wallet. E2E type checks and Node build pass; no live financial transaction was submitted.

## Watch navigation positioning parity

The watch page is the positioning source of truth. Index now uses its exact `navbar navbar-expand-xl navbar-light`, full-viewport `container-fluid w-100`, `navbar-brand` logo/actions, both theme logo variants, and inline action layout. Navigation sits outside the width-limited homepage content container. The custom index header gaps, button sizes, padding, and minimum height are removed. Header typography inherits the watch page's 16px/1.6 metrics. Keyboard activation is retained on action anchors. CSS/header script versions advance to v9/v2.

A browser regression renders the actual watch-page navigation and its stylesheet in an isolated frame, then compares logo, Donate, and Settings bounding boxes directly against index at 390px, 1448px, and 2048px. All six Chromium/WebKit coordinate comparisons pass.

## Full-width desktop layout

Desktop content no longer has a 1920px maximum or horizontal outer padding. The saved banner spans the viewport edge to edge, with square outer corners; the video surface reaches the left edge and the sidebar reaches the right edge. The existing responsive column proportions and internal panel gutters remain. Watch-matched navigation remains unchanged. Mobile retains its approved layout and controls. Stylesheet version advances to v10.

Desktop now displays five video cards per row. The saved banner uses its natural aspect ratio at full width, removing the fixed-height crop so the entire image is visible. Mobile card columns remain unchanged. Stylesheet version advances to v11.

Video batches are 30 cards, a multiple of both five desktop columns and two tablet columns, so separate scroll batches do not introduce partially filled rows.

Responsive refinement: desktop video cards use three columns at 992?1599px and five columns at 1600px and above. Mobile About centers the node name, headline, and about copy. Stylesheet version advances to v12.

Desktop refinement: sidebar narrows to roughly 25% (280px minimum), comment previews use a compact 96px-wide column, and pagination hides when the comment result fits on one page. Previous/Next remain available on every page of multi-page results, including the final page. Video preview proportions and mobile comment sizing remain unchanged. Asset versions: CSS v15, homepage script v6.
