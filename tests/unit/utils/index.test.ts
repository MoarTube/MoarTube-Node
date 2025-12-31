import { describe, it, expect } from 'vitest';
import { isCloudflareCredentialsValid } from '@/utils/index.js';

describe('utils/index.ts', () => {
  describe('barrel exports', () => {
    it('should export isCloudflareCredentialsValid function', () => {
      expect(isCloudflareCredentialsValid).toBeDefined();
      expect(typeof isCloudflareCredentialsValid).toBe('function');
    });
  });
});