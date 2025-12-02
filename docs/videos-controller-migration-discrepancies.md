# Videos Controller Migration Discrepancies Report

**Date Generated:** 2024-01-XX  
**Analysis Scope:** `controllers/videos.js` (1,485 lines) → `src/controllers/videos.ts` (574 lines)  
**Related Services:** `src/services/videos.ts`, `src/services/comment.ts`, `src/services/cloudflare.ts`

---

## Executive Summary

The TypeScript videos controller is **significantly incomplete** compared to the JavaScript implementation. The TS version is approximately **39% of the JS size** (574 vs 1,485 lines), missing critical functionality for:

- Video indexing (MoarTube Indexer integration)
- Complex file upload workflows (multer-based video/image uploads)
- Cloudflare cache purging calls
- Video reporting system
- Permission management
- Batch operations with complex filtering
- View counter with debouncing/batching
- WebSocket broadcasts for real-time updates

---

## Function Mapping Table

| JS Function | TS Method | Status | Notes |
|-------------|-----------|--------|-------|
| `import_POST` | `importVideo` | ⚠️ Partial | TS delegates to service, missing websocket broadcast details |
| `imported_POST` | `videoImported` | ⚠️ Partial | Exists but may lack full implementation |
| `videoIdImportingStop_POST` | `stopImporting` | ⚠️ Partial | Basic implementation |
| `publishing_POST` | `startPublishing` | ⚠️ Partial | Exists |
| `published_POST` | `videoPublished` | ⚠️ Partial | Exists |
| `formatResolutionPublished_POST` | `formatResolutionPublished` | ✅ Exists | Delegates to service |
| `videoIdPublishingStop_POST` | `stopPublishing` | ✅ Exists | |
| `videoIdUpload_POST` | `videoUploaded` | ⚠️ Incomplete | **Missing multer upload handling, Cloudflare purge** |
| `videoIdStream_POST` | `videoStreamed` | ⚠️ Incomplete | **Missing actual stream file handling** |
| `error_POST` | `videoError` | ✅ Exists | |
| `videoIdSourceFileExtension_POST` | `setSourceFileExtension` | ✅ Exists | |
| `videoIdSourceFileExtension_GET` | `getSourceFileExtension` | ✅ Exists | |
| `videoIdPublishes_GET` | `getPublishes` | ✅ Exists | |
| `videoIdUnpublish_POST` | `unpublishFormatResolution` | ⚠️ Partial | **Missing Cloudflare cache purge calls** |
| `videoIdData_POST` | `updateVideo` | ⚠️ Partial | **Missing Cloudflare purge, tag sanitization** |
| `videoIdIndexAdd_POST` | ❌ Missing | ❌ **CRITICAL** | **Entire indexer workflow missing** |
| `videoIdIndexRemove_POST` | ❌ Missing | ❌ **CRITICAL** | **Entire indexer workflow missing** |
| `videoIdIndexOudated_POST` | ❌ Missing | ❌ Missing | Index outdated marking |
| `videoIdAlias_GET` | ❌ Missing | ❌ Missing | MoarTube Aliaser URL generation |
| `search_GET` | `searchVideos` | ⚠️ Partial | Different implementation pattern |
| `videoIdThumbnail_POST` | ❌ Missing | ❌ **CRITICAL** | **Multer image upload + Cloudflare purge** |
| `videoIdPreview_POST` | ❌ Missing | ❌ **CRITICAL** | **Multer image upload + Cloudflare purge** |
| `videoIdPoster_POST` | ❌ Missing | ❌ **CRITICAL** | **Multer image upload + Cloudflare purge** |
| `videoIdLengths_POST` | ❌ Missing | ❌ Missing | Video length metadata update |
| `videoIdData_GET` | `getVideo` | ⚠️ Partial | **Missing videoAliasUrl, detailed formatting** |
| `videoIdDataAll_GET` | ❌ Missing | ❌ Missing | Get all videos with full data |
| `delete_POST` | `deleteVideo` | ⚠️ Partial | **TS is single-video, JS is batch with complex filtering** |
| `finalize_POST` | `finalizeVideo` | ⚠️ Partial | **TS is single-video, JS is batch with filtering** |
| `videoIdComments_GET` | `getComments` | ⚠️ Partial | **Missing type/sort/timestamp filtering** |
| `videoIdCommentsCommentId_GET` | ❌ Missing | ❌ Missing | Get single comment by ID |
| `videoIdCommentsComment_POST` | `addComment` | ⚠️ Partial | **Missing Cloudflare Turnstile, comment enable checks** |
| `videoIdCommentsCommentIdDelete_DELETE` | `deleteComment` | ⚠️ Partial | Different signature, missing timestamp validation |
| `videoIdLike_POST` | `likeVideo` | ⚠️ Partial | **Missing Turnstile, likes-enabled checks** |
| `videoIdDislike_POST` | `dislikeVideo` | ⚠️ Partial | **Missing Turnstile, dislikes-enabled checks** |
| `recommended_GET` | ❌ Missing | ❌ Missing | Recommended videos endpoint |
| `tags_GET` | ❌ Missing | ❌ Missing | Published video tags |
| `tagsAll_GET` | ❌ Missing | ❌ Missing | All video tags |
| `videoIdReport_POST` | ❌ Missing | ❌ **CRITICAL** | **Video reporting system** |
| `videoIdViewsIncrement_GET` | `incrementViews` | ⚠️ Partial | **Missing debounced/batched view counter** |
| `videoIdWatch_GET` | ❌ Missing | ❌ **CRITICAL** | **Watch page data with sources/formats** |
| `videoIdPermissions_GET` | ❌ Missing | ❌ Missing | Video permission flags |
| `videoIdPermissions_POST` | ❌ Missing | ❌ Missing | Update video permissions |
| `videoIdAdaptiveM3u8ManifestsMasterManifest_POST` | ❌ Missing | ❌ **CRITICAL** | **HLS master manifest writing** |

