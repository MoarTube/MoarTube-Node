/**
 * Services Interfaces Tests
 *
 * Tests for service interface type definitions to ensure proper structure
 * and TypeScript type safety.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  GetVideosOptions,
  CreateVideoInput,
  UpdateVideoInput,
  VideoSource,
  SourcesFormatsAndResolutions,
  VideoWatchData,
  VideoPermissions,
  VideoData,
  AddToIndexOptions,
  AddToIndexResult,
  StreamConfig,
  CreateCommentInput,
  StorageMode,
  FileMetadata,
  VideoIndexData,
  RemoveFromIndexData,
  IndexerSubmitResult,
  WebSocketEventName,
  WebSocketMessage,
  ReportType,
  CreateVideoReportInput,
  CreateCommentReportInput,
  UpdateNodeSettingsInput,
  StorageConfigInput,
  JwtPayload,
  SignInInput,
  SignInResult,
  CreateChatMessageInput,
  CreateLinkInput,
  CreateWalletAddressInput,
} from '@/services/interfaces.js';

describe('Services Interfaces', () => {
  describe('GetVideosOptions', () => {
    it('should allow empty options', () => {
      const options: GetVideosOptions = {};
      expect(options).toBeDefined();
    });

    it('should allow sortBy values', () => {
      const options: GetVideosOptions = {
        sortBy: 'creation_timestamp',
        sortDirection: 'desc',
      };
      expect(options.sortBy).toBe('creation_timestamp');
    });

    it('should allow all optional properties', () => {
      const options: GetVideosOptions = {
        sortBy: 'views',
        sortDirection: 'asc',
        isPublished: true,
        isStreaming: false,
        isFinalized: true,
        search: 'test query',
        tagTerm: 'tutorial',
        timestamp: 1234567890,
        limit: 10,
      };
      expect(options.search).toBe('test query');
      expect(options.limit).toBe(10);
    });
  });

  describe('CreateVideoInput', () => {
    it('should require all mandatory fields', () => {
      const input: CreateVideoInput = {
        title: 'My Video',
        description: 'Video description',
        tags: 'tag1,tag2',
      };
      expect(input.title).toBe('My Video');
      expect(input.description).toBe('Video description');
      expect(input.tags).toBe('tag1,tag2');
    });
  });

  describe('UpdateVideoInput', () => {
    it('should allow all optional fields', () => {
      const input: UpdateVideoInput = {
        title: 'Updated Title',
        description: 'Updated description',
        tags: 'new,tags',
        isPublished: true,
        isHidden: false,
        isPassworded: true,
        password: 'secret',
        isCommentsEnabled: true,
        isLikesEnabled: true,
        isDislikesEnabled: false,
        isReportsEnabled: true,
        isLiveChatEnabled: false,
      };
      expect(input.title).toBe('Updated Title');
      expect(input.isPassworded).toBe(true);
    });

    it('should allow empty update', () => {
      const input: UpdateVideoInput = {};
      expect(Object.keys(input)).toHaveLength(0);
    });
  });

  describe('VideoSource', () => {
    it('should have src and type properties', () => {
      const source: VideoSource = {
        src: '/videos/abc123/adaptive/m3u8/master.m3u8',
        type: 'application/x-mpegURL',
      };
      expect(source.src).toBeDefined();
      expect(source.type).toBeDefined();
    });
  });

  describe('SourcesFormatsAndResolutions', () => {
    it('should have all format arrays', () => {
      const sources: SourcesFormatsAndResolutions = {
        m3u8: ['720p', '1080p'],
        mp4: ['720p'],
        webm: [],
        ogv: [],
      };
      expect(sources.m3u8).toHaveLength(2);
      expect(sources.mp4).toHaveLength(1);
      expect(sources.webm).toHaveLength(0);
      expect(sources.ogv).toHaveLength(0);
    });
  });

  describe('VideoWatchData', () => {
    it('should have all required properties', () => {
      const watchData: VideoWatchData = {
        videoId: 'abc123',
        title: 'Test Video',
        description: 'Description',
        views: 1000,
        likes: 50,
        dislikes: 5,
        isPublished: true,
        isPublishing: false,
        isLive: false,
        isStreaming: false,
        isStreamed: false,
        comments: 25,
        creationTimestamp: 1234567890000,
        isHlsAvailable: true,
        isMp4Available: true,
        isWebmAvailable: false,
        isOgvAvailable: false,
        adaptiveSources: [],
        progressiveSources: [],
        sourcesFormatsAndResolutions: {
          m3u8: ['1080p'],
          mp4: ['720p'],
          webm: [],
          ogv: [],
        },
      };
      expect(watchData.videoId).toBe('abc123');
      expect(watchData.views).toBe(1000);
    });
  });

  describe('VideoPermissions', () => {
    it('should have all boolean permission flags', () => {
      const permissions: VideoPermissions = {
        isCommentsEnabled: true,
        isLikesEnabled: true,
        isDislikesEnabled: true,
        isReportsEnabled: false,
        isLiveChatEnabled: true,
      };
      expect(permissions.isCommentsEnabled).toBe(true);
      expect(permissions.isReportsEnabled).toBe(false);
    });
  });

  describe('VideoData', () => {
    it('should have all required properties', () => {
      const videoData: VideoData = {
        videoId: 'abc123',
        title: 'Test Video',
        description: 'Description',
        tags: 'tag1,tag2',
        views: 500,
        isIndexed: true,
        isPublished: true,
        isLive: false,
        isStreaming: false,
        isFinalized: true,
        isStreamRecordedRemotely: false,
        timestamp: 1234567890000,
        videoAliasUrl: 'https://alias.example.com/v/abc123',
        outputs: { mp4: ['720p', '1080p'] },
        meta: { duration: 120 },
      };
      expect(videoData.videoId).toBe('abc123');
      expect(videoData.outputs).toHaveProperty('mp4');
    });
  });

  describe('AddToIndexOptions', () => {
    it('should have all required properties', () => {
      const options: AddToIndexOptions = {
        containsAdultContent: false,
        termsOfServiceAgreed: true,
        cloudflareTurnstileToken: 'token123',
      };
      expect(options.containsAdultContent).toBe(false);
      expect(options.termsOfServiceAgreed).toBe(true);
    });
  });

  describe('AddToIndexResult', () => {
    it('should have success and optional fields', () => {
      const successResult: AddToIndexResult = {
        success: true,
      };
      expect(successResult.success).toBe(true);

      const errorResult: AddToIndexResult = {
        success: false,
        message: 'Failed to index',
        isRequestTooLarge: true,
      };
      expect(errorResult.message).toBe('Failed to index');
    });
  });

  describe('StreamConfig', () => {
    it('should allow optional recording flags', () => {
      const config: StreamConfig = {
        isRecordedRemotely: true,
        isRecordedLocally: false,
      };
      expect(config.isRecordedRemotely).toBe(true);
    });

    it('should allow empty config', () => {
      const config: StreamConfig = {};
      expect(config).toBeDefined();
    });
  });

  describe('CreateCommentInput', () => {
    it('should have videoId and comment text', () => {
      const input: CreateCommentInput = {
        videoId: 'abc123',
        commentPlainText: 'Great video!',
      };
      expect(input.videoId).toBe('abc123');
      expect(input.commentPlainText).toBe('Great video!');
    });
  });

  describe('StorageMode', () => {
    it('should allow filesystem mode', () => {
      const mode: StorageMode = 'filesystem';
      expect(mode).toBe('filesystem');
    });

    it('should allow s3provider mode', () => {
      const mode: StorageMode = 's3provider';
      expect(mode).toBe('s3provider');
    });
  });

  describe('FileMetadata', () => {
    it('should have required and optional properties', () => {
      const metadata: FileMetadata = {
        key: 'videos/abc123/poster.jpg',
        size: 102400,
        lastModified: new Date(),
        contentType: 'image/jpeg',
      };
      expect(metadata.key).toBeDefined();
      expect(metadata.size).toBe(102400);
      expect(metadata.lastModified).toBeInstanceOf(Date);
    });

    it('should allow optional contentType', () => {
      const metadata: FileMetadata = {
        key: 'file.bin',
        size: 1024,
        lastModified: new Date(),
      };
      expect(metadata.contentType).toBeUndefined();
    });
  });

  describe('VideoIndexData', () => {
    it('should have all required properties for indexer submission', () => {
      const indexData: VideoIndexData = {
        videoId: 'abc123',
        nodeId: 'node456',
        nodeName: 'My Node',
        nodeAbout: 'About my node',
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: '443',
        title: 'Test Video',
        tags: 'tag1,tag2',
        views: 100,
        isLive: false,
        isStreaming: false,
        lengthSeconds: 300,
        creationTimestamp: 1234567890000,
        containsAdultContent: false,
        nodeIconPngBase64: 'base64data',
        nodeAvatarPngBase64: 'base64data',
        videoPreviewJpgBase64: 'base64data',
        moarTubeTokenProof: 'token',
        cloudflareTurnstileToken: 'turnstile',
      };
      expect(indexData.videoId).toBe('abc123');
      expect(indexData.lengthSeconds).toBe(300);
    });
  });

  describe('RemoveFromIndexData', () => {
    it('should have required properties', () => {
      const data: RemoveFromIndexData = {
        videoId: 'abc123',
        moarTubeTokenProof: 'token',
        cloudflareTurnstileToken: 'turnstile',
      };
      expect(data.videoId).toBe('abc123');
    });
  });

  describe('IndexerSubmitResult', () => {
    it('should have isError and optional fields', () => {
      const success: IndexerSubmitResult = {
        isError: false,
      };
      expect(success.isError).toBe(false);

      const error: IndexerSubmitResult = {
        isError: true,
        message: 'Submission failed',
        statusCode: 500,
      };
      expect(error.statusCode).toBe(500);
    });
  });

  describe('WebSocketEventName', () => {
    it('should allow valid event names', () => {
      const events: WebSocketEventName[] = [
        'echo',
        'video_data',
        'video_status',
        'video_publish',
        'chat_message',
        'chat_settings',
        'cloudflare_turnstile_information',
        'live_stream_stats',
        'node_name_update',
        'node_about_update',
        'node_settings_update',
      ];
      expect(events).toHaveLength(11);
    });
  });

  describe('WebSocketMessage', () => {
    it('should have eventName and optional data', () => {
      const message: WebSocketMessage = {
        eventName: 'echo',
        data: { message: 'Hello' },
        videoId: 'abc123',
      };
      expect(message.eventName).toBe('echo');
      expect(message.data).toEqual({ message: 'Hello' });
    });

    it('should allow minimal message', () => {
      const message: WebSocketMessage = {
        eventName: 'video_status',
      };
      expect(message.eventName).toBe('video_status');
    });
  });

  describe('ReportType', () => {
    it('should allow valid report types', () => {
      const types: ReportType[] = [
        'spam',
        'harassment',
        'violence',
        'copyright',
        'inappropriate',
        'misinformation',
        'other',
      ];
      expect(types).toHaveLength(7);
    });
  });

  describe('CreateVideoReportInput', () => {
    it('should have all required properties', () => {
      const report: CreateVideoReportInput = {
        videoId: 'abc123',
        videoTimestamp: 30,
        email: 'reporter@example.com',
        type: 'spam',
        message: 'This video is spam',
      };
      expect(report.type).toBe('spam');
      expect(report.videoTimestamp).toBe(30);
    });
  });

  describe('CreateCommentReportInput', () => {
    it('should have all required properties', () => {
      const report: CreateCommentReportInput = {
        videoId: 'abc123',
        commentId: 456,
        commentTimestamp: 1234567890000,
        email: 'reporter@example.com',
        type: 'harassment',
        message: 'This comment is harassment',
      };
      expect(report.commentId).toBe(456);
      expect(report.type).toBe('harassment');
    });
  });

  describe('UpdateNodeSettingsInput', () => {
    it('should allow all optional fields', () => {
      const settings: UpdateNodeSettingsInput = {
        nodeName: 'My Node',
        nodeAbout: 'About my node',
        nodeId: 'node123',
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: '443',
        isSecure: true,
        isReportsEnabled: true,
        isCloudflareTurnstileEnabled: true,
        cloudflareTurnstileSiteKey: 'sitekey',
        cloudflareTurnstileSecretKey: 'secretkey',
      };
      expect(settings.nodeName).toBe('My Node');
      expect(settings.isSecure).toBe(true);
    });

    it('should allow empty settings', () => {
      const settings: UpdateNodeSettingsInput = {};
      expect(settings).toBeDefined();
    });
  });

  describe('StorageConfigInput', () => {
    it('should have storageMode and optional S3 config', () => {
      const fsConfig: StorageConfigInput = {
        storageMode: 'filesystem',
      };
      expect(fsConfig.storageMode).toBe('filesystem');

      const s3Config: StorageConfigInput = {
        storageMode: 's3provider',
        s3BucketName: 'my-bucket',
        s3Endpoint: 'https://s3.example.com',
        s3AccessKeyId: 'access-key',
        s3SecretAccessKey: 'secret-key',
        s3Region: 'us-east-1',
      };
      expect(s3Config.s3BucketName).toBe('my-bucket');
    });
  });

  describe('JwtPayload', () => {
    it('should have username', () => {
      const payload: JwtPayload = {
        username: 'admin',
      };
      expect(payload.username).toBe('admin');
    });
  });

  describe('SignInInput', () => {
    it('should have all authentication fields', () => {
      const input: SignInInput = {
        username: 'admin',
        password: 'password123',
        moarTubeNodeHttpProtocol: 'https',
        moarTubeNodeIp: '192.168.1.1',
        moarTubeNodePort: 8080,
        rememberMe: true,
      };
      expect(input.username).toBe('admin');
      expect(input.rememberMe).toBe(true);
    });
  });

  describe('SignInResult', () => {
    it('should have isAuthenticated and optional token', () => {
      const success: SignInResult = {
        isAuthenticated: true,
        token: 'jwt.token.here',
      };
      expect(success.token).toBeDefined();

      const failure: SignInResult = {
        isAuthenticated: false,
      };
      expect(failure.token).toBeUndefined();
    });
  });

  describe('CreateChatMessageInput', () => {
    it('should have all required properties', () => {
      const input: CreateChatMessageInput = {
        videoId: 'abc123',
        username: 'user1',
        usernameColorHexCode: '#ff0000',
        chatMessage: 'Hello chat!',
      };
      expect(input.username).toBe('user1');
      expect(input.usernameColorHexCode).toBe('#ff0000');
    });
  });

  describe('CreateLinkInput', () => {
    it('should have url and svgGraphic', () => {
      const input: CreateLinkInput = {
        url: 'https://twitter.com/myprofile',
        svgGraphic: '<svg>...</svg>',
      };
      expect(input.url).toBe('https://twitter.com/myprofile');
      expect(input.svgGraphic).toBeDefined();
    });
  });

  describe('CreateWalletAddressInput', () => {
    it('should have all crypto wallet properties', () => {
      const input: CreateWalletAddressInput = {
        walletAddress: '0x1234567890abcdef',
        chain: 'Ethereum',
        chainId: '1',
        currency: 'ETH',
      };
      expect(input.walletAddress).toBe('0x1234567890abcdef');
      expect(input.chain).toBe('Ethereum');
    });
  });
});
