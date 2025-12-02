# MoarTube-Node TypeScript Refactor Plan

## Overview

This document outlines a phased approach to refactoring MoarTube-Node from JavaScript to TypeScript. Each phase is designed to be independently deployable, maintaining backward compatibility while incrementally improving the codebase.

**Guiding Principles:**
- Each phase should result in a working, deployable application
- Maintain backward compatibility with existing data and configurations
- No breaking changes to the public API between phases
- Comprehensive testing before proceeding to the next phase
- Git branch per phase for easy rollback

**Requirements:**
- Node.js 20+ (required for native fetch API, replacing axios)

---

## Phase 0: Foundation Setup (Week 1)
**Goal:** Establish TypeScript infrastructure without modifying existing code behavior

### 0.1 TypeScript Configuration
- [ ] Install TypeScript and related dev dependencies
- [ ] Create `tsconfig.json` with strict mode enabled
- [ ] Configure path aliases for cleaner imports
- [ ] Set up `tsup` for production builds
- [ ] Configure source maps for debugging

### 0.2 Project Structure Preparation
```
src/
├── types/           # Shared type definitions
├── config/          # Configuration management
├── core/            # Core application bootstrap
├── database/        # Database layer (Drizzle ORM)
├── services/        # Business logic services
├── controllers/     # Request handlers
├── routes/          # Route definitions
├── plugins/         # Fastify plugins & hooks
├── utils/           # Utility functions
├── websocket/       # WebSocket handlers
└── workers/         # Cluster worker logic
```

### 0.3 Development Tooling
- [ ] Add ESLint with TypeScript rules
- [ ] Add Prettier for code formatting
- [ ] Create `.editorconfig`
- [ ] Add pre-commit hooks with Husky
- [ ] Set up `nodemon` for development with `ts-node`

