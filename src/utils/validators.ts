/**
 * Validators Module
 *
 * Comprehensive validation functions for MoarTube-Node.
 * All validators are pure functions that return boolean values.
 */

// ============================================
// String Validators
// ============================================

/**
 * Check if a node name is valid
 * @param nodeName - The node name to validate
 */
export function isNodeNameValid(nodeName: string | null | undefined): boolean {
  return (
    nodeName !== null && nodeName !== undefined && nodeName.length >= 0 && nodeName.length <= 100
  );
}

/**
 * Check if a node about text is valid
 * @param nodeAbout - The about text to validate
 */
export function isNodeAboutValid(nodeAbout: string | null | undefined): boolean {
  return (
    nodeAbout !== null &&
    nodeAbout !== undefined &&
    nodeAbout.length >= 0 &&
    nodeAbout.length <= 100
  );
}

/**
 * Check if a node ID is valid
 * @param nodeId - The node ID to validate
 */
export function isNodeIdValid(nodeId: string | null | undefined): boolean {
  return nodeId !== null && nodeId !== undefined && nodeId.length > 0 && nodeId.length <= 100;
}

/**
 * Check if a public node protocol is valid
 * @param protocol - The protocol to validate
 */
export function isPublicNodeProtocolValid(
  protocol: string | null | undefined
): protocol is 'http' | 'https' {
  return (
    protocol !== null && protocol !== undefined && (protocol === 'http' || protocol === 'https')
  );
}

// ============================================
// Video Validators
// ============================================

/**
 * Video ID regex pattern (11 characters, alphanumeric with optional underscore/hyphen)
 */
const VIDEO_ID_REGEX = /^(?=.*[a-zA-Z]|\d)?[a-zA-Z0-9_-]{0,11}$/;

/**
 * Check if a video ID is valid
 * @param videoId - The video ID to validate
 * @param canBeEmpty - Whether an empty string is valid
 */
export function isVideoIdValid(videoId: string | null | undefined, canBeEmpty = false): boolean {
  if (videoId === null || videoId === undefined) {
    return false;
  }

  if (canBeEmpty) {
    return videoId.length === 0 || (videoId.length === 11 && VIDEO_ID_REGEX.test(videoId));
  }

  return videoId.length === 11 && VIDEO_ID_REGEX.test(videoId);
}

/**
 * Check if an array of video IDs is valid
 * @param videoIds - Array of video IDs to validate
 */
export function isVideoIdsValid(videoIds: string[] | null | undefined): boolean {
  if (videoIds === null || videoIds === undefined || !Array.isArray(videoIds)) {
    return false;
  }

  return videoIds.every((videoId) => isVideoIdValid(videoId, false));
}

/**
 * Check if a video title is valid
 * @param title - The title to validate
 */
export function isTitleValid(title: string | null | undefined): boolean {
  return title !== null && title !== undefined && title.length > 0 && title.length <= 100;
}

/**
 * Check if a video description is valid
 * @param description - The description to validate
 */
export function isDescriptionValid(description: string | null | undefined): boolean {
  return (
    description !== null &&
    description !== undefined &&
    description.length > 0 &&
    description.length <= 5000
  );
}

/**
 * Check if a video MIME type is valid
 * @param mimeType - The MIME type to validate
 */
export function isVideoMimeTypeValid(
  mimeType: string | null | undefined
): mimeType is 'video/mp4' | 'video/webm' {
  return mimeType === 'video/mp4' || mimeType === 'video/webm';
}

/**
 * Check if a source file extension is valid
 * @param extension - The extension to validate
 */
export function isSourceFileExtensionValid(
  extension: string | null | undefined
): extension is '.mp4' | '.webm' | '.ts' {
  return extension === '.mp4' || extension === '.webm' || extension === '.ts';
}

// ============================================
// Format & Resolution Validators
// ============================================

/**
 * Valid video resolutions
 */
export type VideoResolution = '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | '240p';

/**
 * Check if a resolution is valid
 * @param resolution - The resolution to validate
 */
export function isResolutionValid(
  resolution: string | null | undefined
): resolution is VideoResolution {
  const validResolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
  return resolution !== null && resolution !== undefined && validResolutions.includes(resolution);
}

/**
 * Check if an adaptive format is valid (HLS)
 * @param format - The format to validate
 */
export function isAdaptiveFormatValid(format: string | null | undefined): format is 'm3u8' {
  return format === 'm3u8';
}

