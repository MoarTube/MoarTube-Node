import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { Logger, LogLevel, getLogger } from '@/utils/logger.js';

// Mock pino and pino-pretty
vi.mock('pino', () => ({
  default: vi.fn(),
  multistream: vi.fn(),
  destination: vi.fn(),
}));

vi.mock('pino-pretty', () => ({
  default: vi.fn(),
}));

describe('utils/logger.ts', () => {
  let mockPino: any;
  let mockPinoPretty: any;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock logger instance
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    };

    mockPino = vi.mocked(pino);
    mockPinoPretty = vi.mocked(pinoPretty);

    // Default mock implementations
    mockPinoPretty.mockReturnValue({ write: vi.fn() });
    mockPino.mockReturnValue(mockLogger);
    mockPino.multistream = vi.fn().mockReturnValue(mockLogger);
    mockPino.destination = vi.fn().mockReturnValue({ write: vi.fn() });
  });

  afterEach(() => {
    // Reset singleton instance between tests
    Logger.resetInstance();
  });

  describe('LogLevel enum', () => {
    it('should have correct log level values', () => {
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.ERROR).toBe('error');
    });
  });

  describe('Logger class', () => {
    describe('constructor', () => {
      it('should create logger with default config', () => {
        const logger = new Logger();

        expect(mockPinoPretty).toHaveBeenCalledWith({
          colorize: true,
          translateTime: 'HH:MM:ss Z',
        });
        expect(mockPino).toHaveBeenCalledWith({ write: expect.any(Function) });
      });

      it('should create logger with custom config', () => {
        const config = {
          level: LogLevel.DEBUG,
          timestamps: true,
          prefix: 'test',
        };

        const logger = new Logger(config);

        expect(mockPinoPretty).toHaveBeenCalledWith({
          colorize: true,
          translateTime: 'HH:MM:ss Z',
        });
        expect(mockPino).toHaveBeenCalledWith({ write: expect.any(Function) });
      });

      it('should create logger with file logging enabled', () => {
        const config = {
          logToFile: true,
          logFilePath: '/var/log/app.log',
        };

        const logger = new Logger(config);

        expect(mockPino.multistream).toHaveBeenCalledWith([
          { stream: { write: expect.any(Function) } },
          { stream: { write: expect.any(Function) } },
        ]);
      });

      it('should use existing logger when provided', () => {
        const existingLogger = { test: 'logger' };
        const logger = new Logger({}, existingLogger as any);

        expect(mockPino).not.toHaveBeenCalled();
        expect(logger['logger']).toBe(existingLogger);
      });
    });

    describe('getInstance', () => {
      it('should return singleton instance', () => {
        const logger1 = Logger.getInstance();
        const logger2 = Logger.getInstance();

        expect(logger1).toBe(logger2);
        expect(logger1).toBeInstanceOf(Logger);
      });

      it('should create instance with config on first call', () => {
        const config = { level: LogLevel.ERROR };
        const logger = Logger.getInstance(config);

        expect(logger).toBeInstanceOf(Logger);
      });
    });

    describe('resetInstance', () => {
      it('should reset the singleton instance', () => {
        const logger1 = Logger.getInstance();
        Logger.resetInstance();
        const logger2 = Logger.getInstance();

        expect(logger1).not.toBe(logger2);
      });
    });

    describe('logging methods', () => {
      let logger: Logger;

      beforeEach(() => {
        logger = new Logger();
      });

      it('should log debug message without context', () => {
        logger.debug('Test debug message');

        expect(mockLogger.debug).toHaveBeenCalledWith({}, 'Test debug message');
      });

      it('should log debug message with context', () => {
        const context = { userId: 123, action: 'login' };
        logger.debug('User logged in', context);

        expect(mockLogger.debug).toHaveBeenCalledWith(context, 'User logged in');
      });

      it('should log info message', () => {
        logger.info('Test info message');

        expect(mockLogger.info).toHaveBeenCalledWith({}, 'Test info message');
      });

      it('should log warn message', () => {
        logger.warn('Test warning message');

        expect(mockLogger.warn).toHaveBeenCalledWith({}, 'Test warning message');
      });

      it('should log error message without error object', () => {
        logger.error('Test error message');

        expect(mockLogger.error).toHaveBeenCalledWith({}, 'Test error message');
      });

      it('should log error message with Error object', () => {
        const error = new Error('Something went wrong');
        logger.error('Operation failed', error);

        expect(mockLogger.error).toHaveBeenCalledWith(
          {
            error: 'Something went wrong',
            stack: error.stack,
          },
          'Operation failed'
        );
      });

      it('should log error message with Error object that has no stack', () => {
        const error = new Error('Something went wrong');
        // Simulate an error without stack trace
        error.stack = undefined;
        logger.error('Operation failed', error);

        expect(mockLogger.error).toHaveBeenCalledWith(
          {
            error: 'Something went wrong',
            // stack should not be included when undefined
          },
          'Operation failed'
        );
      });

      it('should log error message with non-Error object', () => {
        const error = { code: 500, message: 'Internal server error' };
        logger.error('Request failed', error);

        expect(mockLogger.error).toHaveBeenCalledWith(
          {
            error: '{"code":500,"message":"Internal server error"}',
          },
          'Request failed'
        );
      });

      it('should handle null/undefined error in error logging', () => {
        logger.error('Test error', null);
        logger.error('Test error', undefined);

        expect(mockLogger.error).toHaveBeenCalledWith({}, 'Test error');
        expect(mockLogger.error).toHaveBeenCalledWith({}, 'Test error');
      });
    });

    describe('child method', () => {
      it('should create child logger with prefix', () => {
        const parentLogger = new Logger();
        const childLogger = parentLogger.child('api');

        expect(mockLogger.child).toHaveBeenCalledWith({ component: 'api' });
        expect(childLogger).toBeInstanceOf(Logger);
      });
    });
  });

  describe('getLogger function', () => {
    it('should return the default logger instance', () => {
      const logger = getLogger();

      expect(logger).toBeInstanceOf(Logger);
      expect(logger).toBe(Logger.getInstance());
    });
  });
});