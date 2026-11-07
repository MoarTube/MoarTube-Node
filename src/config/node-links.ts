import { z } from 'zod';

export const nodeLinkSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
      } catch {
        return false;
      }
    }, 'Use a complete http:// or https:// URL'),
  description: z.string().trim().min(1).max(1000),
});

export const nodeLinksSchema = z.array(nodeLinkSchema).max(50);

/** Read legacy saved entries once; canonical nodeLinks (including []) takes precedence. */
export function migrateNodeLinksSettings(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }
  const settings = data as Record<string, unknown>;
  if (!Object.hasOwn(settings, 'nodeNeighbors')) {
    return data;
  }
  const { nodeNeighbors, ...current } = settings;
  return Object.hasOwn(current, 'nodeLinks') ? current : { ...current, nodeLinks: nodeNeighbors };
}