---

## Detailed Discrepancies

### 1. **Cloudflare Cache Purging (CRITICAL)**

**JS Implementation:**
```javascript
// Found throughout videos.js
cloudflare_purgeNodePage();
cloudflare_purgeAllWatchPages();
cloudflare_purgeVideo(videoId, format, resolution);
cloudflare_purgeEmbedVideoPages([videoId]);
cloudflare_purgeWatchPages([videoId]);
cloudflare_purgeVideoThumbnailImages([videoId]);
cloudflare_purgeVideoPreviewImages([videoId]);
cloudflare_purgeVideoPosterImages([videoId]);
cloudflare_purgeAdaptiveVideos(deletedVideoIds);
cloudflare_purgeProgressiveVideos(deletedVideoIds);
```

**TS Implementation:**
- `CloudflareService` exists with all methods
- **NOT INTEGRATED** into `VideosController` or `VideosService`
- Service methods exist but are never called

**Files Affected:**
- `videoIdUpload_POST` → `videoUploaded`
- `videoIdUnpublish_POST` → `unpublishFormatResolution`
- `videoIdData_POST` → `updateVideo`
- `delete_POST` → `deleteVideo`
- All image upload handlers

---

### 2. **MoarTube Indexer Integration (CRITICAL)**

**JS Functions:**
- `videoIdIndexAdd_POST` - Add video to MoarTube index
- `videoIdIndexRemove_POST` - Remove video from index
- `videoIdIndexOudated_POST` - Mark index as outdated
- `videoIdAlias_GET` - Get MoarTube Aliaser URL

**TS Implementation:**
- `IIndexerService` interface exists
- `IndexerClient` utility class exists in `src/utils/indexer-client.ts`
- **NO controller methods or routes for indexing**

**Missing Route Endpoints:**
- `POST /:videoId/index/add`
- `POST /:videoId/index/remove`
- `POST /:videoId/index/outdated`
- `GET /:videoId/alias`

---

### 3. **Video/Image Upload System (CRITICAL)**

