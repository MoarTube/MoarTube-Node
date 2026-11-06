import { z } from 'zod';

export const nodeNeighborSchema = z.object({
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

export const nodeNeighborsSchema = z.array(nodeNeighborSchema).max(50);
