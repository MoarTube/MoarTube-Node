import type { StorageConfig } from '@/types/config.js';

export interface TunnelSnapshot {
  mode: 'none' | 'quick' | 'named';
  status: 'stopped' | 'starting' | 'running' | 'error';
  name: string;
  publicUrl?: string | undefined;
  message?: string;
}

export interface TunnelSettings {
  isCloudflareTunnelEnabled?: boolean;
  isCloudflareCdnEnabled: boolean;
  cloudflareTunnelName?: string | undefined;
  cloudflareEmailAddress: string;
  cloudflareZoneId: string;
  cloudflareGlobalApiKey: string;
  publicNodeAddress: string;
  nodeListeningPort: string | number;
  storageConfig?: StorageConfig;
}

export interface TunnelConnector {
  ready: Promise<{ publicUrl?: string | undefined }>;
  stop(): Promise<void>;
}

export interface TunnelDriver {
  verify(): Promise<void>;
  launch(options: {
    mode: 'quick' | 'named';
    origin: string;
    token?: string | undefined;
    signal: AbortSignal;
    onExit: () => void;
  }): TunnelConnector;
}