/**
 * Check if a progressive format is valid
 * @param format - The format to validate
 */
export function isProgressiveFormatValid(
  format: string | null | undefined
): format is 'mp4' | 'webm' | 'ogv' {
  return format === 'mp4' || format === 'webm' || format === 'ogv';
}

/**
 * Check if a format (adaptive or progressive) is valid
 * @param format - The format to validate
 */
export function isFormatValid(format: string | null | undefined): boolean {
  return isAdaptiveFormatValid(format) || isProgressiveFormatValid(format);
}

/**
 * Progressive filename regex
 */
const PROGRESSIVE_FILENAME_REGEX = /^(240p|360p|480p|720p|1080p|1440p|2160p)\.(mp4|webm|ogv)$/;

/**
 * Check if a progressive filename is valid
 * @param filename - The filename to validate
 */
export function isProgressiveFilenameValid(filename: string | null | undefined): boolean {
  return filename !== null && filename !== undefined && PROGRESSIVE_FILENAME_REGEX.test(filename);
}

/**
 * Manifest filename regex
 */
const MANIFEST_NAME_REGEX = /^manifest-(?:2160p|1440p|1080p|720p|480p|360p|240p|master).m3u8$/;

/**
 * Check if a manifest name is valid
 * @param manifestName - The manifest name to validate
 */
export function isManifestNameValid(manifestName: string | null | undefined): boolean {
  return (
    manifestName !== null &&
    manifestName !== undefined &&
    manifestName.length > 0 &&
    manifestName.length <= 100 &&
    MANIFEST_NAME_REGEX.test(manifestName)
  );
}

/**
 * Segment filename regex
 */
const SEGMENT_NAME_REGEX = /^segment-(?:2160p|1440p|1080p|720p|480p|360p|240p)-\d+\.ts$/;

/**
 * Check if a segment name is valid
 * @param segmentName - The segment name to validate
 */
export function isSegmentNameValid(segmentName: string | null | undefined): boolean {
  return (
    segmentName !== null &&
    segmentName !== undefined &&
    segmentName.length > 0 &&
    segmentName.length <= 100 &&
    SEGMENT_NAME_REGEX.test(segmentName)
  );
}

/**
 * Check if a stream MIME type is valid
 * @param mimeType - The MIME type to validate
 */
export function isStreamMimeTypeValid(
  mimeType: string | null | undefined
): mimeType is 'application/vnd.apple.mpegurl' | 'video/mp2t' {
  return mimeType === 'application/vnd.apple.mpegurl' || mimeType === 'video/mp2t';
}

/**
 * Check if a manifest type is valid
 * @param type - The type to validate
 */
export function isManifestTypeValid(type: string | null | undefined): type is 'static' | 'dynamic' {
  return type === 'static' || type === 'dynamic';
}

// ============================================
// Tag Validators
// ============================================

/**
 * Tag term regex (alphanumeric with spaces)
 */
const TAG_TERM_REGEX = /^[a-zA-Z0-9\s]*$/;

/**
 * Check if a tag term is valid
 * @param tagTerm - The tag term to validate
 * @param canBeEmpty - Whether an empty string is valid
 */
export function isTagTermValid(tagTerm: string | null | undefined, canBeEmpty = false): boolean {
  if (tagTerm === null || tagTerm === undefined) {
    return false;
  }

  if (canBeEmpty) {
    return tagTerm.length <= 30 && TAG_TERM_REGEX.test(tagTerm);
  }

  return tagTerm.length > 0 && tagTerm.length <= 30 && TAG_TERM_REGEX.test(tagTerm);
}

/**
 * Check if a comma-separated tags string is valid
 * @param tags - The tags string to validate
 */
export function isTagsValid(tags: string | null | undefined): boolean {
  if (tags === null || tags === undefined || tags.length === 0 || tags.length > 150) {
    return false;
  }

  const tagsArray = tags.split(',');

  if (tagsArray.length === 0 || tagsArray.length > 5) {
    return false;
  }

  return tagsArray.every((tag) => isTagTermValid(tag, false));
}

/**
 * Check if a tag limit is valid
 * @param tagLimit - The limit to validate
 */
export function isTagLimitValid(tagLimit: number | null | undefined): boolean {
  return tagLimit !== null && tagLimit !== undefined && tagLimit >= 0;
}

// ============================================
// Comment & Report Validators
// ============================================

/**
 * Check if a video comment is valid
 * @param comment - The comment to validate
 */
