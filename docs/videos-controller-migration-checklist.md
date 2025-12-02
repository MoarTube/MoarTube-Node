# Videos Controller Migration Checklist

**Created:** December 2, 2025  
**Based On:** `videos-controller-migration-discrepancies.md`  
**Purpose:** Phased migration plan to achieve feature parity between JS and TS video controllers

---

## Migration Phases Overview

```
Phase 1: Foundation & Infrastructure
    ↓
Phase 2: Core Read Operations
    ↓
Phase 3: Core Write Operations
    ↓
Phase 4: File Upload System
    ↓
Phase 5: Indexer Integration
    ↓
Phase 6: User Interaction Features
    ↓
Phase 7: Cache & Performance
    ↓
Phase 8: Final Integration & Testing
```

---

## Phase 1: Foundation & Infrastructure

**Goal:** Establish service dependencies and shared utilities needed by all subsequent phases.

**Estimated Time:** 4-6 hours

### 1.1 Service Registration
- [ ] Register `CloudflareService` in DI container if not already
- [ ] Register `IndexerClient` as `IIndexerService` in DI container
- [ ] Ensure `VideosService` has access to `CloudflareService`
- [ ] Ensure `VideosService` has access to `IIndexerService`

**Files to modify:**
- `src/container.ts`
- `src/services/videos.ts` (add dependencies to constructor)

### 1.2 VideosService Dependencies Update
- [ ] Add `cloudflareService?: ICloudflareService` to `VideosServiceDependencies`
- [ ] Add `indexerService?: IIndexerService` to `VideosServiceDependencies`
- [ ] Store as private readonly members in constructor

**Verification:** Build passes, no runtime errors on startup

---

## Phase 2: Core Read Operations

**Goal:** Implement missing GET endpoints that don't modify state.

**Estimated Time:** 6-8 hours  
**Dependencies:** Phase 1 complete

### 2.1 Video Watch Data
**Priority:** CRITICAL - Required for video player

- [ ] Add `getWatchData(videoId: string)` to `VideosService`
  - [ ] Fetch video from repository
  - [ ] Parse outputs JSON
  - [ ] Determine `manifestType` ('dynamic' for streaming, 'static' otherwise)
  - [ ] Build `adaptiveSources` array (m3u8 manifests)
  - [ ] Build `progressiveSources` array (mp4, webm, ogv)
  - [ ] Build `sourcesFormatsAndResolutions` object
  - [ ] Return formatted video object with all player data

- [ ] Add `getWatchData` controller method in `VideosController`
- [ ] Add route `GET /:videoId/watch` in `src/routes/videos.ts`

**Test:** Endpoint returns player-ready video data with sources

### 2.2 Video Permissions
- [ ] Add `getPermissions(videoId: string)` to `VideosService`
  - Returns: `{ isCommentsEnabled, isLikesEnabled, isDislikesEnabled, isReportsEnabled, isLiveChatEnabled }`

- [ ] Add `getPermissions` controller method
- [ ] Add route `GET /:videoId/permissions`

**Test:** Returns correct permission flags for a video

### 2.3 All Videos Data
- [ ] Add `getAllVideosData()` to `VideosService`
  - [ ] Fetch all videos
  - [ ] Format with videoAliasUrl if indexed
  - [ ] Parse outputs and meta JSON fields

- [ ] Add `getAllVideosData` controller method
- [ ] Add route `GET /:videoId/data/all`

**Test:** Returns array of all videos with full data

### 2.4 Single Comment Retrieval
- [ ] Add `getComment(videoId: string, commentId: number)` to `CommentService`
- [ ] Add `getComment` controller method
- [ ] Add route `GET /:videoId/comments/:commentId`

**Test:** Returns single comment by ID

### 2.5 Tags Endpoints
- [ ] Add `getPublishedTags()` to `VideosService`
  - Query videos where `isPublished = true OR isLive = true`
  - Extract unique tags

- [ ] Add `getAllTags()` to `VideosService`
  - Query all videos
  - Extract unique tags

- [ ] Add controller methods: `getTags`, `getAllTags`
- [ ] Add routes: `GET /tags`, `GET /tags/all`

**Test:** Returns arrays of unique tags

### 2.6 Recommended Videos
- [ ] Add `getRecommendedVideos()` to `VideosService`
  - Query: `isPublished = true OR isLive = true`, order by `creation_timestamp DESC`

- [ ] Add `getRecommended` controller method
- [ ] Add route `GET /recommended`

**Test:** Returns list of recommended videos

