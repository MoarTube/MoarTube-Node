export function pageOptions(query: unknown): { limit: number; offset: number } {
  const values = (query ?? {}) as { limit?: unknown; offset?: unknown };
  const limit = Number(values.limit),
    offset = Number(values.offset);
  return {
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 101) : 101,
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
  };
}