export function isVideoCommentValid(comment: string | null | undefined): boolean {
  return comment !== null && comment !== undefined && comment.length <= 500;
}

/**
 * Check if a comment ID is valid
 * @param commentId - The comment ID to validate
 */
export function isCommentIdValid(commentId: string | null | undefined): boolean {
  const regex = /^\d+$/;
  return (
    commentId !== null &&
    commentId !== undefined &&
    commentId.length <= 100 &&
    regex.test(commentId)
  );
}

/**
 * Check if a report ID is valid
 * @param reportId - The report ID to validate
 */
export function isReportIdValid(reportId: string | null | undefined): boolean {
  const regex = /^\d+$/;
  return (
    reportId !== null && reportId !== undefined && reportId.length <= 100 && regex.test(reportId)
  );
}

/**
 * Check if an archive ID is valid
 * @param archiveId - The archive ID to validate
 */
export function isArchiveIdValid(archiveId: string | null | undefined): boolean {
  const regex = /^\d+$/;
  return (
    archiveId !== null &&
    archiveId !== undefined &&
    archiveId.length <= 100 &&
    regex.test(archiveId)
  );
}

/**
 * Check if a report email is valid
 * @param reportEmail - The email to validate
 */
export function isReportEmailValid(reportEmail: string | null | undefined): boolean {
  return reportEmail !== null && reportEmail !== undefined && reportEmail.length <= 100;
}

/**
 * Check if a report type is valid
 * @param reportType - The type to validate
 */
export function isReportTypeValid(
  reportType: string | null | undefined
): reportType is 'complaint' | 'copyright' | 'other' {
  return reportType === 'complaint' || reportType === 'copyright' || reportType === 'other';
}

/**
 * Check if a report message is valid
 * @param reportMessage - The message to validate
 */
export function isReportMessageValid(reportMessage: string | null | undefined): boolean {
  return reportMessage !== null && reportMessage !== undefined && reportMessage.length <= 1000;
}

// ============================================
// Chat Validators
// ============================================

/**
 * Check if a chat message content is valid
 * @param content - The content to validate
 */
export function isChatMessageContentValid(content: string | null | undefined): boolean {
  return content !== null && content !== undefined && content.length > 0 && content.length <= 500;
}

/**
 * Check if a chat history limit is valid
 * @param limit - The limit to validate
 */
export function isChatHistoryLimitValid(limit: number | null | undefined): boolean {
  return limit !== null && limit !== undefined && limit >= 0 && limit <= 50;
}

// ============================================
// Authentication Validators
// ============================================

/**
 * Username regex (alphanumeric with special characters)
 */