### 2.7 Video Alias URL
- [ ] Add `getAliasUrl(videoId: string)` to `VideosService`
  - Check if video is indexed
  - Build MoarTube Aliaser URL

- [ ] Add `getAlias` controller method
- [ ] Add route `GET /:videoId/alias`

**Test:** Returns aliaser URL for indexed videos, error for non-indexed

**Phase 2 Verification Checklist:**
- [ ] All new GET endpoints return correct data
- [ ] No authentication required for public endpoints
- [ ] Error handling for non-existent videos

---

## Phase 3: Core Write Operations

**Goal:** Implement missing POST endpoints for metadata and state changes.

**Estimated Time:** 8-10 hours  
**Dependencies:** Phase 2 complete

### 3.1 Video Permissions Update
- [ ] Add `setPermission(videoId: string, type: string, isEnabled: boolean)` to `VideosService`
  - Handle types: 'comments', 'likes', 'dislikes', 'reports', 'livechat'
  - Update appropriate boolean field

- [ ] Add `setPermissions` controller method
- [ ] Add route `POST /:videoId/permissions`

**Test:** Permission flags update correctly

### 3.2 Video Lengths Update
- [ ] Add `setVideoLength(videoId, lengthSeconds, lengthTimestamp)` to `VideosService`
  - Already partially exists, verify implementation
  - Mark index as outdated if indexed

- [ ] Add `setLengths` controller method
- [ ] Add route `POST /:videoId/lengths`

**Test:** Length metadata updates, index marked outdated

### 3.3 Index Outdated Marking
- [ ] Add `markIndexOutdated(videoId: string)` to `VideosService`
  - Set `isIndexOutdated = true` if `isIndexed = true`

- [ ] Add `markIndexOutdated` controller method
- [ ] Add route `POST /:videoId/index/outdated`

**Test:** Index outdated flag set correctly

### 3.4 Batch Delete with Filtering
- [ ] Add `deleteVideos(videoIds: string[])` to `VideosService`
  - [ ] Only delete videos where: `isImporting = false AND isPublishing = false AND isStreaming = false AND isIndexing = false AND isIndexed = false`
  - [ ] Delete associated comments
  - [ ] Delete storage directories
  - [ ] Return `{ deletedVideoIds, nonDeletedVideoIds }`

- [ ] Update `deleteVideo` controller or add `deleteVideos` for batch
- [ ] Verify route `POST /delete` handles array of videoIds

**Test:** Batch delete respects safety filters, returns correct IDs

### 3.5 Batch Finalize with Filtering
- [ ] Add `finalizeVideos(videoIds: string[])` to `VideosService`
  - [ ] Only finalize where: `isImporting = false AND isPublishing = false AND isStreaming = false`
  - [ ] Return `{ finalizedVideoIds, nonFinalizedVideoIds }`

- [ ] Update controller for batch finalize
- [ ] Verify route `POST /finalize` handles array

**Test:** Batch finalize respects safety filters

### 3.6 HLS Master Manifest Writing
**Priority:** CRITICAL - Required for HLS playback

- [ ] Add `writeMasterManifest(videoId: string, type: string, content: string)` to `VideosService`
  - Write to: `{videosDir}/{videoId}/adaptive/m3u8/manifest-master.m3u8`
  - Set video error state on failure

- [ ] Add `writeMasterManifest` controller method
- [ ] Add route `POST /:videoId/adaptive/m3u8/:type/manifests/masterManifest`

**Test:** Master manifest file created correctly

### 3.7 Comments Enhancement
- [ ] Update `getCommentsForVideo` to support:
  - [ ] `type` parameter: 'after' or 'before' timestamp
  - [ ] `sort` parameter: 'ascending' or 'descending'
  - [ ] `timestamp` parameter for filtering

**Test:** Comments returned with correct filtering/sorting

**Phase 3 Verification Checklist:**
- [ ] All write operations persist correctly
- [ ] Authentication enforced on protected endpoints
- [ ] Proper error responses for invalid inputs

---

## Phase 4: File Upload System

**Goal:** Implement multer-based file upload handling for videos and images.

**Estimated Time:** 15-20 hours  
**Dependencies:** Phase 3 complete

### 4.1 Fastify Multipart Setup
- [ ] Install `@fastify/multipart` if not present
- [ ] Register multipart plugin in Fastify app
- [ ] Configure file size limits

**Files to modify:**
- `package.json` (if needed)
- `src/app.ts` or main Fastify setup file

