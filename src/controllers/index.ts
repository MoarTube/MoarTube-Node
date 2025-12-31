/**
 * Controllers Module
 *
 * Barrel export for all controller classes.
 */

// Base controller
export {
  BaseController,
} from '@controllers/base.js';

// Controllers that are imported from this barrel export
export { StatusController } from '@controllers/status.js';
export { AccountController } from '@controllers/account.js';
export { VideosController } from '@controllers/videos.js';
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
} from '@controllers/settings.js';
export {
  StreamsController,
  type StartStreamBody,
  type VideoIdParams,
  type SegmentRemoveParams,
  type SegmentRemoveBody,
  type ChatSettingsBody,
} from '@controllers/streams.js';