const USERNAME_REGEX = /^[\w!@#$%^&*()\-_=+]+$/;

/**
 * Check if a username is valid
 * @param username - The username to validate
 */
export function isUsernameValid(username: string | null | undefined): boolean {
  return (
    username !== null &&
    username !== undefined &&
    username.length > 0 &&
    username.length <= 100 &&
    USERNAME_REGEX.test(username)
  );
}

/**
 * Password regex (alphanumeric with special characters)
 */
const PASSWORD_REGEX = /^[\w!@#$%^&*()\-_=+]+$/;

/**
 * Check if a password is valid
 * @param password - The password to validate
 */
export function isPasswordValid(password: string | null | undefined): boolean {
  return (
    password !== null &&
    password !== undefined &&
    password.length > 0 &&
    password.length <= 100 &&
    PASSWORD_REGEX.test(password)
  );
}

// ============================================
// Network Validators
// ============================================

/**
 * IPv4 address regex
 */
const IPV4_REGEX =
  /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

/**
 * Check if a value is a valid IPv4 address
 * @param value - The value to validate
 */
export function isIpv4Address(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && IPV4_REGEX.test(value);
}

/**
 * Check if a network address is valid
 * @param networkAddress - The address to validate
 */
export function isNetworkAddressValid(networkAddress: string | null | undefined): boolean {
  return (
    networkAddress !== null &&
    networkAddress !== undefined &&
    networkAddress.length > 0 &&
    networkAddress.length <= 100
  );
}

/**
 * Check if a public node address is valid
 * @param publicNodeAddress - The address to validate
 */
export function isPublicNodeAddressValid(publicNodeAddress: string | null | undefined): boolean {
  return (
    publicNodeAddress !== null &&
    publicNodeAddress !== undefined &&
    publicNodeAddress.length > 0 &&
    publicNodeAddress.length <= 100
  );
}

/**
 * Check if a port number is valid
 * @param port - The port to validate
 */
export function isPortValid(port: number | string | null | undefined): boolean {
  const portNum = typeof port === 'string' ? Number(port) : port;
  return (
    portNum !== null &&
    portNum !== undefined &&
    !Number.isNaN(portNum) &&
    portNum > 0 &&
    portNum <= 65535
  );
}

// ============================================
// Search & Sort Validators
// ============================================

/**
 * Check if a search term is valid
 * @param searchTerm - The search term to validate
 */
export function isSearchTermValid(searchTerm: string | null | undefined): boolean {
  return (
    searchTerm !== null &&
    searchTerm !== undefined &&
    searchTerm.length >= 0 &&
    searchTerm.length <= 100
  );
}

/**
 * Check if a sort term is valid
 * @param sortTerm - The sort term to validate
 */
export function isSortTermValid(
  sortTerm: string | null | undefined
): sortTerm is 'latest' | 'popular' | 'oldest' {
  return sortTerm === 'latest' || sortTerm === 'popular' || sortTerm === 'oldest';
}

/**
 * Check if a sort direction is valid
 * @param sort - The sort direction to validate
 */
export function isSortValid(sort: string | null | undefined): sort is 'ascending' | 'descending' {
  return sort === 'ascending' || sort === 'descending';
}

/**
 * Check if a comments type is valid
 * @param type - The type to validate
 */
export function isCommentsTypeValid(type: string | null | undefined): type is 'before' | 'after' {
  return type === 'before' || type === 'after';
}

/**
 * Check if a limit is valid
 * @param limit - The limit to validate
 */
export function isLimitValid(limit: number | string | null | undefined): boolean {
  const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
  return limitNum !== null && limitNum !== undefined && Number.isInteger(limitNum);
}

/**
 * Check if a timestamp is valid
 * @param timestamp - The timestamp to validate
 */
export function isTimestampValid(timestamp: number | string | null | undefined): boolean {
  const timestampNum = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  return (
    timestampNum !== null &&
    timestampNum !== undefined &&
    Number.isInteger(timestampNum) &&
    timestampNum >= 0 &&
    timestampNum <= 100000000000000
  );
}

// ============================================
// Boolean Validators
// ============================================

/**
 * Check if a value is a valid boolean
 * @param value - The value to validate
 */
export function isBooleanValid(value: unknown): value is boolean {
  return value !== null && value !== undefined && typeof value === 'boolean';
}

/**
 * Check if a string represents a valid boolean
 * @param value - The value to validate
 */
export function isBooleanStringValid(value: string | null | undefined): value is 'true' | 'false' {
  return value === 'true' || value === 'false';
}

// ============================================
// Job & Permission Validators
// ============================================

/**
 * Check if a job type is valid
 * @param jobType - The job type to validate
 */
export function isJobTypeValid(
  jobType: string | null | undefined
): jobType is 'importing' | 'publishing' | 'streaming' {
  return jobType === 'importing' || jobType === 'publishing' || jobType === 'streaming';
}

/**
 * Check if a video permission type is valid
 * @param permissionType - The permission type to validate
 */
export function isVideoPermissionTypeValid(
  permissionType: string | null | undefined
): permissionType is 'comments' | 'likes' | 'dislikes' | 'reports' | 'livechat' {
  return (
    permissionType === 'comments' ||
    permissionType === 'likes' ||
    permissionType === 'dislikes' ||
    permissionType === 'reports' ||
    permissionType === 'livechat'
  );
}

// ============================================
// Configuration Validators
// ============================================

/**
 * Database configuration interface
 */
interface DatabaseConfig {
  databaseDialect: 'sqlite' | 'postgres';
  postgresConfig?: {
    databaseName: string;
    username: string;
    password: string;
    host: string;
    port: number;
  };
}

/**
 * Check if a database configuration is valid
 * @param config - The configuration to validate
 */
export function isDatabaseConfigValid(config: unknown): config is DatabaseConfig {
  if (config === null || config === undefined || typeof config !== 'object') {
    return false;
  }

  const cfg = config as Record<string, unknown>;
  const validDialects = ['sqlite', 'postgres'];
  const databaseDialect = cfg['databaseDialect'];

  if (typeof databaseDialect !== 'string' || !validDialects.includes(databaseDialect)) {
    return false;
  }

  if (databaseDialect === 'postgres') {
    const postgresConfig = cfg['postgresConfig'];

    if (
      postgresConfig === null ||
      postgresConfig === undefined ||
      typeof postgresConfig !== 'object'
    ) {
      return false;
    }

    const pc = postgresConfig as Record<string, unknown>;
    const requiredStringFields = ['databaseName', 'username', 'password', 'host'];

    for (const field of requiredStringFields) {
      if (typeof pc[field] !== 'string') {
        return false;
      }
    }

    const port = pc['port'];
    if (typeof port !== 'number' || port <= 0 || port > 65535) {
      return false;
    }
  }

  return true;
}

/**
 * Storage configuration interface
 */
interface StorageConfig {
  storageMode: 'filesystem' | 's3provider';
  s3Config?: {
    bucketName: string;
    s3ProviderClientConfig: {
      forcePathStyle: boolean;
      [key: string]: unknown;
    };
  };
}

/**
 * Check if a storage configuration is valid
 * @param config - The configuration to validate
 */
export function isStorageConfigValid(config: unknown): config is StorageConfig {
  if (config === null || config === undefined || typeof config !== 'object') {
    return false;
  }

  const cfg = config as Record<string, unknown>;
  const validStorageModes = ['filesystem', 's3provider'];
  const storageMode = cfg['storageMode'];

  if (typeof storageMode !== 'string' || !validStorageModes.includes(storageMode)) {
    return false;
  }

  if (storageMode === 's3provider') {
    const s3Config = cfg['s3Config'];

    if (s3Config === null || s3Config === undefined || typeof s3Config !== 'object') {
      return false;
    }

    const s3 = s3Config as Record<string, unknown>;

    if (typeof s3['bucketName'] !== 'string') {
      return false;
    }

    const s3ProviderClientConfig = s3['s3ProviderClientConfig'];
    if (
      s3ProviderClientConfig === null ||
      s3ProviderClientConfig === undefined ||
      typeof s3ProviderClientConfig !== 'object'
    ) {
      return false;
    }

    const clientConfig = s3ProviderClientConfig as Record<string, unknown>;

    if (typeof clientConfig['forcePathStyle'] !== 'boolean') {
      return false;
    }
  }

  return true;
}

// ============================================
// Cloudflare Validators
// ============================================

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

    return response.data.success === true;
  } catch {
    return false;
  }
}