### 4.2 Video Upload Service
- [ ] Create `src/services/video-upload.ts`
  - [ ] Handle video file validation (mime types: m3u8, mp2t, mp4, webm, ogg)
  - [ ] Determine destination directory based on format
  - [ ] Handle segment files vs manifest files
  - [ ] Emit WebSocket progress events

### 4.3 Video Upload Route
- [ ] Add `POST /:videoId/upload` route with multipart handling
  - [ ] Parse format and resolution from query params
  - [ ] Track upload progress
  - [ ] Broadcast progress via WebSocket
  - [ ] Store files to correct directories
  - [ ] Call Cloudflare purge on completion

**Structure:**
```
{videosDir}/{videoId}/
├── adaptive/
│   └── m3u8/
│       ├── manifest-{resolution}.m3u8
│       └── {resolution}/
│           └── *.ts (segments)
└── progressive/
    ├── mp4/{resolution}.mp4
    ├── webm/{resolution}.webm
    └── ogv/{resolution}.ogv
```

### 4.4 Stream Upload Route
- [ ] Add `POST /:videoId/stream` route with multipart handling
  - [ ] Similar to video upload but for live streaming
  - [ ] Only accepts m3u8 and ts files

### 4.5 Image Upload Routes
- [ ] Add `POST /:videoId/images/thumbnail`
  - [ ] Accept JPEG only
  - [ ] Store as `{videosDir}/{videoId}/images/thumbnail.jpg`
  - [ ] Call `purgeVideoThumbnailImages`

- [ ] Add `POST /:videoId/images/preview`
  - [ ] Accept JPEG only
  - [ ] Store as `{videosDir}/{videoId}/images/preview.jpg`
  - [ ] Mark index as outdated
  - [ ] Call `purgeVideoPreviewImages`

- [ ] Add `POST /:videoId/images/poster`
  - [ ] Accept JPEG only
  - [ ] Store as `{videosDir}/{videoId}/images/poster.jpg`
  - [ ] Call `purgePosterImages`

### 4.6 Upload Progress Tracking
- [ ] Port `publish-video-uploading-tracker` utility or create equivalent
- [ ] Track active uploads by videoId
- [ ] Support upload cancellation

**Phase 4 Verification Checklist:**
- [ ] Video files upload to correct directories
- [ ] Image uploads work and purge cache
- [ ] Progress broadcasts via WebSocket
- [ ] Large file uploads don't timeout
- [ ] Invalid file types rejected

---

## Phase 5: Indexer Integration

**Goal:** Connect to MoarTube Indexer for video discoverability.

**Estimated Time:** 10-15 hours  
**Dependencies:** Phase 4 complete

### 5.1 Indexer Service Implementation
- [ ] Create `src/services/indexer.ts` (or enhance existing)
  - [ ] Implement `IIndexerService` interface
  - [ ] `performNodeIdentification()` - authenticate with indexer
  - [ ] `addVideoToIndex(videoId, data)` - submit video for indexing
  - [ ] `removeVideoFromIndex(videoId)` - remove from index
  - [ ] Handle 413 payload too large errors with helpful message

### 5.2 Add to Index Endpoint
- [ ] Add `addToIndex(videoId: string, data: IndexData)` to `VideosService`
  - [ ] Validate video is published or live
  - [ ] Gather node settings (nodeId, nodeName, etc.)
  - [ ] Gather video data (title, tags, views, etc.)
  - [ ] Get image base64 data
  - [ ] Set `isIndexing = true`
  - [ ] Submit to indexer
  - [ ] Set `isIndexed = true` on success
  - [ ] Set `isIndexing = false` on completion

- [ ] Add `addToIndex` controller method
  - Accept: `containsAdultContent`, `termsOfServiceAgreed`, `cloudflareTurnstileToken`

- [ ] Add route `POST /:videoId/index/add`

### 5.3 Remove from Index Endpoint
- [ ] Add `removeFromIndex(videoId: string)` to `VideosService`
  - [ ] Get node identification
  - [ ] Submit removal request
  - [ ] Set `isIndexed = false` on success

- [ ] Add `removeFromIndex` controller method
- [ ] Add route `POST /:videoId/index/remove`

### 5.4 Image Base64 Utilities
- [ ] Implement or port `getVideoPreviewJpgBase64(videoId)`
- [ ] Implement or port `getNodeIconPngBase64()`
- [ ] Implement or port `getNodeAvatarPngBase64()`

