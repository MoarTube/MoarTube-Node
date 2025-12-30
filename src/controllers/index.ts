/**
 * Controllers Module
 *
 * Barrel export for all controller classes.
 */

// Base controller
export {
  BaseController,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type PaginatedResponse,
} from './base.js';

// Controllers that are imported from this barrel export
export { StatusController } from './status.js';
export { AccountController } from './account.js';
export { VideosController } from './videos.js';
export {
  SettingsController,
  type PersonalizeNodeNameBody,
  type PersonalizeNodeAboutBody,
  type PersonalizeNodeIdBody,
  type AccountBody,
  type NetworkInternalBody,
  type NetworkExternalBody,
  type CloudflareConfigureBody,
  type CloudflareTurnstileConfigureBody,
  type ToggleBooleanBody,
  type DatabaseConfigBody,
  type StorageConfigBody,
} from './settings.js';
export {
  StreamsController,
  type StartStreamBody,
  type VideoIdParams,
  type SegmentRemoveParams,
  type SegmentRemoveBody,
  type ChatSettingsBody,
} from './streams.js';
