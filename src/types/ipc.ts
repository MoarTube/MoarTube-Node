/**
 * IPC (Inter-Process Communication) type definitions
 * These types will be fully implemented in Phase 1
 */

export type IPCCommand =
  | 'get_jwt_secret'
  | 'update_node_name'
  | 'websocket_broadcast'
  | 'database_write_job'
  | 'restart_server'
  | 'restart_database';

export interface IPCMessage {
  cmd: IPCCommand;
  [key: string]: unknown;
}