**Phase 5 Verification Checklist:**
- [ ] Videos can be added to MoarTube index
- [ ] Videos can be removed from index
- [ ] Error messages are helpful (especially for payload size)
- [ ] Indexing state flags update correctly

---

## Phase 6: User Interaction Features

**Goal:** Implement user-facing features with spam prevention.

**Estimated Time:** 10-12 hours  
**Dependencies:** Phase 3 complete (can run parallel to 4-5)

### 6.1 Cloudflare Turnstile Integration
- [ ] Add middleware or utility for Turnstile validation
- [ ] Create helper: `validateTurnstileIfEnabled(token, ip)`

### 6.2 Enhanced Like/Dislike
- [ ] Update `likeVideo` to:
  - [ ] Check global `isLikesEnabled` setting
  - [ ] Check video-level `isLikesEnabled`
  - [ ] Validate Turnstile token if enabled
  - [ ] Return updated like/dislike counts

- [ ] Update `dislikeVideo` similarly

### 6.3 Enhanced Comments
- [ ] Update `addComment` to:
  - [ ] Check global `isCommentsEnabled` setting
  - [ ] Check video-level `isCommentsEnabled`
  - [ ] Validate Turnstile token if enabled
  - [ ] Sanitize comment text
  - [ ] Increment video comment count
  - [ ] Return new comment and updated comments list

- [ ] Update `deleteComment` to:
  - [ ] Validate timestamp matches
  - [ ] Decrement video comment count
  - [ ] Purge watch page cache

### 6.4 Video Reporting System
- [ ] Create `VideoReportService` or add to `VideosService`:
  - [ ] Check global `isReportsEnabled`
  - [ ] Check video-level `isReportsEnabled`
  - [ ] Validate Turnstile token
  - [ ] Sanitize email and message
  - [ ] Insert into `videoreports` table

- [ ] Add `reportVideo` controller method
- [ ] Add route `POST /:videoId/report`

### 6.5 View Counter with Debouncing
- [ ] Create view counter utility:
  - [ ] Per-video counter accumulator
  - [ ] Debounce timer (500ms)
  - [ ] Batch update to database
  - [ ] Return current view count (including pending)

- [ ] Update `incrementViews` to use debounced counter

**Phase 6 Verification Checklist:**
- [ ] Turnstile blocks when enabled and token missing
- [ ] Turnstile passes with valid token
- [ ] Like/dislike respect enable flags
- [ ] Comments respect enable flags
- [ ] Reports stored correctly
- [ ] View counter batches updates

---

## Phase 7: Cache & Performance

**Goal:** Integrate Cloudflare cache purging throughout.

**Estimated Time:** 6-8 hours  
**Dependencies:** Phases 3-4 complete

### 7.1 Cache Purging Integration Map

| Operation | Cache to Purge |
|-----------|----------------|
| Video upload complete | `purgeNodePage`, `purgeAllWatchPages`, `purgeVideo` |
| Video unpublish | `purgeAllEmbedVideoPages`, `purgeAllWatchPages`, `purgeVideo` |
| Video data update | `purgeEmbedVideoPages`, `purgeWatchPages`, `purgeNodePage` |
| Video delete | `purgeNodePage`, `purgeEmbedVideoPages`, `purgeAdaptiveVideos`, `purgeProgressiveVideos`, `purgeAllWatchPages` |
| Thumbnail upload | `purgeVideoThumbnailImages` |
| Preview upload | `purgeVideoPreviewImages` |
| Poster upload | `purgePosterImages` |
| Index outdated | `purgeVideoThumbnailImages`, `purgeVideoPreviewImages`, `purgePosterImages` |
| Comment add/delete | `purgeWatchPages` |
| Like/dislike | `purgeWatchPages` |

### 7.2 Implementation Tasks
- [ ] Add Cloudflare calls to `videoUploaded`
- [ ] Add Cloudflare calls to `unpublishFormatResolution`
- [ ] Add Cloudflare calls to `updateVideo`
- [ ] Add Cloudflare calls to `deleteVideo` / `deleteVideos`
- [ ] Add Cloudflare calls to image upload handlers
- [ ] Add Cloudflare calls to `markIndexOutdated`
- [ ] Add Cloudflare calls to comment operations
- [ ] Add Cloudflare calls to like/dislike operations