**JS Implementation (route-level):**
```javascript
// Complex multer configuration in routes/videos.js
// Handles: thumbnail, preview, poster, video segments
multer({
    fileFilter: function (req, file, cb) { ... },
    storage: multer.diskStorage({
        destination: function (req, file, cb) { ... },
        filename: function (req, file, cb) { ... }
    })
}).fields([{ name: 'video_files' }])
```

**TS Implementation:**
- `videoUploaded` just logs a debug message
- **NO actual file handling**
- **NO multer integration**
- **NO storage directory creation**

**Missing Endpoints in TS Routes:**
- `POST /:videoId/upload` (with multer)
- `POST /:videoId/stream` (with multer)
- `POST /:videoId/images/thumbnail`
- `POST /:videoId/images/preview`
- `POST /:videoId/images/poster`

---

### 4. **Batch Operations**

**JS Implementation:**
```javascript
// delete_POST handles multiple videos with complex filtering
async function delete_POST(videoIds) {
    await submitDatabaseWriteJob(
        'DELETE FROM videos WHERE (is_importing = false AND is_publishing = false...) AND video_id IN (:videoIds)',
        { videoIds }
    );
    // Returns both deletedVideoIds and nonDeletedVideoIds
    return { deletedVideoIds, nonDeletedVideoIds };
}
```

**TS Implementation:**
```typescript
// deleteVideo handles single video only
deleteVideo = async (request, reply) => {
    const { videoId } = request.params;
    const deleted = await videoService.deleteVideo(videoId);
    // Single video, no batch, no filtering
};
```

**Missing:**
- Batch delete with safety filtering
- Batch finalize with safety filtering
- Return of non-deleted/non-finalized video IDs

---

### 5. **View Counter with Debouncing**

**JS Implementation:**
```javascript
let viewCounter = 0;
let viewCounterIncrementTimer;
async function videoIdViewsIncrement_GET(videoId) {
    viewCounter++;
    clearTimeout(viewCounterIncrementTimer);
    viewCounterIncrementTimer = setTimeout(async function () {
        const viewCounterTemp = viewCounter;
        viewCounter = 0;
        await submitDatabaseWriteJob('UPDATE videos SET views = views + ? ...', [viewCounterTemp, ...]);
    }, 500);
    // Returns current view count including pending
}
```

**TS Implementation:**
```typescript
incrementViews = async (request, reply) => {
    await videoService.incrementViews(videoId);  // Direct DB update
    this.sendSuccess(reply, { videoId });
};
```

**Missing:**
- Debounce/batch mechanism
- Rate limiting to prevent flooding
- Return of current view count

---

### 6. **Cloudflare Turnstile Verification**

**JS Implementation (in multiple functions):**
```javascript
if (nodeSettings.isCloudflareTurnstileEnabled) {
    if (cloudflareTurnstileToken.length === 0) {
        errorMessage = 'human verification was enabled...';
    } else {
        await cloudflare_validateTurnstileToken(cloudflareTurnstileToken, cloudflareConnectingIp);
    }
}
```

**TS Implementation:**
- `CloudflareService.validateTurnstileToken()` exists
- **NOT called** in any controller methods

**Affected Endpoints:**
- Like video
- Dislike video
- Add comment
- Report video
- Index add/remove

---

### 7. **Video Watch Data (CRITICAL)**

**JS Implementation:**
```javascript
async function videoIdWatch_GET(videoId) {
    // Complex source generation for all formats/resolutions
    const adaptiveSources = [];
    const progressiveSources = [];
    const sourcesFormatsAndResolutions = { m3u8: [], mp4: [], webm: [], ogv: [] };
    
    // Builds complete player-ready data
    return {
        video: {
            videoId, title, description, views, likes, dislikes,
            isPublished, isPublishing, isLive, isStreaming,
            isHlsAvailable, isMp4Available, isWebmAvailable, isOgvAvailable,
            adaptiveSources, progressiveSources, sourcesFormatsAndResolutions
        }
    };
}
```