### 0.4 Package.json Updates
```json
{
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts",
    "build": "tsup src/index.ts --format cjs --dts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "prepare": "husky install"
  },
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

### 0.5 Dependencies to Add
```
dependencies (replacing Express ecosystem):
  # Core Fastify
  - fastify@^4.28.0
  - @fastify/cors@^9.0.0
  - @fastify/cookie@^9.3.0
  - @fastify/session@^10.9.0
  - @fastify/multipart@^8.3.0
  - @fastify/jwt@^8.0.0
  - @fastify/websocket@^10.0.0
  - @fastify/static@^7.0.0
  - @fastify/view@^9.1.0
  
  # Security & Performance
  - @fastify/rate-limit@^9.1.0
  - @fastify/helmet@^11.1.0
  - @fastify/compress@^7.0.0
  - @fastify/csrf-protection@^6.4.0
  
  # Documentation
  - @fastify/swagger@^8.14.0
  - @fastify/swagger-ui@^3.0.0
  
  # Database (replacing Sequelize)
  - drizzle-orm@^0.29.0
  - better-sqlite3@^11.0.0 (replaces sqlite3)
  - postgres@^3.4.0 (replaces pg)
  
  # Utilities
  - zod@^3.23.0
  - awilix@^10.0.0
  - pino@^9.0.0 (Fastify's native logger)
  - pino-pretty@^11.0.0 (dev logging)

devDependencies:
  - typescript@^5.3.0
  - @types/node@^20.0.0
  - @types/ws@^8.5.0
  - @types/bcryptjs@^2.4.0
  - @types/better-sqlite3@^7.6.0
  - @types/sanitize-html@^2.11.0
  - drizzle-kit@^0.20.0 (migrations & studio)
  - tsup@^8.0.0
  - tsx@^4.7.0 (faster alternative to ts-node)
  - nodemon@^3.0.0
  - eslint@^8.56.0
  - @typescript-eslint/eslint-plugin@^6.0.0
  - @typescript-eslint/parser@^6.0.0
  - prettier@^3.2.0
  - vitest@^1.0.0
  - @vitest/coverage-v8@^1.0.0
  - husky@^8.0.0
  - lint-staged@^15.2.0

to be removed (Express & Sequelize ecosystem):
  - express
  - express-session
  - express-subdomain
  - express-dot-engine
  - body-parser
  - cors
  - multer
  - jsonwebtoken (replaced by @fastify/jwt)
  - sequelize (replaced by drizzle-orm)
  - sqlite3 (replaced by better-sqlite3)
  - pg (replaced by postgres)

dependencies to keep (unchanged):
  - @aws-sdk/client-s3@^3.x (S3 storage)
  - async-mutex@^0.5.x (cluster write synchronization)
  - bcryptjs@^2.x (password hashing)
  - sanitize-html@^2.x (XSS prevention)
  - sharp@^0.33.x (image processing)
  - uuid@^10.x (ID generation)
  - ws@^8.x (WebSocket - used alongside @fastify/websocket)
  - http-terminator@^3.x (graceful shutdown)
  - dot@^1.x (template engine - used with @fastify/view)

to be removed (additional):
  - axios (replaced by native fetch - built into Node.js 20+)
```

### 0.6 Environment Configuration
- [ ] Create `.env.example` with all environment variables
- [ ] Add `dotenv` for local development (not production)
- [ ] Document environment variables in README

```bash
# .env.example
NODE_ENV=development
IS_DOCKER_ENVIRONMENT=false
MOARTUBE_DATA_DIR=./data
DATABASE_URL=./data/db/node_db.sqlite
LOG_LEVEL=debug
```

### 0.7 Deliverables
- TypeScript compiles without errors (on empty src/)
- Development workflow documented in README
- `.env.example` created
- All existing tests still pass (JS code unchanged)

---

## Phase 1: Type Definitions & Interfaces (Week 2)
**Goal:** Define comprehensive types for the entire application without modifying runtime code

### 1.1 Configuration Types
```typescript
// src/types/config.ts
interface NodeSettings {
  nodeListeningPort: number;
  isSecure: boolean;
  publicNodeProtocol: 'http' | 'https';
  publicNodeAddress: string;
  publicNodePort: string;
  nodeName: string;
  nodeAbout: string;
  nodeId: string;
  username: string;
  password: string;
  // ... all other settings
}

interface DatabaseConfig {
  databaseDialect: 'sqlite' | 'postgres';
  // postgres-specific fields
}

interface StorageConfig {
  storageMode: 'filesystem' | 's3provider';
  s3Config?: S3Config;
}

interface S3Config {
  bucketName: string;
  s3ProviderClientConfig: S3ProviderClientConfig;
}
```

### 1.2 Database Model Types
```typescript
// src/types/models.ts
interface Video {
  video_id: string;
  source_file_extension: string;
  title: string;
  description: string;
  tags: string;
  views: number;
  likes: number;
  dislikes: number;
  // ... all columns
}

interface Comment {
  id: number;
  video_id: string;
  comment_plain_text_sanitized: string;
  timestamp: number;
}

// ... all other models
```

### 1.3 API Request/Response Types
```typescript
// src/types/api.ts
interface ApiResponse<T = unknown> {
  isError: boolean;
  message?: string;
  data?: T;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  totalCount: number;
  page: number;
  limit: number;
}

// Request body types for each endpoint
interface VideoUploadRequest {
  title: string;
  description: string;
  tags: string;
}
```

### 1.4 WebSocket Message Types
```typescript
// src/types/websocket.ts
type WebSocketEventName = 
  | 'live_stream_stats'
  | 'chat_message'
  | 'video_status'
  | 'node_name_update';

interface WebSocketMessage {
  eventName: WebSocketEventName;
  videoId?: string;
  [key: string]: unknown;
}

interface ExtendedWebSocket extends WebSocket {
  socketType: 'node_peer' | 'admin';
  videoId?: string;
}
```

### 1.5 IPC Message Types
```typescript
// src/types/ipc.ts
type IPCCommand =
  | 'get_jwt_secret'
  | 'update_node_name'
  | 'websocket_broadcast'
  | 'database_write_job'
  | 'restart_server'
  | 'restart_database';

interface IPCMessage {
  cmd: IPCCommand;
  [key: string]: unknown;
}

interface DatabaseWriteJobMessage extends IPCMessage {
  cmd: 'database_write_job';
  query: string;
  parameters: unknown[];
  databaseWriteJobId: string;
}
```

### 1.6 Deliverables
- Complete type definitions in `src/types/`
- Types exported as a module for gradual adoption
- Documentation for each type interface
- No runtime changes - existing JS code unchanged

---

## Phase 2: Configuration System (Week 3)
**Goal:** Replace scattered global state with a centralized, typed configuration system

### 2.1 Create Configuration Module
```typescript
// src/config/index.ts
class Config {
  private static instance: Config;
  private settings: NodeSettings;
  private paths: PathConfig;
  private urls: UrlConfig;
  private runtime: RuntimeConfig;

  private constructor() {
    this.load();
  }

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  private load(): void {
    // Load from config.json and environment
  }

  get nodeSettings(): Readonly<NodeSettings> {
    return Object.freeze({ ...this.settings });
  }

  updateNodeSettings(updates: Partial<NodeSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.persist();
  }
}
```

### 2.2 Configuration Schema Validation
```typescript
// src/config/schema.ts
import { z } from 'zod';

const NodeSettingsSchema = z.object({
  nodeListeningPort: z.number().min(1).max(65535),
  isSecure: z.boolean(),
  publicNodeProtocol: z.enum(['http', 'https']),
  // ... all fields with validation
});

const ConfigSchema = z.object({
  isDeveloperMode: z.boolean(),
  indexerConfig: IndexerConfigSchema,
  aliaserConfig: AliaserConfigSchema,
});
```

### 2.3 Environment Variable Support
```typescript
// src/config/env.ts
const envConfig = {
  IS_DOCKER_ENVIRONMENT: process.env.IS_DOCKER_ENVIRONMENT === 'true',
  NODE_ENV: process.env.NODE_ENV || 'production',
  DATA_DIRECTORY: process.env.MOARTUBE_DATA_DIR,
};
```

### 2.4 Path Configuration
```typescript
// src/config/paths.ts
class PathConfig {
  readonly dataDirectory: string;
  readonly publicDirectory: string;
  readonly viewsDirectory: string;
  readonly imagesDirectory: string;
  readonly videosDirectory: string;
  readonly databaseDirectory: string;
  readonly certificatesDirectory: string;

  constructor(baseDir: string, isDocker: boolean) {
    // Calculate all paths from base
  }
}
```

### 2.5 Migration Bridge
Create wrapper functions that map old getter/setter calls to new Config class:
```typescript
// src/config/legacy-bridge.ts
// Temporary compatibility layer
export function getNodeSettings() {
  return Config.getInstance().nodeSettings;
}

export function setNodeSettings(settings: NodeSettings) {
  Config.getInstance().updateNodeSettings(settings);
}
```

### 2.6 Files to Modify
- `utils/helpers.js` → Extract config-related code
- `utils/paths.js` → Migrate to PathConfig
- `utils/urls.js` → Migrate to UrlConfig
- `moartube-node.js` → Use Config.getInstance()

### 2.7 Deliverables
- Centralized Config singleton
- Zod schema validation
- Legacy bridge for backward compatibility
- All existing tests pass
- New unit tests for Config class

---

## Phase 3: Database Layer Refactor (Week 4-5)
**Goal:** Migrate from Sequelize to Drizzle ORM with typed database operations

### 3.1 Drizzle Schema Definition
```typescript
// src/database/schema/videos.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const videos = sqliteTable('videos', {
  videoId: text('video_id').primaryKey(),
  sourceFileExtension: text('source_file_extension'),
  title: text('title').notNull(),
  description: text('description'),
  tags: text('tags'),
  views: integer('views').default(0),
  likes: integer('likes').default(0),
  dislikes: integer('dislikes').default(0),
  isPublished: integer('is_published', { mode: 'boolean' }).default(false),
  isStreaming: integer('is_streaming', { mode: 'boolean' }).default(false),
  isIndexed: integer('is_indexed', { mode: 'boolean' }).default(false),
  timestamp: integer('timestamp'),
  // ... all other columns
});

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
```

### 3.2 Database Connection (SQLite & PostgreSQL)
```typescript
// src/database/connection.ts
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import Database from 'better-sqlite3';
import postgres from 'postgres';
import * as schema from './schema';

