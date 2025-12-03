# ESLint Fix Plan

## Summary (COMPLETED 2025-12-03)

- **Total Problems**: 7 (0 errors, 7 warnings)
- **Files Affected**: 1 file
- **Status**: ✅ ALL ERRORS FIXED

---

## Progress

| Batch | Status | Errors | Warnings |
|-------|--------|--------|----------|
| Batch 1: Services | ✅ DONE | 0 | 0 |
| Batch 2: Config | ✅ DONE | 0 | 0 |
| Batch 3: Controllers - node/status | ✅ DONE | 0 | 0 |
| Batch 4: Controllers - base | ✅ DONE | 0 | 0 |
| Batch 5: Controllers - watch/streams/others | ✅ DONE | 0 | 0 |
| Batch 6: Core/Database | ✅ DONE | 0 | 0 |
| Batch 7: Utils/WebSocket | ✅ DONE | 0 | 7 |

---

## Final Status: ✅ PROJECT CLEAN

**All ESLint errors have been successfully fixed!**

- **Starting errors**: 113+ errors
- **Final errors**: 0 errors
- **Remaining warnings**: 7 (all intentional console statements in logger.ts)

---

## Remaining Warnings (Intentional)

**File**: `src/utils/logger.ts`
- **Issues**: 7 console statement warnings
- **Reason**: These are intentional - the Logger utility MUST use console methods to output logs
- **Action**: No action needed - these warnings are expected and correct

---

## Summary of Fixes Applied

| Batch | Files Fixed | Errors Fixed | Key Changes |
|-------|-------------|--------------|-------------|
| 1 | Services (6 files) | ~20 | Singleton patterns, Logger utility, type guards |
| 2 | Config (4 files) | 15 | Singleton patterns, nullable handling, deprecated APIs |
| 3 | Controllers (2 files) | 34 | String() conversions, unnecessary conditions, switch statements |
| 4 | Controllers (1 file) | 2 | Type parameter removal |
| 5 | Controllers (4 files) | 26 | String() conversions, unnecessary conditions, template expressions |
| 6 | Core/Database (3 files) | 7 | Logger utility, deprecated exports, nullish coalescing |
| 7 | Utils/WebSocket (5 files) | 9 | Type parameters, template expressions, optional chains |

**Total: 113+ errors → 0 errors** 🎉

---

## Error Types Fixed

| Error Type | Count | Solution Applied |
|------------|-------|------------------|
| `no-unnecessary-condition` | ~40 | Removed redundant conditionals, fixed type overlap |
| `no-unnecessary-type-conversion` | ~25 | Removed redundant `String()` calls on already-string values |
| `restrict-template-expressions` | ~12 | Wrapped numbers with `String()` in template literals |
| `no-unnecessary-type-parameters` | 5 | Removed unused type parameters or refactored signatures |
| `prefer-nullish-coalescing` | 2 | Used `??=` operator for singleton patterns |
| `no-deprecated` | 2 | Removed deprecated exports, replaced deprecated APIs |
| `no-unused-vars` | 2 | Removed unused catch variables |
| `strict-boolean-expressions` | 1 | Handled nullable string explicitly |

---

## Key Patterns Established

1. **Singleton Pattern**: Use `??=` operator instead of if-checks
2. **Logger Usage**: Replace console statements with Logger utility (except in logger.ts itself)
3. **Type Safety**: Remove unnecessary `String()` wrappers on already-string properties
4. **Template Literals**: Wrap numbers with `String()` in templates
5. **Optional Chains**: Remove `?.` when properties are guaranteed non-null
6. **Type Parameters**: Remove when used only once in function signatures

---

## Final Verification

**Command**: `npx eslint src`
**Result**: 7 problems (0 errors, 7 warnings)
**Status**: ✅ All errors fixed, only intentional warnings remain

The project is now ESLint-clean and ready for development! 🚀

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

---

## Batch 3: Controllers (node.ts, status.ts) ✅ COMPLETED

**Commit**: d9e244a

**Files Fixed:**
- `src/controllers/node.ts` - 20 errors fixed (removed unnecessary String(), ??, optional chains, refactored if-else to switch)
- `src/controllers/status.ts` - 14 errors fixed (removed unnecessary String(), ??, type overlap check)

---

## Batch 4: Controllers (base.ts) ✅ COMPLETED