/**
 * Check if a Cloudflare Turnstile token is valid
 * @param token - The token to validate
 * @param canBeEmpty - Whether an empty token is valid
 */
export function isCloudflareTurnstileTokenValid(
  token: string | null | undefined,
  canBeEmpty = false
): boolean {
  if (token === null || token === undefined) {
    return false;
  }

  if (canBeEmpty) {
    return token.length >= 0;
  }

  return token.length > 0;
}

// ============================================
// Validator Collection (for backwards compatibility)
// ============================================

/**
 * Collection of all validators as an object
 */
export const validators = {
  isNodeNameValid,
  isNodeAboutValid,
  isNodeIdValid,
  isPublicNodeProtocolValid,
  isVideoIdValid,
  isVideoIdsValid,
  isTitleValid,
  isDescriptionValid,
  isVideoMimeTypeValid,
  isSourceFileExtensionValid,
  isResolutionValid,
  isAdaptiveFormatValid,
  isProgressiveFormatValid,
  isFormatValid,
  isProgressiveFilenameValid,
  isManifestNameValid,
  isSegmentNameValid,
  isStreamMimeTypeValid,
  isManifestTypeValid,
  isTagTermValid,
  isTagsValid,
  isTagLimitValid,
  isVideoCommentValid,
  isCommentIdValid,
  isReportIdValid,
  isArchiveIdValid,
  isReportEmailValid,
  isReportTypeValid,
  isReportMessageValid,
  isChatMessageContentValid,
  isChatHistoryLimitValid,
  isUsernameValid,
  isPasswordValid,
  isIpv4Address,
  isNetworkAddressValid,
  isPublicNodeAddressValid,
  isPortValid,
  isSearchTermValid,
  isSortTermValid,
  isSortValid,
  isCommentsTypeValid,
  isLimitValid,
  isTimestampValid,
  isBooleanValid,
  isBooleanStringValid,
  isJobTypeValid,
  isVideoPermissionTypeValid,
  isDatabaseConfigValid,
  isStorageConfigValid,
  isCloudflareCredentialsValid,
  isCloudflareTurnstileTokenValid,
} as const;
