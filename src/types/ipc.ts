/**
 * IPC (Inter-Process Communication) type definitions
 * Complete type definitions for cluster communication in MoarTube-Node
 */

import type {
  WebSocketMessage,
  LiveStreamWatchingCounts,
  LiveStreamWatchingCountsTracker,
} from './websocket';

// ============================================
// IPC Command Types (Worker -> Master)
// ============================================

/**
 * Commands sent from worker processes to master
 */
export type IPCCommandToMaster =
  | 'get_jwt_secret'
  | 'update_node_name'
  | 'websocket_broadcast'
  | 'websocket_broadcast_chat'
  | 'database_write_job'
  | 'live_stream_worker_stats_response'
  | 'restart_server'
  | 'restart_database';

/**
 * Commands sent from master process to workers
 */
export type IPCCommandToWorker =
  | 'get_jwt_secret_response'
  | 'update_node_name_response'
  | 'websocket_broadcast_response'
  | 'websocket_broadcast_chat_response'
  | 'database_write_job_result'
  | 'live_stream_worker_stats_request'
  | 'live_stream_worker_stats_update'
  | 'restart_server_response'
  | 'restart_database_response';

/**
 * All IPC command types
 */
export type IPCCommand = IPCCommandToMaster | IPCCommandToWorker;

// ============================================
// Base IPC Message
// ============================================

/**
 * Base IPC message structure
 */
export interface IPCMessageBase {
  cmd: IPCCommand;
}

// ============================================
// Worker -> Master Messages
// ============================================

/**
 * Request JWT secret from master
 */
export interface GetJwtSecretMessage extends IPCMessageBase {
  cmd: 'get_jwt_secret';
}

/**
 * Request node name update broadcast
 */
export interface UpdateNodeNameMessage extends IPCMessageBase {
  cmd: 'update_node_name';
  nodeName: string;
}

/**
 * Request WebSocket broadcast to all clients
 */
export interface WebSocketBroadcastMessage extends IPCMessageBase {
  cmd: 'websocket_broadcast';
  message: WebSocketMessage;
}

/**
 * Request WebSocket broadcast to chat clients
 */
export interface WebSocketBroadcastChatMessage extends IPCMessageBase {
  cmd: 'websocket_broadcast_chat';
  message: WebSocketMessage & { videoId: string };
}

/**
 * Submit database write job to master (for mutex protection)
 */
export interface DatabaseWriteJobMessage extends IPCMessageBase {
  cmd: 'database_write_job';
  query: string;
  parameters: unknown[];
  databaseWriteJobId: string;
}

/**
 * Worker's live stream watching counts response
 */
export interface LiveStreamWorkerStatsResponseMessage extends IPCMessageBase {
  cmd: 'live_stream_worker_stats_response';
  workerId: number;
  liveStreamWatchingCounts: LiveStreamWatchingCounts;
}

/**
 * Request server restart
 */
export interface RestartServerMessage extends IPCMessageBase {
  cmd: 'restart_server';
}

/**
 * Request database restart with new dialect
 */
export interface RestartDatabaseMessage extends IPCMessageBase {
  cmd: 'restart_database';
  databaseDialect: 'sqlite' | 'postgres';
}

// ============================================
// Master -> Worker Messages
// ============================================

/**
 * JWT secret response from master
 */
export interface GetJwtSecretResponseMessage extends IPCMessageBase {
  cmd: 'get_jwt_secret_response';
  jwtSecret: string;
}

/**
 * Node name update broadcast response
 */
export interface UpdateNodeNameResponseMessage extends IPCMessageBase {
  cmd: 'update_node_name_response';
  nodeName: string;
}

/**
 * WebSocket broadcast response (forward to clients)
 */
export interface WebSocketBroadcastResponseMessage extends IPCMessageBase {
  cmd: 'websocket_broadcast_response';
  message: WebSocketMessage;
}

/**
 * Chat WebSocket broadcast response
 */
export interface WebSocketBroadcastChatResponseMessage extends IPCMessageBase {
  cmd: 'websocket_broadcast_chat_response';
  message: WebSocketMessage & { videoId: string };
}

/**
 * Database write job result
 */
export interface DatabaseWriteJobResultMessage extends IPCMessageBase {
  cmd: 'database_write_job_result';
  databaseWriteJobId: string;
  error?: Error | string;
}

/**
 * Request live stream stats from worker
 */
export interface LiveStreamWorkerStatsRequestMessage extends IPCMessageBase {
  cmd: 'live_stream_worker_stats_request';
}

/**
 * Aggregated live stream watching counts update
 */
export interface LiveStreamWorkerStatsUpdateMessage extends IPCMessageBase {
  cmd: 'live_stream_worker_stats_update';
  liveStreamWatchingCountsTracker: LiveStreamWatchingCountsTracker;
}

/**
 * Server restart response
 */
export interface RestartServerResponseMessage extends IPCMessageBase {
  cmd: 'restart_server_response';
}

/**
 * Database restart response
 */
export interface RestartDatabaseResponseMessage extends IPCMessageBase {
  cmd: 'restart_database_response';
}

// ============================================
// Union Types
// ============================================

/**
 * All messages from worker to master
 */
export type IPCMessageToMaster =
  | GetJwtSecretMessage
  | UpdateNodeNameMessage
  | WebSocketBroadcastMessage
  | WebSocketBroadcastChatMessage
  | DatabaseWriteJobMessage
  | LiveStreamWorkerStatsResponseMessage
  | RestartServerMessage
  | RestartDatabaseMessage;

/**
 * All messages from master to worker
 */
export type IPCMessageToWorker =
  | GetJwtSecretResponseMessage
  | UpdateNodeNameResponseMessage
  | WebSocketBroadcastResponseMessage
  | WebSocketBroadcastChatResponseMessage
  | DatabaseWriteJobResultMessage
  | LiveStreamWorkerStatsRequestMessage
  | LiveStreamWorkerStatsUpdateMessage
  | RestartServerResponseMessage
  | RestartDatabaseResponseMessage;

/**
 * Any IPC message
 */
export type IPCMessage = IPCMessageToMaster | IPCMessageToWorker;

// ============================================
// Pending Job Types
// ============================================

/**
 * Pending database write job tracker
 */
export interface PendingDatabaseWriteJob {
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Map of pending database write jobs
 */
export interface PendingDatabaseWriteJobs {
  [jobId: string]: PendingDatabaseWriteJob;
}