export function createDatabase(config: DatabaseConfig) {
  if (config.dialect === 'sqlite') {
    const sqlite = new Database(config.filepath);
    return drizzleSqlite(sqlite, { schema });
  } else {
    const client = postgres(config.connectionString);
    return drizzlePostgres(client, { schema });
  }
}

export type DatabaseClient = ReturnType<typeof createDatabase>;
```

### 3.3 Repository Pattern with Drizzle
```typescript
// src/database/repositories/video.repository.ts
import { eq, desc, sql } from 'drizzle-orm';
import { videos, Video, NewVideo } from '../schema/videos';

export class VideoRepository {
  constructor(private db: DatabaseClient) {}

  async findById(videoId: string): Promise<Video | null> {
    const result = await this.db
      .select()
      .from(videos)
      .where(eq(videos.videoId, videoId))
      .limit(1);
    return result[0] ?? null;
  }

  async findPublished(options: PaginationOptions): Promise<Video[]> {
    return this.db
      .select()
      .from(videos)
      .where(eq(videos.isPublished, true))
      .orderBy(desc(videos.timestamp))
      .limit(options.limit)
      .offset(options.offset);
  }

  async incrementViews(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ views: sql`${videos.views} + 1` })
      .where(eq(videos.videoId, videoId));
  }

  async create(data: NewVideo): Promise<Video> {
    const result = await this.db.insert(videos).values(data).returning();
    return result[0];
  }

  async update(videoId: string, data: Partial<NewVideo>): Promise<Video> {
    const result = await this.db
      .update(videos)
      .set(data)
      .where(eq(videos.videoId, videoId))
      .returning();
    return result[0];
  }

  async delete(videoId: string): Promise<boolean> {
    const result = await this.db
      .delete(videos)
      .where(eq(videos.videoId, videoId));
    return result.rowsAffected > 0;
  }
}
```

### 3.4 Drizzle Configuration
```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema/*',
  out: './drizzle',
  driver: 'better-sqlite', // or 'pg' for PostgreSQL
  dbCredentials: {
    url: process.env.DATABASE_URL || './data/db/node_db.sqlite',
  },
} satisfies Config;
```

### 3.5 Database Connection Wrapper (for cluster IPC)
```typescript
// src/database/cluster-wrapper.ts
import cluster from 'cluster';

export class ClusterDatabaseWrapper {
  constructor(
    private db: DatabaseClient,
    private writeQueue: WriteQueue
  ) {}

  // For read operations - execute directly
  get query() {
    return this.db;
  }

  // For write operations - route through master in cluster mode
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (cluster.isWorker) {
      return this.writeQueue.submit(operation);
    }
    return operation();
  }
}
```

### 3.6 Write Queue (IPC-based)
```typescript
// src/database/write-queue.ts
class WriteQueue {
  private pendingJobs = new Map<string, PendingJob>();

  submit(query: string, params: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const jobId = crypto.randomUUID();
      this.pendingJobs.set(jobId, { resolve, reject });
      process.send?.({
        cmd: 'database_write_job',
        query,
        parameters: params,
        databaseWriteJobId: jobId,
      });
    });
  }

  complete(jobId: string, error?: Error): void {
    const job = this.pendingJobs.get(jobId);
    if (job) {
      this.pendingJobs.delete(jobId);
      error ? job.reject(error) : job.resolve();
    }
  }
}
```

### 3.7 Schema Definitions
- [ ] `videos.ts` - Video table schema
- [ ] `comments.ts` - Comment table schema
- [ ] `video-reports.ts` - Video reports schema
- [ ] `comment-reports.ts` - Comment reports schema
- [ ] `video-reports-archive.ts` - Archived video reports
- [ ] `comment-reports-archive.ts` - Archived comment reports
- [ ] `live-chat-messages.ts` - Live chat messages
- [ ] `crypto-wallet-addresses.ts` - Crypto wallet addresses
- [ ] `links.ts` - Social links
- [ ] `index.ts` - Schema barrel export

### 3.8 Repository Implementations
- [ ] VideoRepository
- [ ] CommentRepository
- [ ] VideoReportRepository
- [ ] CommentReportRepository
- [ ] VideoReportsArchiveRepository
- [ ] CommentReportsArchiveRepository
- [ ] LiveChatMessageRepository
- [ ] CryptoWalletAddressRepository
- [ ] LinkRepository

### 3.9 Migration Strategy
1. Define Drizzle schemas matching existing Sequelize models
2. Use `drizzle-kit generate` to create migration files
3. Create repository classes with Drizzle queries
4. Add legacy adapter that routes old `submitDatabaseWriteJob` calls to repositories
5. Gradually update services to use repositories directly
6. Run `drizzle-kit migrate` to apply schema changes
7. Remove Sequelize and legacy adapters

### 3.10 Deliverables
- All 9 Drizzle schema definitions
- All 9 repository classes implemented
- Drizzle config for SQLite and PostgreSQL
- Database migrations generated
- Cluster-aware write queue
- Unit tests for each repository
- Legacy bridge for gradual migration

---

## Phase 4: Service Layer Introduction (Week 6-7)
**Goal:** Extract business logic from controllers into testable service classes

### 4.1 Service Structure
```typescript
// src/services/video.service.ts
class VideoService {
  constructor(
    private videoRepo: VideoRepository,
    private commentRepo: CommentRepository,
    private storageService: StorageService,
    private indexerService: IndexerService
  ) {}

  async getVideo(videoId: string): Promise<VideoWithMeta | null> {
    const video = await this.videoRepo.findById(videoId);
    if (!video) return null;

    const commentCount = await this.commentRepo.countByVideoId(videoId);
    return { ...video, commentCount };
  }

  async publishVideo(videoId: string, data: PublishVideoRequest): Promise<void> {
    // Business logic for publishing
    await this.videoRepo.update(videoId, {
      is_published: true,
      title: data.title,
      description: data.description,
      tags: data.tags,
    });
    await this.indexerService.requestIndexUpdate(videoId);
  }
}
```

### 4.2 Core Services to Create
| Service | Responsibility |
|---------|---------------|
| `VideoService` | Video CRUD, publishing, transcoding coordination |
| `StreamService` | Live streaming management |
| `CommentService` | Comment CRUD, moderation |
| `AuthService` | Authentication, JWT management |
| `StorageService` | File/S3 storage abstraction |
| `IndexerService` | MoarTube Indexer communication |
| `CloudflareService` | Cloudflare API integration |
| `WebSocketService` | WebSocket message broadcasting |
| `ReportService` | Content reporting and moderation |
| `SettingsService` | Node settings management |

### 4.3 Dependency Injection Container
```typescript
// src/core/container.ts
import { createContainer, asClass, asValue } from 'awilix';

const container = createContainer();

container.register({
  // Config
  config: asValue(Config.getInstance()),

  // Database
  database: asClass(DatabaseConnection).singleton(),
  
  // Repositories
  videoRepository: asClass(VideoRepository).scoped(),
  commentRepository: asClass(CommentRepository).scoped(),
  
  // Services
  videoService: asClass(VideoService).scoped(),
  authService: asClass(AuthService).singleton(),
  storageService: asClass(StorageService).singleton(),
});
```

### 4.4 Service Interface Examples
```typescript
// src/services/interfaces.ts
interface IVideoService {
  getVideo(videoId: string): Promise<Video | null>;
  getVideos(options: GetVideosOptions): Promise<PaginatedResult<Video>>;
  createVideo(data: CreateVideoInput): Promise<Video>;
  updateVideo(videoId: string, data: UpdateVideoInput): Promise<Video>;
  deleteVideo(videoId: string): Promise<void>;
  publishVideo(videoId: string): Promise<void>;
  incrementViews(videoId: string): Promise<void>;
}

interface IStorageService {
  saveFile(key: string, buffer: Buffer): Promise<void>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  fileExists(key: string): Promise<boolean>;
}
```

### 4.5 Migration Strategy
1. Create service classes with repository dependencies
2. Update one controller at a time to use services
3. Keep controllers thin - just request parsing and response formatting
4. Services handle all business logic and cross-cutting concerns

### 4.6 Deliverables
- 10 service classes implemented
- Awilix DI container configured
- Service interfaces documented
- Unit tests for each service
- At least 3 controllers migrated to use services

---

## Phase 5: Controller & Route Migration (Week 8-9)
**Goal:** Convert all controllers and routes to TypeScript with proper typing

### 5.1 Controller Base Class
```typescript
// src/controllers/base.controller.ts
import { FastifyReply } from 'fastify';

abstract class BaseController {
  protected sendSuccess<T>(reply: FastifyReply, data: T, status = 200): void {
    reply.status(status).send({ isError: false, data });
  }

  protected sendError(reply: FastifyReply, message: string, status = 400): void {
    reply.status(status).send({ isError: true, message });
  }

  protected sendPaginated<T>(
    reply: FastifyReply,
    data: T[],
    total: number,
    page: number,
    limit: number
  ): void {
    reply.send({
      isError: false,
      data,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  }
}
```

### 5.2 Controller Implementation Pattern
```typescript
// src/controllers/video.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';

class VideoController extends BaseController {
  constructor(private videoService: IVideoService) {
    super();
  }

  getVideo = async (
    request: FastifyRequest<{ Params: { videoId: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const { videoId } = request.params;
      const video = await this.videoService.getVideo(videoId);
      
      if (!video) {
        return this.sendError(reply, 'Video not found', 404);
      }
      
      this.sendSuccess(reply, video);
    } catch (error) {
      this.sendError(reply, 'Failed to retrieve video', 500);
    }
  };
}
```

### 5.3 Route Definition Pattern
```typescript
// src/routes/video.routes.ts
import { FastifyInstance } from 'fastify';
import { container } from '../core/container';

export async function videoRoutes(fastify: FastifyInstance): Promise<void> {
  const controller = container.resolve<VideoController>('videoController');

  fastify.get('/:videoId', controller.getVideo);
  
  // Protected routes with authentication hook
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('onRequest', fastify.authenticate);
    
    protectedRoutes.post('/', controller.createVideo);
    protectedRoutes.put('/:videoId', controller.updateVideo);
    protectedRoutes.delete('/:videoId', controller.deleteVideo);
  });
}
```

### 5.4 Migration Order (by complexity)
1. **Simple (2-3 endpoints):** status, links, monetization
2. **Medium (5-10 endpoints):** account, comments, reports
3. **Complex (10+ endpoints):** videos, streams, settings, node

### 5.5 Request Validation with Zod (Fastify Integration)
```typescript
// src/validators/video.validators.ts
import { z } from 'zod';
import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

export const CreateVideoSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  tags: z.string().max(500).optional(),
});

export const UpdateVideoSchema = CreateVideoSchema.partial();

// Fastify preValidation hook factory
export const validateBody = <T extends z.ZodSchema>(schema: T) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        isError: true,
        message: 'Validation failed',
        errors: result.error.flatten(),
      });
    }
    // Fastify allows mutating request.body
    request.body = result.data;
  };
};

// Usage in routes:
// fastify.post('/', { preValidation: validateBody(CreateVideoSchema) }, controller.createVideo);
```

### 5.6 Controllers to Migrate (19 total)
| Controller | Complexity | Endpoints | Dependencies |
|------------|------------|-----------|--------------|
| status.js | Simple | 2 | - |
| links.js | Simple | 4 | LinkService |
| monetization.js | Simple | 3 | SettingsService |
| account.js | Medium | 5 | AuthService |
| comments.js | Medium | 6 | CommentService, VideoService |
| reports.js | Medium | 4 | ReportService |
| reports-videos.js | Medium | 3 | ReportService |
| reports-comments.js | Medium | 3 | ReportService |
| reports-archive-videos.js | Medium | 3 | ReportService |
| reports-archive-comments.js | Medium | 3 | ReportService |
| node.js | Medium | 8 | SettingsService, StorageService |
| watch.js | Medium | 5 | VideoService |
| watch-embed.js | Simple | 2 | VideoService |
| base.js | Simple | 3 | - |
| external-resources.js | Simple | 2 | StorageService |
| external-videos.js | Simple | 2 | VideoService, StorageService |
| settings.js | Complex | 12 | SettingsService, StorageService |
| videos.js | Complex | 20+ | VideoService, StorageService |
| streams.js | Complex | 15+ | StreamService, VideoService |

### 5.7 Error Handling Strategy
```typescript
// src/errors/base.error.ts
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

// src/errors/http.errors.ts
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly isOperational = true;
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;
  constructor(message: string, public readonly errors?: unknown) {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly isOperational = true;
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly isOperational = true;
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly isOperational = true;
}

export class InternalServerError extends AppError {
  readonly statusCode = 500;
  readonly isOperational = false;
}
```

```typescript
// src/plugins/error-handler.plugin.ts
import { FastifyInstance, FastifyError } from 'fastify';
import { AppError } from '../errors/base.error';

export async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    const logger = request.log;

    if (error instanceof AppError) {
      if (!error.isOperational) {
        logger.error(error, 'Unexpected error');
      }
      return reply.status(error.statusCode).send({
        isError: true,
        message: error.message,
        ...(error instanceof ValidationError && { errors: error.errors }),
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        isError: true,
        message: 'Validation failed',
        errors: error.validation,
      });
    }

    // Unexpected errors
    logger.error(error, 'Unhandled error');
    return reply.status(500).send({
      isError: true,
      message: 'Internal server error',
    });
  });
}
```

### 5.8 Health Check Endpoint
```typescript
// src/routes/health.routes.ts
import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Basic liveness check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Detailed readiness check
  fastify.get('/health/ready', async (request, reply) => {
    const checks = {
      database: await checkDatabase(),
      storage: await checkStorage(),
    };

    const isHealthy = Object.values(checks).every((c) => c.status === 'ok');
    
    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: Date.now(),
      checks,
    });
  });
}
```

### 5.9 Deliverables
- All 19 controllers converted to TypeScript
- All 19 route files converted
- Request validation on all endpoints
- Custom error classes implemented
- Centralized error handler plugin
- Health check endpoints (`/health`, `/health/ready`)
- API response types enforced

---

## Phase 6: WebSocket & Cluster Refactor (Week 10)
**Goal:** Clean up WebSocket handling and cluster communication

### 6.1 WebSocket Handler Classes
```typescript
// src/websocket/handlers/base.handler.ts
abstract class WebSocketHandler {
  abstract canHandle(message: WebSocketMessage): boolean;
  abstract handle(client: ExtendedWebSocket, message: WebSocketMessage): void;
}

// src/websocket/handlers/chat.handler.ts
class ChatMessageHandler extends WebSocketHandler {
  canHandle(message: WebSocketMessage): boolean {
    return message.eventName === 'chat_message';
  }

  handle(client: ExtendedWebSocket, message: WebSocketMessage): void {
    // Handle chat message
  }
}
```

### 6.2 WebSocket Manager
```typescript
// src/websocket/websocket-manager.ts
class WebSocketManager {
  private handlers: WebSocketHandler[] = [];

  registerHandler(handler: WebSocketHandler): void {
    this.handlers.push(handler);
  }

  handleMessage(client: ExtendedWebSocket, rawMessage: string): void {
    const message = JSON.parse(rawMessage) as WebSocketMessage;
    
    for (const handler of this.handlers) {
      if (handler.canHandle(message)) {
        handler.handle(client, message);
        return;
      }
    }
  }

  broadcast(message: WebSocketMessage, filter?: (client: ExtendedWebSocket) => boolean): void {
    // Broadcast to matching clients
  }
}
```

### 6.3 Cluster Communication Abstraction
```typescript
// src/core/cluster/ipc-channel.ts
class IPCChannel {
  private handlers = new Map<IPCCommand, IPCHandler>();

  on(command: IPCCommand, handler: IPCHandler): void {
    this.handlers.set(command, handler);
  }

  send(message: IPCMessage): void {
    process.send?.(message);
  }

  broadcast(message: IPCMessage): void {
    if (cluster.isMaster) {
      Object.values(cluster.workers ?? {}).forEach((worker) => {
        worker?.send(message);
      });
    }
  }
}
```

### 6.4 Master Process Refactor
```typescript
// src/core/cluster/master.ts
class ClusterMaster {
  private ipc: IPCChannel;
  private writeQueue: MasterWriteQueue;
  private statsAggregator: StatsAggregator;

  async start(): Promise<void> {
    await provisionDatabase();
    
    this.setupIPCHandlers();
    this.forkWorkers();
    this.startPeriodicTasks();
  }

  private setupIPCHandlers(): void {
    this.ipc.on('database_write_job', this.handleDatabaseWrite);
    this.ipc.on('websocket_broadcast', this.handleBroadcast);
    this.ipc.on('live_stream_worker_stats_response', this.handleStats);
  }
}
```

### 6.5 Worker Process Refactor
```typescript
// src/core/cluster/worker.ts
import Fastify, { FastifyInstance } from 'fastify';

class ClusterWorker {
  private app: FastifyInstance;
  private wsManager: WebSocketManager;
  private ipc: IPCChannel;

  async start(): Promise<void> {
    this.app = Fastify({ logger: true });
    
    await this.initializeDatabase();
    await this.registerPlugins();
    await this.registerRoutes();
    this.setupWebSockets();
    this.setupIPCHandlers();
    await this.startServer();
  }

  private async registerPlugins(): Promise<void> {
    await this.app.register(require('@fastify/cors'));
    await this.app.register(require('@fastify/cookie'));
    await this.app.register(require('@fastify/session'), {
      secret: this.config.expressSessionSecret,
    });
    await this.app.register(require('@fastify/jwt'), {
      secret: this.config.jwtSecret,
    });
    await this.app.register(require('@fastify/websocket'));
    await this.app.register(require('@fastify/view'), {
      engine: { dot: require('dot') },
      root: this.config.viewsDirectory,
    });
  }
}
```

### 6.6 Graceful Shutdown
```typescript
// src/core/shutdown.ts
import { FastifyInstance } from 'fastify';
import { createHttpTerminator } from 'http-terminator';

export class GracefulShutdown {
  private isShuttingDown = false;
  private httpTerminator: ReturnType<typeof createHttpTerminator>;

  constructor(
    private app: FastifyInstance,
    private cleanup: () => Promise<void>
  ) {
    this.httpTerminator = createHttpTerminator({
      server: app.server,
      gracefulTerminationTimeout: 10000, // 10 seconds
    });
  }

  register(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

    signals.forEach((signal) => {
      process.on(signal, () => this.shutdown(signal));
    });

    process.on('uncaughtException', (error) => {
      this.app.log.error(error, 'Uncaught exception');
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      this.app.log.error(reason, 'Unhandled rejection');
      this.shutdown('unhandledRejection');
    });
  }

  private async shutdown(reason: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.app.log.info(`Shutting down (${reason})...`);

    try {
      // Stop accepting new connections
      await this.httpTerminator.terminate();

      // Close WebSocket connections
      this.app.websocketServer?.clients.forEach((client) => {
        client.close(1001, 'Server shutting down');
      });

      // Run cleanup (close DB, flush logs, etc.)
      await this.cleanup();

      this.app.log.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      this.app.log.error(error, 'Error during shutdown');
      process.exit(1);
    }
  }
}
```

### 6.7 Deliverables
- WebSocket handlers extracted into classes
- IPC abstraction layer
- Clean master/worker separation
- Reduced nesting in message handlers
- Graceful shutdown with cleanup
- Unit tests for WebSocket handlers

---

## Phase 7: Utility Functions & Helpers (Week 11)
**Goal:** Convert remaining utility functions to typed modules

### 7.1 Logger Module
```typescript
// src/utils/logger.ts
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

class Logger {
  private static instance: Logger;

  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}
```

### 7.2 Validators Module
```typescript
// src/utils/validators.ts
export const validators = {
  isVideoId: (value: string): boolean => /^[a-zA-Z0-9_-]{11}$/.test(value),
  isIpv4Address: (value: string): boolean => { /* ... */ },
  isValidPort: (value: number): boolean => value >= 1 && value <= 65535,
  isValidUrl: (value: string): boolean => { /* ... */ },
} as const;
```

### 7.3 Filesystem Utilities
```typescript
// src/utils/filesystem.ts
export async function ensureDirectory(path: string): Promise<void>;
export async function deleteDirectory(path: string): Promise<void>;
export async function deleteFile(path: string): Promise<void>;
export async function readJsonFile<T>(path: string): Promise<T>;
export async function writeJsonFile<T>(path: string, data: T): Promise<void>;
```

### 7.4 Remaining Utilities to Convert
- [ ] `cloudflare-communications.js` → `CloudflareClient` class
- [ ] `indexer-communications.js` → `IndexerClient` class
- [ ] `s3-communications.js` → `S3StorageClient` class
- [ ] `httpserver.js` → `HttpServerManager` class
- [ ] `filesystem.js` → filesystem utility functions

### 7.5 Deliverables
- All utility files converted to TypeScript
- External API clients as classes with proper error handling
- Unit tests for all utilities
- Consistent async/await patterns

---

## Phase 8: Cleanup & Optimization (Week 12)
**Goal:** Remove legacy code, optimize performance, final polish

### 8.1 Legacy Code Removal
- [ ] Remove JavaScript source files (keep only TypeScript)
- [ ] Remove legacy bridge adapters
- [ ] Remove deprecated functions
- [ ] Clean up unused dependencies

### 8.2 Performance Optimizations
- [ ] Add connection pooling for PostgreSQL
- [ ] Implement response caching where appropriate
- [ ] Optimize database queries
- [ ] Add compression middleware
- [ ] Review and optimize memory usage

### 8.3 Deliverables
- Zero JavaScript in src/
- All dependencies up to date
- Performance benchmarks documented

---

## Phase 9: Testing & Documentation (Week 13)
**Goal:** Comprehensive test coverage and documentation

### 9.1 Testing Strategy
```
tests/
├── unit/
│   ├── services/
│   ├── repositories/
│   ├── utils/
│   └── validators/
├── integration/
│   ├── api/
│   └── database/
└── e2e/
    └── flows/