**TS Implementation:**
- **COMPLETELY MISSING**
- `getVideo` returns raw database record
- No source URL generation
- No format availability flags

---

### 8. **Video Reporting System**

**JS Implementation:**
```javascript
async function videoIdReport_POST(videoId, email, reportType, message, cloudflareTurnstileToken, cloudflareConnectingIp) {
    // Validates Turnstile token
    // Checks if reporting is enabled (global and per-video)
    // Sanitizes input
    // Inserts into videoreports table
}
```

**TS Implementation:**
- **COMPLETELY MISSING**
- No controller method
- No route
- No service method

---

### 9. **Video Permissions**

**JS Implementation:**
```javascript
async function videoIdPermissions_GET(videoId) {
    return {
        isCommentsEnabled, isLikesEnabled, isDislikesEnabled,
        isReportsEnabled, isLiveChatEnabled
    };
}

async function videoIdPermissions_POST(videoId, type, isEnabled) {
    // Updates specific permission flag
}
```

**TS Implementation:**
- **COMPLETELY MISSING**
- Permission fields exist in schema
- No endpoints to get/set them

---

### 10. **WebSocket Broadcasts**

**JS Implementation:**
```javascript
websocketNodeBroadcast({
    eventName: 'echo',
    data: {
        eventName: 'video_data',
        payload: { videoId, thumbnail, title, ... }
    }
});
```

**TS Implementation:**
- `broadcastVideoEvent()` exists in `VideosService`
- Called only in `createVideo()`
- **Missing from:** publishing progress, upload progress, status updates

---

### 11. **HLS Master Manifest (CRITICAL)**

**JS Implementation:**
```javascript
async function videoIdAdaptiveM3u8ManifestsMasterManifest_POST(videoId, type, masterManifest) {
    const masterManifestPath = path.join(getVideosDirectoryPath(), videoId, 'adaptive', 'm3u8', 'manifest-master.m3u8');
    fs.writeFileSync(masterManifestPath, masterManifest, 'utf-8');
}
```

**TS Implementation:**
- **COMPLETELY MISSING**
- No endpoint in routes
- No controller method
- Required for HLS video playback

---

### 12. **Tags Endpoints**

**JS Implementation:**
- `tags_GET` - Get tags from published/live videos
- `tagsAll_GET` - Get tags from all videos

**TS Implementation:**
- **COMPLETELY MISSING**
- No endpoints for tag retrieval

---

### 13. **Recommended Videos**

**JS Implementation:**
```javascript
async function recommended_GET() {
    const recommendedVideos = await performDatabaseReadJob_ALL(
        'SELECT * FROM videos WHERE (is_published = ? OR is_live = ?) ORDER BY creation_timestamp DESC',
        [true, true]
    );
}
```

**TS Implementation:**
- **COMPLETELY MISSING**
- Would be useful for homepage/sidebar recommendations

---

## Route Comparison

### JS Routes (`routes/videos.js`):
```
POST   /import
POST   /imported
POST   /:videoId/importing/stop
POST   /publishing
POST   /published
POST   /:videoId/:format/:resolution/published
POST   /:videoId/publishing/stop
POST   /:videoId/upload                           ← MISSING IN TS
POST   /:videoId/stream                           ← MISSING IN TS
POST   /error
POST   /:videoId/sourceFileExtension
GET    /:videoId/sourceFileExtension
GET    /:videoId/publishes
POST   /:videoId/unpublish
POST   /:videoId/data
POST   /:videoId/index/add                        ← MISSING IN TS
POST   /:videoId/index/remove                     ← MISSING IN TS
POST   /:videoId/index/outdated                   ← MISSING IN TS
GET    /:videoId/alias                            ← MISSING IN TS
GET    /search
POST   /:videoId/images/thumbnail                 ← MISSING IN TS
POST   /:videoId/images/preview                   ← MISSING IN TS
POST   /:videoId/images/poster                    ← MISSING IN TS
POST   /:videoId/lengths                          ← MISSING IN TS
GET    /:videoId/data
GET    /:videoId/data/all                         ← MISSING IN TS
POST   /delete
POST   /finalize
GET    /:videoId/comments
GET    /:videoId/comments/:commentId              ← MISSING IN TS
POST   /:videoId/comments/comment
DELETE /:videoId/comments/:commentId/delete
POST   /:videoId/like
POST   /:videoId/dislike
GET    /recommended                               ← MISSING IN TS
GET    /tags                                      ← MISSING IN TS
GET    /tags/all                                  ← MISSING IN TS
POST   /:videoId/report                           ← MISSING IN TS
GET    /:videoId/views/increment
GET    /:videoId/watch                            ← MISSING IN TS
POST   /:videoId/adaptive/m3u8/:type/manifests/masterManifest  ← MISSING IN TS
GET    /:videoId/permissions                      ← MISSING IN TS
POST   /:videoId/permissions                      ← MISSING IN TS
```

