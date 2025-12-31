import { describe, it, expect } from 'vitest';
import * as validators from '@/validators/index.js';

describe('validators/index.ts', () => {
  describe('barrel exports', () => {
    it('should export common schemas', () => {
      expect(validators.videoIdSchema).toBeDefined();
      expect(validators.titleSchema).toBeDefined();
      expect(validators.descriptionSchema).toBeDefined();
      expect(validators.usernameSchema).toBeDefined();
      expect(validators.passwordSchema).toBeDefined();
    });

    it('should export video schemas', () => {
      expect(validators.videoIdParamsSchema).toBeDefined();
      expect(validators.videoSearchQuerySchema).toBeDefined();
      expect(validators.videoCommentsQuerySchema).toBeDefined();
    });

    it('should export schemas from all validator files', () => {
      // Test that key schemas from different files are exported
      expect(validators.videoIdSchema).toBeDefined(); // from common
      expect(validators.videoIdParamsSchema).toBeDefined(); // from videos
      // Add more as we create more validator tests
    });

    it('should have consistent schema types', () => {
      // Test that exported schemas are Zod schemas (have parse method)
      expect(typeof validators.videoIdSchema.parse).toBe('function');
      expect(typeof validators.titleSchema.parse).toBe('function');
      expect(typeof validators.videoIdParamsSchema.parse).toBe('function');
    });
  });
});