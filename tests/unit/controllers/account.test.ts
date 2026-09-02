/**
 * Unit tests for AccountController
 *
 * Tests the authentication and account-related endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock the logger
vi.mock('@utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Create shared mock objects that can be modified in tests
const mockNodeSettings = {
  publicNodeProtocol: '',
  publicNodeAddress: '',
  publicNodePort: '',
};
const mockUpdateNodeSettings = vi.fn();

vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    nodeSettings: mockNodeSettings,
    updateNodeSettings: mockUpdateNodeSettings,
  })),
}));

import { AccountController } from '@controllers/account.js';

// Create mock request/reply
function createMockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    body: {},
    isAuthenticated: false,
    ...overrides,
  } as FastifyRequest;
}

function createMockReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

describe('AccountController', () => {
  let controller: AccountController;
  let mockAccountService: {
    signIn: ReturnType<typeof vi.fn>;
  };
  let mockReply: FastifyReply;

  beforeEach(() => {
    mockAccountService = {
      signIn: vi.fn(),
    };
    controller = new AccountController(mockAccountService as never);
    mockReply = createMockReply();
    
    // Reset mock node settings
    mockNodeSettings.publicNodeProtocol = '';
    mockNodeSettings.publicNodeAddress = '';
    mockNodeSettings.publicNodePort = '';
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an AccountController instance', () => {
      expect(controller).toBeInstanceOf(AccountController);
    });
  });

  describe('signIn', () => {
    it('should successfully sign in with valid credentials', async () => {
      mockAccountService.signIn.mockResolvedValue({
        isAuthenticated: true,
        token: 'jwt-token-123',
      });

      const mockRequest = createMockRequest({
        body: {
          username: 'admin',
          password: 'password123',
          moarTubeNodeHttpProtocol: 'https',
          moarTubeNodeIp: 'node.example.com',
          moarTubeNodePort: 443,
        },
      });

      await controller.signIn(mockRequest, mockReply);

      expect(mockAccountService.signIn).toHaveBeenCalledWith({
        username: 'admin',
        password: 'password123',
        moarTubeNodeHttpProtocol: 'https',
        moarTubeNodeIp: 'node.example.com',
        moarTubeNodePort: 443,
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        isAuthenticated: true,
        token: 'jwt-token-123',
      });
    });

    it('should return isAuthenticated: false for invalid credentials', async () => {
      mockAccountService.signIn.mockResolvedValue({
        isAuthenticated: false,
        token: undefined,
      });

      const mockRequest = createMockRequest({
        body: {
          username: 'admin',
          password: 'wrong-password',
          moarTubeNodeHttpProtocol: 'https',
          moarTubeNodeIp: 'node.example.com',
          moarTubeNodePort: 443,
        },
      });

      await controller.signIn(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        isAuthenticated: false,
        token: undefined,
      });
    });

    it('should update node settings on first login when settings are empty', async () => {
      mockAccountService.signIn.mockResolvedValue({
        isAuthenticated: true,
        token: 'jwt-token-123',
      });

      const mockRequest = createMockRequest({
        body: {
          username: 'admin',
          password: 'password123',
          moarTubeNodeHttpProtocol: 'https',
          moarTubeNodeIp: 'new-node.example.com',
          moarTubeNodePort: 8443,
        },
      });

      await controller.signIn(mockRequest, mockReply);

      expect(mockUpdateNodeSettings).toHaveBeenCalledWith({
        publicNodeProtocol: 'https',
        publicNodeAddress: 'new-node.example.com',
        publicNodePort: 8443,
      });
    });

    it('should NOT update node settings when settings already exist', async () => {
      // Set existing settings
      mockNodeSettings.publicNodeProtocol = 'https';
      mockNodeSettings.publicNodeAddress = 'existing.example.com';
      mockNodeSettings.publicNodePort = '443';

      mockAccountService.signIn.mockResolvedValue({
        isAuthenticated: true,
        token: 'jwt-token-123',
      });

      const mockRequest = createMockRequest({
        body: {
          username: 'admin',
          password: 'password123',
          moarTubeNodeHttpProtocol: 'http',
          moarTubeNodeIp: 'new-node.example.com',
          moarTubeNodePort: 8080,
        },
      });

      await controller.signIn(mockRequest, mockReply);

      expect(mockUpdateNodeSettings).not.toHaveBeenCalled();
    });

    it('should NOT update node settings when authentication fails', async () => {
      mockAccountService.signIn.mockResolvedValue({
        isAuthenticated: false,
        token: undefined,
      });

      const mockRequest = createMockRequest({
        body: {
          username: 'admin',
          password: 'wrong-password',
          moarTubeNodeHttpProtocol: 'https',
          moarTubeNodeIp: 'node.example.com',
          moarTubeNodePort: 443,
        },
      });

      await controller.signIn(mockRequest, mockReply);

      expect(mockUpdateNodeSettings).not.toHaveBeenCalled();
    });

    it('should return 500 error when signIn throws', async () => {
      mockAccountService.signIn.mockRejectedValue(new Error('Service error'));

      const mockRequest = createMockRequest({
        body: {
          username: 'admin',
          password: 'password123',
          moarTubeNodeHttpProtocol: 'https',
          moarTubeNodeIp: 'node.example.com',
          moarTubeNodePort: 443,
        },
      });

      await controller.signIn(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('signOut', () => {
    it('should return success response', async () => {
      const mockRequest = createMockRequest({
        isAuthenticated: true,
      });

      await controller.signOut(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        wasAuthenticated: true,
      });
    });
  });

  describe('authenticated', () => {
    it('should return isAuthenticated: true when authenticated', async () => {
      const mockRequest = createMockRequest({
        isAuthenticated: true,
      });

      await controller.authenticated(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        isAuthenticated: true,
      });
    });

    it('should return isAuthenticated: false when not authenticated', async () => {
      const mockRequest = createMockRequest({
        isAuthenticated: false,
      });

      await controller.authenticated(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        isAuthenticated: false,
      });
    });

    it('should return 500 error when authenticated check throws', async () => {
      const mockRequest = createMockRequest({
        isAuthenticated: true,
      });

      // Make status throw an error to trigger the catch block
      (mockReply.status as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Reply error');
      });

      await controller.authenticated(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('signOut error handling', () => {
    it('should return 500 error when signOut throws', async () => {
      const mockRequest = createMockRequest();

      // Make status throw an error to trigger the catch block
      (mockReply.status as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Reply error');
      });

      await controller.signOut(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