### 7.3 Conditional Purging
- [ ] Ensure purging only occurs when `isCloudflareCdnEnabled = true`
- [ ] Handle purge failures gracefully (log, don't throw)

**Phase 7 Verification Checklist:**
- [ ] Cache purges on all mutations when CDN enabled
- [ ] No purge attempts when CDN disabled
- [ ] Failures logged but don't break operations

---

## Phase 8: Final Integration & Testing

**Goal:** Verify complete feature parity and system integration.

**Estimated Time:** 8-12 hours  
**Dependencies:** All previous phases complete

### 8.1 Route Verification
- [ ] Compare all JS routes vs TS routes
- [ ] Verify route patterns match exactly
- [ ] Verify HTTP methods match

### 8.2 Response Format Verification
- [ ] Compare response shapes for each endpoint
- [ ] Ensure `isError` field present where expected
- [ ] Ensure camelCase property names match JS

### 8.3 WebSocket Integration
- [ ] Verify `video_data` broadcasts on import
- [ ] Verify `video_status` broadcasts during publishing
- [ ] Verify upload progress broadcasts

### 8.4 Error Handling
- [ ] Verify error messages match JS behavior
- [ ] Ensure stack traces logged appropriately
- [ ] Verify 400/404/500 status codes correct

### 8.5 Integration Tests
- [ ] Test complete video import → publish → index workflow
- [ ] Test video player data retrieval
- [ ] Test comment flow with Turnstile
- [ ] Test batch delete with various video states

### 8.6 Documentation Update
- [ ] Update API documentation if exists
- [ ] Mark migration complete in discrepancies report
- [ ] Document any intentional deviations from JS behavior

**Phase 8 Verification Checklist:**
- [ ] All 43 JS functions have TS equivalents
- [ ] All 35 routes implemented
- [ ] End-to-end workflows function correctly
- [ ] No regressions in existing functionality

---

## Quick Reference: Files by Phase

| Phase | Files Created | Files Modified |
|-------|---------------|----------------|
| 1 | - | `container.ts`, `services/videos.ts` |
| 2 | - | `services/videos.ts`, `services/comment.ts`, `controllers/videos.ts`, `routes/videos.ts` |
| 3 | - | `services/videos.ts`, `controllers/videos.ts`, `routes/videos.ts` |
| 4 | `services/video-upload.ts` | `app.ts`, `routes/videos.ts`, `controllers/videos.ts` |
| 5 | `services/indexer.ts` (if new) | `services/videos.ts`, `controllers/videos.ts`, `routes/videos.ts` |
| 6 | - | `services/videos.ts`, `services/comment.ts`, `controllers/videos.ts` |
| 7 | - | `services/videos.ts` (add purge calls) |
| 8 | - | Various (bug fixes) |

---

## Progress Tracking

Use this section to track completion. Mark with date when complete.

| Phase | Started | Completed | Notes |
|-------|---------|-----------|-------|
| Phase 1: Foundation | | | |
| Phase 2: Read Operations | | | |
| Phase 3: Write Operations | | | |
| Phase 4: File Uploads | | | |
| Phase 5: Indexer | | | |
| Phase 6: User Interaction | | | |
| Phase 7: Cache | | | |
| Phase 8: Integration | | | |

---

## Risk Mitigation

### Potential Blockers

1. **Fastify multipart differences from Express multer**
   - Mitigation: Test file upload patterns early in Phase 4
   - Fallback: Consider fastify-multer adapter

2. **IndexerClient API compatibility**
   - Mitigation: Verify IndexerClient matches JS behavior in Phase 5
   - Fallback: Port exact JS implementation

3. **WebSocket broadcast timing**
   - Mitigation: Ensure WebSocket service available in all contexts
   - Fallback: Use event emitter pattern if DI issues

4. **View counter race conditions**
   - Mitigation: Use proper async locking or atomic operations
   - Fallback: Accept slight count inaccuracy for high traffic

---

## Dependencies Diagram

```
Phase 1 ─────────────────────────────────────────┐
    │                                            │
    ▼                                            │
Phase 2 ──────────────────────┐                  │
    │                         │                  │
    ▼                         │                  │
Phase 3 ──────────┬───────────┤                  │
    │             │           │                  │
    ▼             ▼           │                  │
Phase 4       Phase 6         │                  │
    │             │           │                  │
    ▼             │           │                  │
Phase 5           │           │                  │
    │             │           │                  │
    └──────┬──────┘           │                  │
           │                  │                  │
           ▼                  │                  │
       Phase 7 ◄──────────────┘                  │
           │                                     │
           ▼                                     │
       Phase 8 ◄─────────────────────────────────┘
```

**Note:** Phase 6 can run in parallel with Phases 4-5 as it primarily modifies existing endpoints rather than creating new infrastructure.
