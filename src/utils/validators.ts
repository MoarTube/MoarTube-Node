/**
 * Validators Module
 *
 * Comprehensive validation functions for MoarTube-Node.
 * All validators are pure functions that return boolean values.
 */

/**
 * Validate Cloudflare credentials by making an API call
 * @param cloudflareEmailAddress - Cloudflare account email
 * @param cloudflareZoneId - Cloudflare zone ID
 * @param cloudflareGlobalApiKey - Cloudflare Global API key
 * @returns Promise<boolean> - Whether credentials are valid
 */
export async function isCloudflareCredentialsValid(
  cloudflareEmailAddress: string,
  cloudflareZoneId: string,
  cloudflareGlobalApiKey: string
): Promise<boolean> {
  try {
    const axios = (await import('axios')).default;

    const response = await axios.get<{ success: boolean }>(
      `https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}`,
      {
        headers: {
          'X-Auth-Email': cloudflareEmailAddress,
          'X-Auth-Key': cloudflareGlobalApiKey,
        },
      }
    );

    return response.data.success;
  } catch {
    return false;
  }
}

