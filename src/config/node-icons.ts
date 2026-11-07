import { z } from 'zod';

const iconSchema = z.object({
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
  svgGraphic: z
    .string()
    .trim()
    .min(1)
    .max(50000)
    .refine((value) => /^<svg(?=[\s/>])[\s\S]*(?:<\/svg>|\/>)$/.test(value), 'Use an SVG graphic'),
});

export const nodeIconsSchema = z.array(iconSchema).max(50);
