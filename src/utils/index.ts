/**
 * Utility Functions & Helpers
 *
 * Centralized exports for all utility modules.
 */

// Logger
export { Logger, LogLevel, type ILogger, type LoggerConfig, createLogger } from './logger.js';

// Validators
export {
  isVideoIdValid,
  isVideoIdsValid,
  isTitleValid,
  isDescriptionValid,
  isTagTermValid,
  isTagsValid,
  isTagLimitValid,
  isUsernameValid,
  isPasswordValid,
  isSearchTermValid,
  isNetworkAddressValid,
  isPortValid,
  isPublicNodeProtocolValid,
  isPublicNodeAddressValid,
  isNodeNameValid,
  isNodeAboutValid,
  isNodeIdValid,
  isVideoCommentValid,
  isChatMessageContentValid,
  isChatHistoryLimitValid,
  isReportEmailValid,
  isReportTypeValid,
  isReportMessageValid,
  isBooleanValid,
  isBooleanStringValid,
  isSortTermValid,
  isSortValid,
  isCommentsTypeValid,
  isTimestampValid,
  isCommentIdValid,
  isReportIdValid,
  isArchiveIdValid,
  isJobTypeValid,
  isStorageConfigValid,
  isDatabaseConfigValid,
  isCloudflareCredentialsValid,
  isIpv4Address,
  isLimitValid,
  isResolutionValid,
  isAdaptiveFormatValid,
  isProgressiveFormatValid,
  isFormatValid,
  isVideoMimeTypeValid,
  isSourceFileExtensionValid,
  isProgressiveFilenameValid,
  isManifestNameValid,
  isSegmentNameValid,
  isStreamMimeTypeValid,
  isManifestTypeValid,
  isVideoPermissionTypeValid,
  isCloudflareTurnstileTokenValid,
  validators,
  type VideoResolution,
} from './validators.js';

// Filesystem
export {
  ensureDirectory,
  ensureDirectorySync,
  deleteDirectory,
  deleteDirectorySync,
  deleteFile,
  deleteFileSync,
  pathExists,
  pathExistsSync,
  isDirectory,
  isDirectorySync,
  isFile,
  isFileSync,
  readJsonFile,
  readJsonFileSync,
  writeJsonFile,
  writeJsonFileSync,
  readFile,
  readFileSync,
  readFileBuffer,
  readFileBufferSync,
  writeFile,
  writeFileSync,
  readFileAsBase64,
  readFileAsBase64Sync,
  listDirectory,
  listDirectorySync,
  getFileStats,
  getFileStatsSync,
  normalizePath,
  joinPath,
  getDirname,
  getBasename,
  getExtname,
  FilesystemError,
} from './filesystem.js';

// Cloudflare Client
export {
  CloudflareClient,
  CloudflareError,
  createCloudflareClient,
  type CloudflareClientConfig,
  type CloudflareCredentials,
  type CloudflareApiResponse,
  type DnsRecord,
} from './cloudflare-client.js';

// Indexer Client
export {
  IndexerClient,
  IndexerError,
  createIndexerClient,
  type IndexerClientConfig,
  type IndexerApiResponse,
  type NodeIdentification,
  type VideoIndexData,
} from './indexer-client.js';

// S3 Storage Client
export {
  S3StorageClient,
  S3StorageError,
  createS3StorageClient,
  type S3StorageClientConfig,
  type S3ObjectInfo,
  type S3ListResult,
  type S3UploadOptions,
} from './s3-client.js';

// Helpers
export {
  // JWT
  verifyJwtToken,
  generateJwtToken,
  type JwtVerifyResult,
  // String utilities
  sanitizeTagsSpaces,
  generateRandomString,
  generateVideoIdCandidate,
  generateSecureRandomString,
  sha256Hash,
  hashPassword,
  verifyPassword,
  escapeHtml,
  unescapeHtml,
  truncate,
  capitalize,
  toTitleCase,
  // Time/Duration
  formatDuration,
  parseDuration,
  getCurrentTimestamp,
  getCurrentUnixTimestamp,
  sleep,
  // Formatting
  formatBytes,
  // Array/Object utilities
  chunkArray,
  deepClone,
  isPlainObject,
  deepMerge,
  // Function utilities
  debounce,
  throttle,
  // Environment
  getHostsFilePath,
  isDockerEnvironment,
  // URL utilities
  buildUrl,
  type ParsedUrl,
} from './helpers.js';
