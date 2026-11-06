import { z } from 'zod';

/** Ordered plain-text items managed in Client personalization settings. */
export const nodeBulletinSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Bulletin items cannot be empty')
      .max(1000, 'Bulletin items cannot exceed 1000 characters')
  )
  .max(50, 'A bulletin cannot exceed 50 items');
