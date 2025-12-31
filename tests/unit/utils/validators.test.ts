import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isCloudflareCredentialsValid } from '@/utils/validators.js';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

// Import the mocked axios
import axios from 'axios';

const mockedAxios = vi.mocked(axios);

describe('utils/validators.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isCloudflareCredentialsValid', () => {
    it('should return true for valid credentials', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true },
      });

      const result = await isCloudflareCredentialsValid(
        'test@example.com',
        'zone123',
        'api_key_123'
      );

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/zone123',
        {
          headers: {
            'X-Auth-Email': 'test@example.com',
            'X-Auth-Key': 'api_key_123',
          },
        }
      );
    });

    it('should return false for invalid credentials', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: false },
      });

      const result = await isCloudflareCredentialsValid(
        'invalid@example.com',
        'invalid_zone',
        'invalid_key'
      );

      expect(result).toBe(false);
    });

    it('should return false when API call throws an error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await isCloudflareCredentialsValid(
        'test@example.com',
        'zone123',
        'api_key_123'
      );

      expect(result).toBe(false);
    });

    it('should handle different error types', async () => {
      // Test with different error types that might occur
      mockedAxios.get.mockRejectedValueOnce(new Error('Timeout'));
      const result1 = await isCloudflareCredentialsValid('a', 'b', 'c');
      expect(result1).toBe(false);

      mockedAxios.get.mockRejectedValueOnce(new Error('401 Unauthorized'));
      const result2 = await isCloudflareCredentialsValid('a', 'b', 'c');
      expect(result2).toBe(false);
    });

    it('should make request to correct Cloudflare API endpoint', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true },
      });

      await isCloudflareCredentialsValid('email@test.com', 'zone_456', 'key_789');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/zone_456',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Auth-Email': 'email@test.com',
            'X-Auth-Key': 'key_789',
          }),
        })
      );
    });
  });
});