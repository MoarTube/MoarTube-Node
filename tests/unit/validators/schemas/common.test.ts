import { describe, it, expect } from 'vitest';
import {
  videoIdSchema,
  videoIdSchemaOptional,
  commentIdSchema,
  idSchema,
  timestampSchema,
  booleanSchema,
  optionalBooleanSchema,
  filenameSchema,
  titleSchema,
  descriptionSchema,
  tagsSchema,
  formatSchema,
  resolutionSchema,
  manifestTypeSchema,
  searchTermSchemaOptional,
  sortTermSchema,
  tagTermSchemaOptional,
  tagLimitSchema,
  sortDirectionSchema,
  usernameSchema,
  passwordSchema,
  protocolSchema,
  addressSchema,
  portSchema,
  reportEmailSchema,
  reportTypeSchema,
  reportMessageSchema,
  cloudflareTurnstileTokenSchema,
} from '@/validators/schemas/common.js';

describe('validators/schemas/common.ts', () => {
  describe('videoIdSchema', () => {
    it('should validate valid video IDs', () => {
      expect(() => videoIdSchema.parse('dQw4w9WgXcQ')).not.toThrow();
      expect(() => videoIdSchema.parse('abc123def45')).not.toThrow();
      expect(() => videoIdSchema.parse('ABC_123-456')).not.toThrow();
    });

    it('should reject invalid video IDs', () => {
      expect(() => videoIdSchema.parse('')).toThrow('Invalid video ID format');
      expect(() => videoIdSchema.parse('short')).toThrow('Invalid video ID format');
      expect(() => videoIdSchema.parse('too_long_video_id_here')).toThrow('Invalid video ID format');
      expect(() => videoIdSchema.parse('invalid@chars')).toThrow('Invalid video ID format');
    });
  });

  describe('videoIdSchemaOptional', () => {
    it('should validate valid video IDs', () => {
      expect(videoIdSchemaOptional.parse('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should accept undefined', () => {
      expect(videoIdSchemaOptional.parse(undefined)).toBeUndefined();
    });

    it('should reject invalid video IDs', () => {
      expect(() => videoIdSchemaOptional.parse('invalid')).toThrow('Invalid video ID format');
    });
  });

  describe('commentIdSchema', () => {
    it('should validate positive integers', () => {
      expect(commentIdSchema.parse(1)).toBe(1);
      expect(commentIdSchema.parse('123')).toBe(123);
      expect(commentIdSchema.parse(999999)).toBe(999999);
    });

    it('should reject non-positive integers', () => {
      expect(() => commentIdSchema.parse(0)).toThrow();
      expect(() => commentIdSchema.parse(-1)).toThrow();
      expect(() => commentIdSchema.parse('0')).toThrow();
      expect(() => commentIdSchema.parse(1.5)).toThrow();
    });
  });

  describe('idSchema', () => {
    it('should validate positive integers', () => {
      expect(idSchema.parse(1)).toBe(1);
      expect(idSchema.parse('456')).toBe(456);
    });

    it('should reject non-positive integers', () => {
      expect(() => idSchema.parse(0)).toThrow();
      expect(() => idSchema.parse(-5)).toThrow();
    });
  });

  describe('timestampSchema', () => {
    it('should validate valid timestamps', () => {
      expect(timestampSchema.parse(1640995200000)).toBe(1640995200000); // 2022-01-01
      expect(timestampSchema.parse('1640995200000')).toBe(1640995200000);
      expect(timestampSchema.parse(0)).toBe(0);
    });

    it('should reject invalid timestamps', () => {
      expect(() => timestampSchema.parse(-1)).toThrow();
      expect(() => timestampSchema.parse(32503680000001)).toThrow(); // Year 3001
    });
  });

  describe('booleanSchema', () => {
    it('should transform boolean values', () => {
      expect(booleanSchema.parse(true)).toBe(true);
      expect(booleanSchema.parse(false)).toBe(false);
    });

    it('should transform string values', () => {
      expect(booleanSchema.parse('true')).toBe(true);
      expect(booleanSchema.parse('false')).toBe(false);
    });

    it('should reject invalid values', () => {
      expect(() => booleanSchema.parse('yes')).toThrow();
      expect(() => booleanSchema.parse(1)).toThrow();
    });
  });

  describe('optionalBooleanSchema', () => {
    it('should accept boolean values', () => {
      expect(optionalBooleanSchema.parse(true)).toBe(true);
      expect(optionalBooleanSchema.parse('false')).toBe(false);
    });

    it('should accept undefined', () => {
      expect(optionalBooleanSchema.parse(undefined)).toBeUndefined();
    });
  });

  describe('filenameSchema', () => {
    it('should validate valid filenames', () => {
      expect(filenameSchema.parse('video.mp4')).toBe('video.mp4');
      expect(filenameSchema.parse('my_video_file_with_long_name.webm')).toBe('my_video_file_with_long_name.webm');
    });

    it('should reject empty strings', () => {
      expect(() => filenameSchema.parse('')).toThrow();
    });

    it('should reject overly long filenames', () => {
      const longName = 'a'.repeat(256);
      expect(() => filenameSchema.parse(longName)).toThrow();
    });
  });

  describe('titleSchema', () => {
    it('should validate valid titles', () => {
      expect(titleSchema.parse('My Video Title')).toBe('My Video Title');
      expect(titleSchema.parse('A')).toBe('A');
      expect(titleSchema.parse('Title with 200 chars' + 'x'.repeat(178))).toBe('Title with 200 chars' + 'x'.repeat(178));
    });

    it('should reject empty titles', () => {
      expect(() => titleSchema.parse('')).toThrow('Title is required');
    });

    it('should reject overly long titles', () => {
      const longTitle = 'x'.repeat(201);
      expect(() => titleSchema.parse(longTitle)).toThrow('Title must be less than 200 characters');
    });
  });

  describe('descriptionSchema', () => {
    it('should validate valid descriptions', () => {
      expect(descriptionSchema.parse('Video description')).toBe('Video description');
      expect(descriptionSchema.parse('')).toBe('');
      expect(descriptionSchema.parse(undefined)).toBe('');
    });

    it('should reject overly long descriptions', () => {
      const longDesc = 'x'.repeat(5001);
      expect(() => descriptionSchema.parse(longDesc)).toThrow('Description must be less than 5000 characters');
    });
  });

  describe('tagsSchema', () => {
    it('should validate valid tags', () => {
      expect(tagsSchema.parse('tag1,tag2,tag3')).toBe('tag1,tag2,tag3');
      expect(tagsSchema.parse('')).toBe('');
      expect(tagsSchema.parse(undefined)).toBe('');
    });

    it('should reject overly long tags', () => {
      const longTags = 'x'.repeat(501);
      expect(() => tagsSchema.parse(longTags)).toThrow('Tags must be less than 500 characters');
    });
  });

  describe('formatSchema', () => {
    it('should validate valid formats', () => {
      expect(formatSchema.parse('m3u8')).toBe('m3u8');
      expect(formatSchema.parse('mp4')).toBe('mp4');
      expect(formatSchema.parse('webm')).toBe('webm');
      expect(formatSchema.parse('ogv')).toBe('ogv');
    });

    it('should reject invalid formats', () => {
      expect(() => formatSchema.parse('avi')).toThrow();
      expect(() => formatSchema.parse('mov')).toThrow();
    });
  });

  describe('resolutionSchema', () => {
    it('should validate valid resolutions', () => {
      const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
      resolutions.forEach(res => {
        expect(resolutionSchema.parse(res)).toBe(res);
      });
    });

    it('should reject invalid resolutions', () => {
      expect(() => resolutionSchema.parse('1080')).toThrow();
      expect(() => resolutionSchema.parse('4k')).toThrow();
    });
  });

  describe('manifestTypeSchema', () => {
    it('should validate valid manifest types', () => {
      expect(manifestTypeSchema.parse('static')).toBe('static');
      expect(manifestTypeSchema.parse('dynamic')).toBe('dynamic');
    });

    it('should reject invalid manifest types', () => {
      expect(() => manifestTypeSchema.parse('live')).toThrow();
    });
  });

  describe('searchTermSchemaOptional', () => {
    it('should validate valid search terms', () => {
      expect(searchTermSchemaOptional.parse('search query')).toBe('search query');
      expect(searchTermSchemaOptional.parse('')).toBe('');
      expect(searchTermSchemaOptional.parse(undefined)).toBeUndefined();
    });

    it('should reject overly long search terms', () => {
      const longSearch = 'x'.repeat(101);
      expect(() => searchTermSchemaOptional.parse(longSearch)).toThrow();
    });
  });

  describe('sortTermSchema', () => {
    it('should validate valid sort terms', () => {
      expect(sortTermSchema.parse('latest')).toBe('latest');
      expect(sortTermSchema.parse('popular')).toBe('popular');
      expect(sortTermSchema.parse('oldest')).toBe('oldest');
      expect(sortTermSchema.parse(undefined)).toBe('latest');
    });

    it('should reject invalid sort terms', () => {
      expect(() => sortTermSchema.parse('alphabetical')).toThrow();
    });
  });

  describe('tagTermSchemaOptional', () => {
    it('should validate valid tag terms', () => {
      expect(tagTermSchemaOptional.parse('gaming')).toBe('gaming');
      expect(tagTermSchemaOptional.parse(undefined)).toBeUndefined();
    });

    it('should reject overly long tag terms', () => {
      const longTag = 'x'.repeat(101);
      expect(() => tagTermSchemaOptional.parse(longTag)).toThrow();
    });
  });

  describe('tagLimitSchema', () => {
    it('should validate valid tag limits', () => {
      expect(tagLimitSchema.parse(0)).toBe(0);
      expect(tagLimitSchema.parse('10')).toBe(10);
      expect(tagLimitSchema.parse(100)).toBe(100);
    });

    it('should reject negative numbers', () => {
      expect(() => tagLimitSchema.parse(-1)).toThrow();
    });
  });

  describe('sortDirectionSchema', () => {
    it('should validate valid sort directions', () => {
      expect(sortDirectionSchema.parse('ascending')).toBe('ascending');
      expect(sortDirectionSchema.parse('descending')).toBe('descending');
    });

    it('should reject invalid sort directions', () => {
      expect(() => sortDirectionSchema.parse('asc')).toThrow();
    });
  });

  describe('usernameSchema', () => {
    it('should validate valid usernames', () => {
      expect(usernameSchema.parse('user123')).toBe('user123');
      expect(usernameSchema.parse('test_user')).toBe('test_user');
    });

    it('should reject empty usernames', () => {
      expect(() => usernameSchema.parse('')).toThrow('Username is required');
    });

    it('should reject overly long usernames', () => {
      const longUsername = 'x'.repeat(101);
      expect(() => usernameSchema.parse(longUsername)).toThrow('Username must be less than 100 characters');
    });
  });

  describe('passwordSchema', () => {
    it('should validate valid passwords', () => {
      expect(passwordSchema.parse('password123')).toBe('password123');
      expect(passwordSchema.parse('x'.repeat(256))).toBe('x'.repeat(256));
    });

    it('should reject empty passwords', () => {
      expect(() => passwordSchema.parse('')).toThrow('Password is required');
    });

    it('should reject overly long passwords', () => {
      const longPassword = 'x'.repeat(257);
      expect(() => passwordSchema.parse(longPassword)).toThrow('Password must be less than 256 characters');
    });
  });

  describe('protocolSchema', () => {
    it('should validate valid protocols', () => {
      expect(protocolSchema.parse('http')).toBe('http');
      expect(protocolSchema.parse('https')).toBe('https');
    });

    it('should reject invalid protocols', () => {
      expect(() => protocolSchema.parse('ftp')).toThrow();
    });
  });

  describe('addressSchema', () => {
    it('should validate valid addresses', () => {
      expect(addressSchema.parse('localhost')).toBe('localhost');
      expect(addressSchema.parse('192.168.1.1')).toBe('192.168.1.1');
      expect(addressSchema.parse('example.com')).toBe('example.com');
    });

    it('should reject empty addresses', () => {
      expect(() => addressSchema.parse('')).toThrow('Address is required');
    });

    it('should reject overly long addresses', () => {
      const longAddress = 'x'.repeat(254);
      expect(() => addressSchema.parse(longAddress)).toThrow('Address must be less than 253 characters');
    });
  });

  describe('portSchema', () => {
    it('should validate valid ports', () => {
      expect(portSchema.parse(80)).toBe(80);
      expect(portSchema.parse('443')).toBe(443);
      expect(portSchema.parse(1)).toBe(1);
      expect(portSchema.parse(65535)).toBe(65535);
    });

    it('should reject invalid ports', () => {
      expect(() => portSchema.parse(0)).toThrow();
      expect(() => portSchema.parse(65536)).toThrow();
      expect(() => portSchema.parse(-1)).toThrow();
    });
  });

  describe('reportEmailSchema', () => {
    it('should validate valid emails', () => {
      expect(reportEmailSchema.parse('user@example.com')).toBe('user@example.com');
      expect(reportEmailSchema.parse('test.email+tag@domain.co.uk')).toBe('test.email+tag@domain.co.uk');
    });

    it('should reject invalid emails', () => {
      expect(() => reportEmailSchema.parse('invalid-email')).toThrow('Invalid email format');
      expect(() => reportEmailSchema.parse('@example.com')).toThrow('Invalid email format');
    });

    it('should reject overly long emails', () => {
      const longEmail = 'x'.repeat(310) + '@example.com';
      expect(() => reportEmailSchema.parse(longEmail)).toThrow('Email must be less than 320 characters');
    });
  });

  describe('reportTypeSchema', () => {
    it('should validate valid report types', () => {
      const types = ['spam', 'harassment', 'copyright', 'inappropriate', 'violence', 'misinformation', 'other'];
      types.forEach(type => {
        expect(reportTypeSchema.parse(type)).toBe(type);
      });
    });

    it('should reject invalid report types', () => {
      expect(() => reportTypeSchema.parse('invalid')).toThrow();
    });
  });

  describe('reportMessageSchema', () => {
    it('should validate valid messages', () => {
      expect(reportMessageSchema.parse('This is a report message')).toBe('This is a report message');
      expect(reportMessageSchema.parse('')).toBe('');
      expect(reportMessageSchema.parse(undefined)).toBe('');
    });

    it('should reject overly long messages', () => {
      const longMessage = 'x'.repeat(2001);
      expect(() => reportMessageSchema.parse(longMessage)).toThrow('Message must be less than 2000 characters');
    });
  });

  describe('cloudflareTurnstileTokenSchema', () => {
    it('should validate any string as token', () => {
      expect(cloudflareTurnstileTokenSchema.parse('')).toBe('');
      expect(cloudflareTurnstileTokenSchema.parse('token123')).toBe('token123');
      expect(cloudflareTurnstileTokenSchema.parse('long_token_string_here')).toBe('long_token_string_here');
    });
  });
});