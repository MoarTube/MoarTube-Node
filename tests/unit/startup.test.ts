import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  primary: true,
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() },
  initializeConfig: vi.fn(),
  createDatabase: vi.fn(),
  initializeSchema: vi.fn(),
  masterStart: vi.fn(),
  workerStart: vi.fn(),
  findStreaming: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  deleteAll: vi.fn(),
  finalize: vi.fn(),
}));
vi.mock('dotenv/config', () => ({}));
vi.mock('node:cluster', () => ({
  default: {
    get isPrimary() {
      return state.primary;
    },
  },
}));
vi.mock('@config/index.js', () => ({
  initializeConfig: state.initializeConfig,
  getConfig: () => ({
    nodeSettings: { databaseConfig: { databaseDialect: 'sqlite' } },
    paths: { databaseFilePath: '/test.sqlite' },
  }),
}));
vi.mock('@utils/index.js', () => ({
  Logger: { getInstance: () => state.logger },
  getLogger: () => state.logger,
}));
vi.mock('@database/index.js', () => ({
  createDatabase: state.createDatabase,
  initializeDatabaseSchema: state.initializeSchema,
  getDatabase: () => ({}),
}));
vi.mock('@core/cluster/index.js', () => ({
  ClusterMaster: class {
    start = state.masterStart;
  },
  ClusterWorker: class {
    start = state.workerStart;
  },
}));
vi.mock('@core/container.js', () => ({
  createAppContainer: async () => ({
    resolve(name: string) {
      if (name === 'videosRepository')
        return { findStreaming: state.findStreaming, findAll: state.findAll, update: state.update };
      if (name === 'streamsService') return { finalizeAllStreamedManifests: state.finalize };
      if (name === 'liveChatMessagesRepository') return { deleteAll: state.deleteAll };
      return {};
    },
  }),
}));

describe('application startup provisioning', () => {
  let exit: ReturnType<typeof vi.spyOn>;
  const originalTls = process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    state.primary = true;
    state.findStreaming.mockResolvedValue([]);
    state.findAll.mockResolvedValue([]);
    exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalTls === undefined) delete process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
    else process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = originalTls;
  });

  it('clears stale flags, removes chat, and finalizes manifests before starting the master', async () => {
    state.findStreaming.mockResolvedValue([{ video_id: 'live' }]);
    state.findAll.mockResolvedValue([
      { video_id: 'import', is_importing: true },
      { video_id: 'publish', is_publishing: true },
      { video_id: 'stream', is_streaming: true },
      { video_id: 'idle', is_importing: false, is_publishing: false, is_streaming: false },
    ]);
    await import('@/moartube-node.js');
    expect(state.update).toHaveBeenCalledWith('live', { is_streamed: true });
    for (const id of ['import', 'publish', 'stream']) {
      expect(state.update).toHaveBeenCalledWith(id, {
        is_importing: false,
        is_publishing: false,
        is_streaming: false,
      });
    }
    expect(state.update).toHaveBeenCalledTimes(4);
    expect(state.deleteAll).toHaveBeenCalledOnce();
    expect(state.finalize).toHaveBeenCalledOnce();
    expect(state.masterStart).toHaveBeenCalledOnce();
    expect(state.finalize.mock.invocationCallOrder[0]).toBeLessThan(
      state.masterStart.mock.invocationCallOrder[0]
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs provisioning failure and still starts the master', async () => {
    const error = new Error('cleanup failed');
    state.findStreaming.mockRejectedValue(error);
    await import('@/moartube-node.js');
    expect(state.logger.error).toHaveBeenCalledWith('Startup provisioning failed', error);
    expect(state.masterStart).toHaveBeenCalledOnce();
  });
});