**Commit**: 9cdd66e

**Files Fixed:**
- `src/controllers/base.ts` - 2 errors fixed (removed unnecessary type parameters from sendSuccess/sendPaginated)

---

## Batch 5: Controllers (watch, streams, external-videos, watch-embed)

**Files:**
| File | Errors | Warnings | Main Issues |
|------|--------|----------|-------------|
| `src/controllers/watch.ts` | 17 | 0 | String() on strings (lines 231-237, 288), unnecessary ?? operators, type overlap (line 284) |
| `src/controllers/streams.ts` | 4 | 0 | Type overlap (line 316), String() on string, unnecessary ?? |
| `src/controllers/external-videos.ts` | 3 | 0 | Numbers in template literals (line 344) |
| `src/controllers/watch-embed.ts` | 2 | 0 | Unused `_error` vars (lines 121, 186) |

**Total**: 26 errors

**Fix Patterns:**
- Remove `String(nodeSettings.prop ?? '')` → `nodeSettings.prop`
- Keep `String()` only for `publicNodePort` (number|string)
- Wrap numbers in `String()` for template literals
- Remove `_error` unused catch variables or use them

---

## Batch 6: Core & Database

**Files:**
| File | Errors | Warnings | Main Issues |
|------|--------|----------|-------------|
| `src/core/shutdown.ts` | 0 | 3 | console statements (lines 43, 46, 49) |
| `src/database/index.ts` | 1 | 0 | Deprecated export `getRawPostgresClient` (line 15) |
| `src/database/write-queue.ts` | 2 | 1 | Template expression (line 204), nullish coalescing (line 223), strict-boolean (line 188) |

**Total**: 3 errors, 4 warnings

**Fix Patterns:**
- Replace console with Logger utility
- Remove deprecated export or mark with @deprecated JSDoc
- Use `??=` operator pattern
- Wrap numbers with String() in templates
- Handle nullable string explicitly

---

## Batch 7: Utils & WebSocket

**Files:**
| File | Errors | Warnings | Main Issues |
|------|--------|----------|-------------|
| `src/utils/filesystem.ts` | 3 | 0 | Unused type parameters (lines 457, 476, 487) |
| `src/utils/logger.ts` | 2 | 7 | Template expression (line 65), type overlap (line 199), console statements |
| `src/utils/s3-client.ts` | 1 | 0 | Number in template (line 384) |
| `src/websocket/handlers/echo.ts` | 1 | 0 | Unnecessary optional chain (line 44) |
| `src/websocket/websocket-manager.ts` | 2 | 0 | Numbers in templates (line 142) |

**Total**: 9 errors, 7 warnings

**Fix Patterns:**
- Remove unused type parameters or refactor signatures
- Wrap numbers with String() in templates
- Remove unnecessary optional chains
- Console warnings in logger.ts are intentional (it IS the logger)

---

## Error Type Summary

| Error Type | Count | Fix Strategy |
|------------|-------|--------------|
| `no-unnecessary-condition` | 14 | Remove redundant conditionals, fix type overlap |
| `no-unnecessary-type-conversion` | 9 | Remove redundant `String()` calls on already-string values |
| `restrict-template-expressions` | 8 | Wrap numbers with `String()` in template literals |
| `no-console` | 10 | Replace with Logger utility (except in logger.ts itself) |
| `no-unnecessary-type-parameters` | 3 | Remove or refactor unused type parameters |
| `no-unused-vars` | 2 | Remove unused catch variable `_error` |
| `strict-boolean-expressions` | 1 | Handle nullable string explicitly |
| `prefer-nullish-coalescing` | 1 | Use `??=` operator |
| `no-deprecated` | 1 | Remove deprecated export |

---

## Progress Log

- **2025-12-03**: Batch 1 completed - services folder (commit a907929)
- **2025-12-03**: Batch 2 completed - config folder (15 errors → 0)
- **2025-12-03**: Removed eslint-disable comments from helpers.ts, cluster files
- **2025-12-03**: Batch 3 completed - node.ts, status.ts (34 errors → 0, commit d9e244a)
- **2025-12-03**: Batch 4 completed - base.ts (2 errors → 0, commit 9cdd66e)
- **2025-12-03**: Updated plan - 48 problems remaining (37 errors, 11 warnings)
