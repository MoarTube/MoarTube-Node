# ESLint Fix Plan

## Summary

- **Total Problems**: 188 (148 errors, 40 warnings)
- **Files Affected**: 26 files

---

## Error Categories by Frequency

| Count | Rule | Fix Strategy |
|-------|------|--------------|
| 72 | `@typescript-eslint/no-unnecessary-condition` | Remove redundant conditionals or fix types |
| 40 | `@typescript-eslint/no-unnecessary-type-conversion` | Remove redundant `String()` / `Boolean()` calls |
| 20 | `@typescript-eslint/restrict-template-expressions` | Wrap numbers with `String()` in templates |
| 5 | `@typescript-eslint/no-unnecessary-type-parameters` | Remove unused type parameters or refactor |
| 4 | `@typescript-eslint/prefer-nullish-coalescing` | Use `??=` operator |
| 2 | `@typescript-eslint/return-await` | Add `await` to returned promises |
| 2 | `@typescript-eslint/no-deprecated` | Replace deprecated API usage |
| 2 | `@typescript-eslint/no-unused-vars` | Remove or prefix with `_` |
| 1 | `@typescript-eslint/use-unknown-in-catch-callback-variable` | Use `: unknown` type |

---

## Batch Plan

### Batch 1: High-Impact Services (45 errors)
**Priority: High** | **Complexity: Medium**

| File | Errors | Main Issues |
|------|--------|-------------|
| `src/services/videos.ts` | 35 | Boolean() conversions, unnecessary conditions |
| `src/services/storage.ts` | 2 | return-await |
| `src/services/settings.ts` | 1 | unnecessary condition |
| `src/services/indexer.ts` | 2 | template expression, optional chain |
| `src/services/report.ts` | 2 | template expressions |
| `src/services/base.ts` | 2 | template expressions |

### Batch 2: Controllers - Node/Status/Watch (44 errors)
**Priority: High** | **Complexity: Low-Medium**

| File | Errors | Main Issues |
|------|--------|-------------|
| `src/controllers/node.ts` | 21 | String() conversions, unnecessary conditions |
| `src/controllers/status.ts` | 14 | String() conversions, unnecessary conditions |
| `src/controllers/watch.ts` | 16 | String() conversions, unnecessary conditions |

### Batch 3: Controllers - Videos/Streams/Others (19 errors)
**Priority: Medium** | **Complexity: Medium**

| File | Errors | Main Issues |
|------|--------|-------------|
| `src/controllers/videos.ts` | 11 | unnecessary conditions |
| `src/controllers/streams.ts` | 4 | unnecessary conditions, String() |
| `src/controllers/external-videos.ts` | 3 | template expressions |
| `src/controllers/watch-embed.ts` | 2 | unused vars |
| `src/controllers/base.ts` | 2 | type parameters |

### Batch 4: Config Module (13 errors)
**Priority: Medium** | **Complexity: Medium**

| File | Errors | Main Issues |
|------|--------|-------------|
| `src/config/urls.ts` | 6 | unnecessary conditions, template expressions |
| `src/config/paths.ts` | 4 | unnecessary conditions |
| `src/config/env.ts` | 1 | unnecessary condition |
| `src/config/schema.ts` | 1 | deprecated API |

### Batch 5: Core/Database/Utils (15 errors)
**Priority: Medium** | **Complexity: Low**

| File | Errors | Main Issues |
|------|--------|-------------|
| `src/core/cluster/ipc-channel.ts` | 3 | unnecessary conditions, nullish coalescing |
| `src/core/cluster/master.ts` | 3 | template expressions, Boolean() |
| `src/database/write-queue.ts` | 2 | template expression, nullish coalescing |
| `src/database/index.ts` | 1 | deprecated export |
| `src/utils/filesystem.ts` | 3 | type parameters |
| `src/utils/logger.ts` | 2 | template expression, unnecessary condition |
| `src/utils/s3-client.ts` | 1 | template expression |

### Batch 6: WebSocket (3 errors)
**Priority: Low** | **Complexity: Low**

| File | Errors | Main Issues |
|------|--------|-------------|
| `src/websocket/websocket-manager.ts` | 2 | template expressions |
| `src/websocket/handlers/echo.ts` | 1 | optional chain |

---

## Warnings (40 total - Optional)

Most warnings are:
- `no-console` (19) - Console statements in logger/cluster code
- `strict-boolean-expressions` (21) - Nullable values in conditionals

**Recommendation**: Address warnings after all errors are fixed, or configure ESLint to downgrade/disable specific warnings for intentional console usage.

---

## Fix Patterns

### Pattern 1: Remove `String()` on strings
```typescript
// Before
const value = String(alreadyString) ?? 'default';

// After
const value = alreadyString;
```

### Pattern 2: Remove `Boolean()` on booleans
```typescript
// Before
const flag = Boolean(alreadyBoolean);

// After
const flag = alreadyBoolean;
```

### Pattern 3: Wrap numbers in template literals
```typescript
// Before
`Count: ${someNumber}`

// After
`Count: ${String(someNumber)}`
```

### Pattern 4: Use nullish coalescing assignment
```typescript
// Before
if (value === undefined) {
  value = defaultValue;
}

// After
value ??= defaultValue;
```

### Pattern 5: Remove unnecessary optional chain
```typescript
// Before
obj?.property  // when obj is never null/undefined

// After
obj.property
```

### Pattern 6: Fix return-await
```typescript
// Before
return promise;  // in try-catch

// After
return await promise;
```

---

## Execution Order

1. ✅ **Batch 1**: Services (largest impact, cleanest fixes)
2. ✅ **Batch 2**: Node/Status/Watch controllers (repetitive patterns)
3. ✅ **Batch 3**: Other controllers
4. ✅ **Batch 4**: Config module
5. ✅ **Batch 5**: Core/Database/Utils
6. ✅ **Batch 6**: WebSocket

---

## Notes

- Run `npx eslint src` after each batch to verify progress
- Some fixes may introduce type errors - verify with `npx tsc --noEmit`
- Consider adding eslint-disable comments for intentional patterns (like explicit `else if` checks)
