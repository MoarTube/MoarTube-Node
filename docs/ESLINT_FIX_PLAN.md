# ESLint Fix Plan

## Summary (Updated 2025-12-03)

- **Total Problems**: 118 (90 errors, 28 warnings)
- **Files Affected**: 18 files

---

## Progress

| Batch | Status | Errors | Warnings |
|-------|--------|--------|----------|
| Batch 1: Services | ✅ DONE | 0 | 0 |
| Batch 2: Config | ✅ DONE | 0 | 0 |
| Batch 3: Controllers - node/status | 🔲 TODO | 35 | 0 |
| Batch 4: Controllers - watch/streams/others | 🔲 TODO | 28 | 0 |
| Batch 5: Core/Database | 🔲 TODO | 9 | 12 |
| Batch 6: Utils/WebSocket | 🔲 TODO | 9 | 8 |

---

## Batch 1: Services ✅ COMPLETED

**Commit**: a907929

**Files Fixed:**
- `src/services/base.ts`
- `src/services/indexer.ts`
- `src/services/report.ts`
- `src/services/settings.ts`
- `src/services/storage.ts`
- `src/services/videos.ts`

---

## Batch 2: Config Files ✅ COMPLETED

**Files Fixed:**
- `src/config/env.ts` - 1 error fixed (nullable string handling)
- `src/config/paths.ts` - 4 errors fixed (singleton pattern)
- `src/config/urls.ts` - 9 errors fixed (singleton pattern, template expressions, nullable strings)
- `src/config/schema.ts` - 1 error fixed (deprecated `z.string().url()` → `z.url()`)

**Remaining**: 0 errors, 0 warnings

---

## Batch 3: Controllers (node.ts, status.ts)

**Files:**
| File | Errors | Warnings | Main Issues |
|------|--------|----------|-------------|
| `src/controllers/node.ts` | 20 | 0 | String() conversions, unnecessary ?? operators |
| `src/controllers/status.ts` | 15 | 0 | String() conversions, unnecessary ?? operators |

**Total**: 35 errors

---

## Batch 4: Controllers (watch, streams, others)

**Files:**
| File | Errors | Warnings | Main Issues |
|------|--------|----------|-------------|
| `src/controllers/base.ts` | 2 | 0 | type parameters |
| `src/controllers/watch.ts` | 17 | 0 | String() conversions, unnecessary conditions |
| `src/controllers/streams.ts` | 4 | 0 | unnecessary conditions, String() |
| `src/controllers/watch-embed.ts` | 2 | 0 | unused vars |
| `src/controllers/external-videos.ts` | 3 | 0 | template expressions |

**Total**: 28 errors

---

## Batch 5: Core & Database

**Files:**
| File | Errors | Warnings | Main Issues |
|------|--------|----------|-------------|
| `src/core/cluster/ipc-channel.ts` | 3 | 4 | unnecessary conditions, nullish coalescing, console |
| `src/core/cluster/master.ts` | 3 | 4 | template expressions, Boolean(), console |
| `src/core/shutdown.ts` | 0 | 3 | console |
| `src/database/index.ts` | 1 | 0 | deprecated export |
| `src/database/write-queue.ts` | 2 | 1 | template expression, nullish coalescing, strict-boolean |

**Total**: 9 errors, 12 warnings

---

## Batch 6: Utils & WebSocket

**Files:**
| File | Errors | Warnings | Main Issues |
|------|--------|----------|-------------|
| `src/utils/filesystem.ts` | 3 | 0 | type parameters |
| `src/utils/logger.ts` | 2 | 8 | template expression, unnecessary condition, console |
| `src/utils/s3-client.ts` | 1 | 0 | template expression |
| `src/websocket/handlers/echo.ts` | 1 | 0 | optional chain |
| `src/websocket/websocket-manager.ts` | 2 | 0 | template expressions |

**Total**: 9 errors, 8 warnings

---

## Error Type Summary

| Error Type | Count | Fix Strategy |
|------------|-------|--------------|
| `no-unnecessary-condition` | ~40 | Remove redundant conditionals or fix types |
| `no-unnecessary-type-conversion` | ~25 | Remove redundant `String()` / `Boolean()` calls |
| `restrict-template-expressions` | ~12 | Wrap numbers with `String()` in templates |
| `strict-boolean-expressions` | ~10 | Handle nullish/empty cases explicitly |
| `no-unnecessary-type-parameters` | 5 | Remove unused type parameters or refactor |
| `prefer-nullish-coalescing` | 2 | Use `??=` operator |
| `no-deprecated` | 2 | Replace deprecated API usage |
| `no-unused-vars` | 2 | Remove or prefix with `_` |
| `no-console` | ~15 | Intentional - consider if should fix |

---

## Progress Log

- **2025-12-03**: Batch 1 completed - services folder (commit a907929)
- **2025-12-03**: Batch 2 completed - config folder (15 errors → 0 errors, 5 warnings remain for singleton pattern)
- **2025-12-03**: Updated plan with current state