### TS Routes (`src/routes/videos.ts`):
```
GET    /search
GET    /:videoId
GET    /:videoId/comments
POST   /:videoId/view                    (different from /views/increment)
POST   /:videoId/like
POST   /:videoId/dislike
POST   /:videoId/comment
POST   /import
POST   /:videoId/data
POST   /:videoId/delete
POST   /:videoId/finalize
POST   /:videoId/publish                 (doesn't exist in JS as separate endpoint)
POST   /:videoId/unpublish               (different pattern from JS)
DELETE /:videoId/comments/:commentId/delete
```

---

## Priority Implementation Order

### Critical (Blocks Core Functionality):
1. **Video Watch Data** (`videoIdWatch_GET`) - Required for video player
2. **HLS Master Manifest** (`videoIdAdaptiveM3u8ManifestsMasterManifest_POST`) - Required for HLS playback
3. **Video Upload Route** with multer - Required for publishing workflow
4. **Image Upload Routes** (thumbnail, preview, poster) - Required for video images
5. **MoarTube Indexer Integration** - Required for discoverability

### High Priority:
6. **Cloudflare Cache Purging** - Integrate into all mutation operations
7. **Video Reporting System** - User safety feature
8. **Permissions Endpoints** - Required for video access control
9. **Cloudflare Turnstile** - Spam prevention

### Medium Priority:
10. **Batch Delete/Finalize** with filtering
11. **View Counter Debouncing**
12. **Tags Endpoints**
13. **Recommended Videos**
14. **Get Single Comment**
15. **Video Lengths Update**
16. **Get All Videos Data**

---

## Estimated Implementation Effort

| Category | Items | Estimated Hours |
|----------|-------|-----------------|
| Critical Missing Endpoints | 5 | 20-30 |
| Cloudflare Integration | 1 | 8-12 |
| Multer File Upload System | 4 | 15-20 |
| Indexer Integration | 4 | 10-15 |
| Permissions & Reporting | 3 | 6-10 |
| Batch Operations | 2 | 4-6 |
| View Counter Enhancement | 1 | 2-3 |
| Misc Endpoints | 6 | 8-12 |
| **Total** | | **73-108 hours** |

---

## Files to Create/Modify

### New Files Needed:
- `src/services/indexer.ts` - Indexer service (if not using existing utility)
- Consider middleware for multipart/file uploads

### Files to Modify:
- `src/controllers/videos.ts` - Add ~25 missing methods
- `src/routes/videos.ts` - Add ~18 missing routes
- `src/services/videos.ts` - Add service methods for new functionality
- `src/container.ts` - Register new services

---

## Notes

1. The TS codebase uses a service abstraction pattern which is good for testability but means functionality needs to be added in multiple layers.

2. The JS codebase has significant logic in the route handlers themselves (especially multer configuration), which should be moved to appropriate service layers in TS.

3. WebSocket integration exists in TS but is underutilized - many operations that broadcast in JS don't in TS.

4. The TS `VideosService` has good infrastructure (repository pattern, error handling, logging) but lacks many methods.

5. Consider creating a `VideoUploadService` for handling the complex multer/storage logic.
