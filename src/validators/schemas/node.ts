/** Moderation activity request schemas. */
import { z } from 'zod';
export const contentTypeSchema = z.enum(['comments', 'videoReports', 'commentReports']);
export const contentCheckedBodySchema = z.object({ contentType: contentTypeSchema });