```

### 9.2 Test Coverage Targets
| Layer | Target Coverage |
|-------|-----------------|
| Services | 90% |
| Repositories | 85% |
| Controllers | 80% |
| Utilities | 95% |
| Overall | 85% |

### 9.3 Test Examples
```typescript
// tests/unit/services/video.service.test.ts
describe('VideoService', () => {
  let service: VideoService;
  let mockVideoRepo: jest.Mocked<VideoRepository>;

  beforeEach(() => {
    mockVideoRepo = createMock<VideoRepository>();
    service = new VideoService(mockVideoRepo, ...);
  });

  describe('getVideo', () => {
    it('should return video when found', async () => {
      const mockVideo = createMockVideo();
      mockVideoRepo.findById.mockResolvedValue(mockVideo);

      const result = await service.getVideo('abc123');

      expect(result).toEqual(mockVideo);
      expect(mockVideoRepo.findById).toHaveBeenCalledWith('abc123');
    });

    it('should return null when not found', async () => {
      mockVideoRepo.findById.mockResolvedValue(null);

      const result = await service.getVideo('notfound');

      expect(result).toBeNull();
    });
  });
});
```

### 9.4 Documentation
- [ ] API documentation with OpenAPI/Swagger
- [ ] Architecture decision records (ADRs)
- [ ] Developer setup guide
- [ ] Contribution guidelines
- [ ] Migration guide from JavaScript version

### 9.5 Deliverables
- 85%+ test coverage
- All tests passing
- API documentation generated
- README updated with new structure
- CHANGELOG documenting all changes

---

## Phase 10: Security, CI/CD & Release (Week 14)
**Goal:** Security hardening, deployment infrastructure, and final release preparation

### 10.1 Security Hardening
- [ ] Audit all input validation (Zod schemas)
- [ ] Review authentication flows (@fastify/jwt)
- [ ] Configure rate limiting (@fastify/rate-limit)
- [ ] Implement CSRF protection (@fastify/csrf-protection)
- [ ] Security headers (@fastify/helmet)
- [ ] Response compression (@fastify/compress)
- [ ] Add request logging (pino)

### 10.2 Docker Multi-Stage Build
```dockerfile
# Dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, sharp)
RUN apk add --no-cache python3 make g++ 

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache libstdc++

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

# Create non-root user
RUN addgroup -g 1001 -S moartube && \
    adduser -S moartube -u 1001 -G moartube && \
    mkdir -p /data && chown -R moartube:moartube /data

USER moartube

ENV NODE_ENV=production
ENV IS_DOCKER_ENVIRONMENT=true

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

CMD ["node", "dist/index.js"]
```

### 10.3 CI/CD Pipeline (GitHub Actions)
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  build:
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  docker:
    runs-on: ubuntu-latest
    needs: [build]
    if: github.ref == 'refs/heads/master'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: moartube/moartube-node:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 10.4 Final Package.json
```json
{
  "name": "@moartube/moartube-node",
  "version": "2.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "dev": "nodemon",
    "build": "tsup",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "prepare": "husky install"
  }
}
```

### 10.5 Deliverables
- Security audit completed
- Docker image optimized and tested
- CI/CD pipeline functional
- Ready for v2.0.0 release

---

## Summary Timeline

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| Phase 0 | Week 1 | TypeScript infrastructure |
| Phase 1 | Week 2 | Type definitions |
| Phase 2 | Week 3 | Configuration system |
| Phase 3 | Week 4-5 | Database repositories |
| Phase 4 | Week 6-7 | Service layer |
| Phase 5 | Week 8-9 | Controllers & routes |
| Phase 6 | Week 10 | WebSocket & cluster |
| Phase 7 | Week 11 | Utilities |
| Phase 8 | Week 12 | Cleanup & optimization |
| Phase 9 | Week 13 | Testing & docs |
| Phase 10 | Week 14 | Security, CI/CD & release |

**Total Estimated Duration:** 14 weeks

---

## Risk Mitigation

### Known Risks
1. **Sequelize to Drizzle migration** - Mitigated by:
   - Generating Drizzle schemas from existing table structure
   - Running both ORMs in parallel during transition
   - Comprehensive integration tests before switching
   - Using `drizzle-kit push` for schema sync validation
2. **Cluster IPC complexity** - Mitigated by thorough testing
3. **Breaking API changes** - Mitigated by maintaining response formats
4. **Performance regression** - Mitigated by benchmarking at each phase
5. **better-sqlite3 native compilation** - Mitigated by:
   - Docker multi-stage builds with proper node-gyp setup
   - Prebuilt binaries for common platforms

### Rollback Strategy
- Each phase has its own git branch
- Feature flags for gradual rollout
- Maintain ability to run JS version in parallel during transition

---

## Success Criteria

- [ ] All existing functionality preserved
- [ ] No breaking changes to API
- [ ] TypeScript strict mode enabled with zero errors
- [ ] 85%+ test coverage
- [ ] Documentation complete
- [ ] Performance equal or better than JavaScript version
- [ ] Clean architecture with clear separation of concerns
