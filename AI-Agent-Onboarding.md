# MoarTube-Node AI Agent Onboarding Document

> **Document Version:** 1.1  
> **Last Updated:** December 31, 2025  
> **Project Version:** 1.1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Overview](#project-overview)
3. [Technology Stack](#technology-stack)
4. [Architecture](#architecture)
5. [Project Structure](#project-structure)
6. [Core Concepts](#core-concepts)
7. [Database Layer](#database-layer)
8. [Service Layer](#service-layer)
9. [Controller Layer](#controller-layer)
10. [Routes](#routes)
11. [WebSocket System](#websocket-system)
12. [Configuration System](#configuration-system)
13. [Authentication & Security](#authentication--security)
14. [Storage System](#storage-system)
15. [External Integrations](#external-integrations)
16. [Cluster Architecture](#cluster-architecture)
17. [Error Handling](#error-handling)
18. [Validation System](#validation-system)
19. [Testing Strategy](#testing-strategy)
20. [Development Workflow](#development-workflow)
21. [Deployment](#deployment)
22. [Key Patterns & Conventions](#key-patterns--conventions)
23. [Critical Files Reference](#critical-files-reference)
24. [Common Tasks & Modifications](#common-tasks--modifications)

---

## Executive Summary

**MoarTube-Node** is a self-hosted, decentralized video and live streaming platform server. It is the server-side component managed by the [MoarTube Client](https://github.com/MoarTube/MoarTube-Client). The platform enables users to host their own videos and live streams, either privately or publicly indexed on [MoarTube.com](https://www.moartube.com).

**Key Characteristics:**
- Cross-platform (Windows, macOS, Linux, Raspberry Pi)
- Lightweight resource footprint (runs on 1GB RAM, 1 vCPU)
- Supports Video on Demand (VoD) and HLS Live Streaming
- Decentralized architecture with optional external database (PostgreSQL) and storage (S3)
- Cloudflare CDN integration for global content delivery
- Anonymous comments and live chat functionality
- Cryptocurrency monetization support (ETH, BNB via MetaMask)

---

## Project Overview

### Purpose

MoarTube-Node is responsible for:
- **Storage and distribution** of video content
- Serving web pages for video playback
- Managing user-generated content (comments, reports)
- Live streaming infrastructure
- WebSocket-based real-time communication
- Integration with MoarTube indexer for public discovery

### Relationship with MoarTube Client

- **MoarTube Client**: Handles video/stream processing, encoding, and transcoding on local machines
- **MoarTube Node**: Handles storage, distribution, and serving of processed content

### License

Custom proprietary license - use permitted, redistribution and modification prohibited.

---

## Technology Stack

### Runtime & Language

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | ≥20.0.0 |
| Language | TypeScript | ES2022 target |
| Module System | ESM (ECMAScript Modules) | NodeNext |

### Core Framework

| Component | Technology | Purpose |
|-----------|-----------|---------|
| HTTP Server | **Fastify** | High-performance HTTP framework |
| WebSocket | **ws** | Real-time communication |
| Validation | **Zod** | Runtime schema validation |
| DI Container | **Awilix** | Dependency injection |

### Database

| Component | Technology | Purpose |
|-----------|-----------|---------|
| ORM | **Drizzle ORM** | Type-safe database operations |
| SQLite Driver | **better-sqlite3** | Local database (default) |
| PostgreSQL Driver | **postgres** | Remote database (optional) |

### Storage

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Local Storage | File System | Default storage mode |
| Cloud Storage | **AWS SDK S3** | S3-compatible providers |

### Authentication & Security

| Component | Technology | Purpose |
|-----------|-----------|---------|
| JWT | **jsonwebtoken** | Token-based authentication |
| Password Hashing | **bcryptjs** | Credential validation |
| HTML Sanitization | **sanitize-html** | XSS prevention |

### Additional Dependencies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| HTTP Client | **axios** | External API communication |
| Templating | **EJS** | Server-side view rendering |
| Logging | **Pino** | Structured logging |
| UUID Generation | **uuid** | Unique identifier generation |
| Mutex | **async-mutex** | Concurrency control |

### Development Tools

| Tool | Purpose |
|------|---------|
| TypeScript | Type checking |
| ESLint | Code linting (strict TypeScript rules) |
| Prettier | Code formatting |
| Vitest | Unit testing |
| Husky | Git hooks |
| Knip | Dead code detection |
| tsx | Development runtime with watch mode |

---

## Architecture

### High-Level Architecture

The application follows a layered architecture pattern. At the top level, there are three main entry points: the Fastify HTTP Server, the WebSocket Server, and the Cluster Master (which serves as the IPC Hub for inter-process communication).

Below these entry points, the **Routes Layer** receives incoming requests and directs them to appropriate handlers for various domains including account management, videos, streams, comments, and reports.

The **Controllers Layer** sits beneath routes, orchestrating business logic and managing request/response transformations.

The **Services Layer** contains the core business logic, with dedicated services for Videos, Comments, Streams, Storage, Cloudflare integration, and other domains.

The **Repositories Layer** handles all database CRUD operations through Drizzle ORM, providing a clean data access abstraction.

At the data persistence level, the application supports either **SQLite** (default for local deployments) or **PostgreSQL** (for decentralized deployments). Similarly, file storage can use either the local **File System** (default) or an **S3 Provider** (AWS, DigitalOcean Spaces, MinIO, etc.).

External services include the **MoarTube Indexer** for public video discovery and **Cloudflare** for CDN and Turnstile bot protection.

### Cluster Architecture

The application uses the Node.js cluster module for multi-process architecture to maximize CPU utilization.

The **Master Process** is responsible for database initialization, JWT secret generation, worker process management, IPC message coordination, and running periodic tasks such as indexer updates.

Multiple **Worker Processes** are forked from the master, each running its own HTTP and WebSocket server. Workers communicate with the master via IPC (Inter-Process Communication) for coordinating broadcasts and sharing state like live stream viewer counts.

### Dependency Injection

The application uses **Awilix** for dependency injection. The container is configured in the core container module and registers all repositories as singletons (injecting the database client and table references), all services as singletons (injecting their required dependencies), and core utilities like the logger and database client as values.

The **Container Cradle** defines the complete interface of available dependencies including: the logger, database client, all repositories (videos, comments, reports, live chat messages, monetization, links), and all services (videos, comments, streams, account, storage, indexer, cloudflare, websocket, reports, settings, upload tracker, video upload, live chat, links, monetization).

---

## Project Structure

The project follows a well-organized directory structure:

**Source Code (src/):** Contains all TypeScript source files organized by concern:
- **moartube-node.ts**: The main application entry point
- **config/**: Configuration management including the main Config singleton, environment variable handling, file path configuration, Zod validation schemas, and URL building utilities
- **core/**: Core infrastructure including the Awilix DI container and cluster management (master process, worker process, IPC channel)
- **database/**: Database layer with connection factories for SQLite and PostgreSQL, Drizzle table schemas (with separate implementations for each dialect), and repository classes for data access
- **services/**: Business logic layer with service classes for each domain (videos, streams, comments, storage, cloudflare, indexer, etc.) plus a base service class and interface definitions
- **controllers/**: HTTP request handlers with a base controller class providing common response methods
- **routes/**: Fastify route definitions organized by domain, with a central registration function
- **plugins/**: Fastify plugins for authentication and error handling, plus the app factory function
- **websocket/**: WebSocket connection management and message handlers (chat, video status, registration, etc.)
- **validators/**: Zod validation schemas organized by domain (common schemas, video schemas, etc.)
- **errors/**: Custom error classes including the base AppError and specific HTTP errors (BadRequest, Unauthorized, Forbidden, NotFound, Validation)
- **types/**: TypeScript type definitions for API payloads, configuration, IPC messages, database models, and WebSocket messages
- **utils/**: Utility functions including the Pino logger wrapper, filesystem helpers, and validation helpers

**Public Assets (public/):** Static files including CSS, fonts, images, JavaScript, and EJS view templates.

**Runtime Data (data/):** Contains node settings JSON files, the SQLite database, node branding images, SSL certificates, and video media storage. This directory is typically gitignored in production.

**Database Migrations (drizzle/):** SQL migration files for both SQLite and PostgreSQL dialects.

**Tests (tests/):** Test files and test utilities.

**Configuration Files:** The root contains package.json, TypeScript config, Drizzle config, Vitest config, ESLint config, and the Dockerfile.

---

## Core Concepts

### Video Lifecycle

Videos progress through several states during their lifecycle:

1. **Import Started**: Initial creation, video record exists but no content yet
2. **Imported**: Ready to receive data, storage directories created
3. **Publishing**: Video is being encoded/processed by MoarTube Client
4. **Importing**: Video is being imported, storage directories created
5. **Published**: Video is playable, available for viewing
6. **Finalized**: Complete state, no further changes expected

Optionally, a published video can be **Indexed** to make it visible on MoarTube.com for public discovery.

**Video State Flags** track these states through boolean fields: `is_importing`/`is_imported` for the import phase, `is_publishing`/`is_published` for publishing, `is_streaming`/`is_streamed`/`is_live` for live stream states, `is_indexing`/`is_indexed`/`is_index_outdated` for index states, `is_finalized` for completion, and `is_error` for error conditions.

### Live Streaming

Live streaming follows a flow where the MoarTube Client (or OBS) sends an RTMP stream to the MoarTube Node. The Node processes this into HLS segments (M3U8 manifests and TS segment files) while also generating WebSocket events for real-time updates. Viewers connect via browser, receiving both the HLS video stream and WebSocket updates for features like live chat and viewer counts.

### Video Formats

The system supports multiple video formats:

| Format | Type | Container | Video Codec | Audio Codec |
|--------|------|-----------|-------------|-------------|
| HLS | Adaptive | M3U8/TS | H.264 | AAC |
| MP4 | Progressive | MP4 | H.264 | AAC |
| WebM | Progressive | WebM | VP9 | Opus |
| OGV | Progressive | OGG | VP8 | Opus |

**Supported Resolutions:** 2160p, 1440p, 1080p, 720p, 480p, 360p, 240p

---

## Database Layer

### Connection Management

The database connection supports two dialects determined at runtime based on configuration. The connection factory in the database module checks the configured dialect and creates either a SQLite connection (using better-sqlite3) or a PostgreSQL connection (using the postgres driver). A unified interface is provided regardless of the underlying database.

### Schema Design (Drizzle ORM)

Each database table has dual schema implementations—one for SQLite and one for PostgreSQL—due to dialect-specific differences in data types and constraints. The schemas are located in separate directories under the database schemas folder.

The **Videos table** is the primary table, containing fields for: auto-incrementing ID, unique video identifier, source file extension, content metadata (title, description, tags), duration information, statistics (views, comments, likes, dislikes, bandwidth), numerous boolean state flags for tracking lifecycle states, JSON data stored as text for outputs and metadata, and a creation timestamp.

### Database Tables

| Table | Purpose |
|-------|---------|
| `videos` | Video metadata and state |
| `comments` | Video comments |
| `livechatmessages` | Live stream chat messages |
| `videoreports` | Video reports (active) |
| `commentreports` | Comment reports (active) |
| `videoreportsarchives` | Archived video reports |
| `commentreportsarchives` | Archived comment reports |
| `cryptowalletaddresses` | Cryptocurrency wallet addresses for monetization |
| `links` | External links (social media, websites) |

### Repository Pattern

All repositories extend a **BaseRepository** class that provides common functionality including pagination parameter handling and timestamp utilities.

The **VideosRepository** is the most complex, providing methods for: finding videos by ID or database ID, finding all videos with optional filtering and pagination, counting videos, creating new video records, updating video data, deleting videos, incrementing view/like/dislike/comment counts, and finding currently streaming videos.

Other repositories follow similar patterns for their respective domains (comments, reports, live chat messages, monetization, links).

---

## Service Layer

Services encapsulate business logic and are injected via the Awilix dependency injection container.

### Base Service

All services extend the **BaseService** class which provides common functionality: a logger instance, timestamp utilities, safe JSON parsing with fallback values, an error logging wrapper for async operations, string sanitization, and unique ID generation.

### Key Services

| Service | Responsibility |
|---------|---------------|
| `VideosService` | Video CRUD, publishing, indexing, view tracking with debouncing |
| `StreamsService` | Live stream lifecycle, recording configuration |
| `CommentsService` | Comment CRUD, video comment count synchronization |
| `LiveChatService` | Live chat messages, history retrieval, message pruning |
| `StorageService` | File storage abstraction supporting filesystem and S3 |
| `CloudflareService` | Cache purging, Turnstile token verification |
| `IndexerService` | Communication with MoarTube indexer API |
| `AccountService` | Authentication, JWT token generation and validation |
| `ReportsService` | Video and comment report management and archiving |
| `SettingsService` | Node settings updates and persistence |
| `VideoUploadService` | File upload handling with validation |
| `UploadTrackerService` | Upload progress tracking |
| `WebSocketService` | WebSocket broadcast coordination across workers |
| `LinksService` | External links management |
| `MonetizationService` | Cryptocurrency wallet address management |

### Service Patterns

**View Tracking with Debouncing:** The VideosService implements debounced view counting to batch rapid view increments. Pending views are tracked in a Map, and a timer delays the database update to reduce write frequency.

**Storage Abstraction:** The StorageService provides a unified interface for file operations (save, get, delete, exists, list, copy) that works identically whether using filesystem or S3 storage. The underlying implementation is selected based on configuration.

---

## Controller Layer

Controllers handle HTTP request/response transformation and orchestrate calls to services.

### Base Controller

All controllers extend **BaseController** which provides: a controller name for logging, a logger instance, standardized success response methods (returning JSON with `isError: false`), standardized error response methods (returning JSON with `isError: true` and a message), file serving methods for static content, and chunk serving methods for range requests (video streaming).

### Response Format

All API responses follow a consistent JSON format. Success responses include `isError: false` along with any returned data. Error responses include `isError: true` and a `message` field describing the error.

---

## Routes

### Route Registration

Routes are registered through a central function in the routes index module. This function receives the Fastify instance and the DI container, then registers each route group with its appropriate URL prefix. Base routes handle root redirects, while domain-specific routes are registered under prefixes like `/status`, `/account`, `/videos`, `/streams`, `/comments`, `/node`, `/watch`, `/reports`, `/settings`, `/links`, and `/monetization`.

### API Endpoints

| Prefix | Purpose | Auth Required |
|--------|---------|---------------|
| `/status` | Health checks | Optional |
| `/account` | Authentication (sign-in) | No |
| `/videos` | Video operations (CRUD, search, comments, likes) | Mixed |
| `/streams` | Live streaming operations | Mixed |
| `/comments` | Comment operations | Mixed |
| `/node` | Node info and video search | No |
| `/watch` | Video playback pages (SSR) | No |
| `/watch/embed` | Embeddable video player | No |
| `/reports` | Report submission | No |
| `/reports/videos` | Video report management | Yes |
| `/reports/comments` | Comment report management | Yes |
| `/reports/archive/*` | Archived reports | Yes |
| `/settings` | Node settings management | Yes |
| `/links` | External links | Mixed |
| `/monetization` | Crypto wallet management | Yes |
| `/external/resources` | Static resources proxy | No |
| `/external/videos` | External video proxy | No |

### Route Pattern

Each route file exports a function that receives the Fastify instance (with Zod type provider) and the DI container. The function resolves required services from the container, instantiates the appropriate controller, and registers routes with their HTTP methods, paths, pre-handlers (for authentication), validation schemas (for params, query, and body), and handler functions bound to the controller.

Routes use either `fastify.authenticate` (requires valid JWT, returns 401 if missing) or `fastify.optionalAuthenticate` (sets auth info if present but doesn't require it) as pre-handlers.

---

## WebSocket System

### WebSocket Manager

The **WebSocketManager** class is the central coordinator for all WebSocket connections. It maintains a collection of registered message handlers, a set of connected clients, and provides client lifecycle management (adding/removing clients, handling disconnections).

Key responsibilities include: adding clients with metadata (client type, authentication status, unique ID, activity timestamp), removing clients on disconnect, routing incoming messages to appropriate handlers, broadcasting messages to all clients or to clients watching a specific video, and running a heartbeat timer to detect and remove stale connections.

### WebSocket Client Types

Clients are categorized by type: `node_peer` for inter-node communication, `admin` for administrative connections, `viewer` for regular viewers watching content, and `moartube_client` for the MoarTube Client application.

### Extended WebSocket

The standard WebSocket connection is extended with additional properties: socket type, optional video ID (for viewers watching specific content), authentication status, unique client ID, last activity timestamp, live chat username and color code, rate limiter state, and client IP address.

### WebSocket Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `live_stream_stats` | Server→Client | Viewer count updates |
| `chat_message` | Bidirectional | Live chat messages |
| `chat_history` | Server→Client | Chat history on join |
| `video_data` | Server→Client | Video state updates |
| `video_importing/imported/publishing/published` | Server→Client | Lifecycle events |
| `echo` | Server→Client | Generic broadcast |
| `registered` | Server→Client | Registration confirmation |
| `error` | Server→Client | Error notifications |
| `limited` | Server→Client | Rate limit notifications |

### Handler Pattern

WebSocket handlers extend an abstract **WebSocketHandler** base class. Each handler has a name property for logging, implements a `canHandle` method to determine if it should process a given message (based on event name or type), and implements a `handle` method to process the message with access to the client, parsed message, and a context object providing broadcast and send utilities.

**Registered Handlers:**
- **RegisterHandler**: Handles client registration and type assignment
- **EchoHandler**: Handles generic broadcast messages
- **VideoStatusHandler**: Handles video state queries
- **ChatJoinHandler**: Handles joining live chat rooms for specific videos
- **ChatMessageHandler**: Processes and broadcasts live chat messages with validation and rate limiting

---

## Configuration System

### Configuration Architecture

The configuration system is built around a central **Config singleton** that coordinates multiple configuration subsystems:

- **Env**: Runtime environment variables (NODE_ENV, IS_DOCKER_ENVIRONMENT, etc.)
- **Paths**: File system paths for data directories, config files, media storage
- **URLs**: URL building for indexer, aliaser, and node base URLs
- **AppConfig**: Static application configuration from config.json (indexer and aliaser endpoints, developer mode)
- **NodeSettings**: Runtime node settings from _node_settings.json (all configurable options)
- **NodeIdentification**: Optional node identity from _node_identification.json (for indexed nodes)

### Configuration Files

**config.json (Application Config):** Contains static configuration including developer mode flag, indexer service configuration (protocol, host, port), and aliaser service configuration (protocol, host, port).

**_node_settings.json (Node Settings):** Contains all runtime settings including: listening port and security settings, public-facing protocol/address/port, node name and about text, unique node ID, Base64-encoded bcrypt hashes for username and password, Cloudflare CDN settings (enabled flag, email, zone ID, API key), Cloudflare Turnstile settings (enabled flag, site key, secret key), feature flags (comments, likes, dislikes, reports, live chat enabled), database configuration (dialect and optional Postgres config), and storage configuration (mode and optional S3 config).

### Configuration Access

Configuration is accessed through a getter function that returns the Config singleton. This provides read-only access to: node settings (with all runtime options), paths (for file system locations), app config (for static settings), and utility methods like building the node base URL.

### Path Configuration

The Paths class manages all file system paths including: public directory for static assets, data directory (adjusted for Docker), views directory for EJS templates, images directory for node branding, videos directory for media storage, database directory for SQLite files, certificates directory for SSL, and specific file paths for node settings, identification, and the database file.

---

## Authentication & Security

### JWT Authentication

Authentication uses JSON Web Tokens (JWT). When a user signs in with valid credentials, the AccountService generates a token signed with the node's JWT secret. The token payload contains the username, and optionally an expiration (tokens expire in 1 day unless "remember me" is selected).

Tokens are extracted from the Authorization header using the Bearer scheme. The authentication plugin verifies tokens against the JWT secret and sets request properties for downstream handlers.

### Fastify Decorators

The authentication plugin adds two decorators to Fastify:
- **authenticate**: A pre-handler that requires a valid JWT token, throwing a 401 Unauthorized error if missing or invalid
- **optionalAuthenticate**: A pre-handler that extracts and validates tokens if present but doesn't require authentication

After authentication, request objects have properties: `isAuthenticated` (boolean), `username` (if authenticated), and `jwtToken` (the raw token).

### Credential Storage

Admin credentials are stored as Base64-encoded bcrypt hashes in the node settings file. During validation, the stored hash is decoded from Base64 and compared against the provided password using bcrypt's comparison function.

### Security Features

1. **Cloudflare Turnstile**: Optional human verification for actions like commenting and live chat
2. **HTML Sanitization**: All user-provided content is sanitized using sanitize-html to prevent XSS attacks
3. **Rate Limiting**: WebSocket messages are rate-limited to prevent abuse
4. **Password Protection**: Videos can be individually password-protected for private access

---

## Storage System

### Storage Modes

The storage system supports two modes: `filesystem` (default, stores files locally) and `s3provider` (stores files in an S3-compatible cloud storage service).

### StorageService Interface

The StorageService provides a unified interface for file operations regardless of storage mode:
- **File operations**: Save file with optional content type, get file as buffer, get file as stream, delete file, check if file exists
- **Metadata operations**: Get file metadata (size, content type, modified date), list files with prefix
- **Directory operations**: Delete directory recursively, copy file

The service automatically routes operations to the appropriate backend (filesystem or S3) based on configuration.

### Video Storage Structure

Videos are stored in a hierarchical directory structure under the videos directory:

Each video has its own directory named by video ID, containing:
- **images/**: Thumbnail, preview, and poster images (all JPEG format)
- **adaptive/m3u8/**: HLS streaming files including master manifest, per-resolution manifests, and segment directories containing TS files
- **progressive/**: Progressive download files organized by format (mp4/, webm/, ogv/) with resolution-named files

### S3 Configuration

For S3 storage, configuration includes: bucket name, force path style option (for non-AWS providers), AWS region, credentials (access key ID and secret), and optional custom endpoint URL for non-AWS S3-compatible services.

---

## External Integrations

### MoarTube Indexer

The **IndexerService** handles communication with the MoarTube Indexer API to enable video discovery on moartube.com. It provides methods for: submitting videos to the public index with full metadata and images, removing videos from the index, updating video information in the index, and updating node personalization (name, about text, node ID, external network settings).

The service handles error cases including request size limits (413 errors when content is too large) and provides appropriate error messages.

### Cloudflare Integration

The **CloudflareService** integrates with Cloudflare's API for two main purposes:

**CDN Cache Purging**: Methods to purge cached content when videos or node information changes, including watch pages, embed pages, node page, node images, adaptive manifests, and progressive videos.

**Turnstile Verification**: Validates Turnstile tokens submitted by users to verify they are human. When Turnstile is enabled, tokens are verified against Cloudflare's API before allowing actions like commenting or live chat.

---

## Cluster Architecture

### Master Process

The master process (defined in master.ts) is responsible for:
- Initializing the database connection and running schema migrations
- Generating a cryptographically secure JWT secret
- Forking worker processes (typically one per CPU core)
- Coordinating IPC messages between workers
- Running periodic tasks like indexer updates and content tracking
- Aggregating live stream statistics from all workers
- Handling worker crashes and respawning

### Worker Process

Worker processes (defined in worker.ts) each run:
- A database connection (using the same connection parameters as master)
- A Fastify HTTP server handling API requests
- A WebSocket server handling real-time connections
- IPC communication with the master for coordination

### IPC Messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `get_jwt_secret` | Worker→Master | Request JWT secret on startup |
| `get_jwt_secret_response` | Master→Worker | Provide JWT secret |
| `websocket_broadcast` | Worker→Master→Workers | Broadcast WebSocket message to all workers |
| `websocket_broadcast_chat_response` | Master→Workers | Broadcast chat message to specific video viewers |
| `live_stream_worker_stats_request` | Master→Workers | Request viewer counts from workers |
| `live_stream_worker_stats_response` | Worker→Master | Report viewer counts |
| `live_stream_worker_stats_update` | Master→Workers | Distribute aggregated viewer stats |
| `restart_database` | Master→Workers | Trigger database reconnection |

---

## Error Handling

### Error Hierarchy

The error system is built around an **AppError** base class that extends the native Error. AppError includes a status code, an isOperational flag (to distinguish expected errors from bugs), and a toJSON method for serialization.

Specific HTTP error classes extend AppError:
- **BadRequestError** (400): For malformed requests or invalid data
- **UnauthorizedError** (401): For missing or invalid authentication
- **ForbiddenError** (403): For authenticated users without permission
- **NotFoundError** (404): For resources that don't exist
- **ValidationError** (400): For validation failures, includes detailed field-level errors

### Global Error Handler

The Fastify error handler plugin catches all errors and formats appropriate responses. Operational errors (where isOperational is true) return their status code and serialized message. Unexpected errors are logged and return a generic 500 Internal Server Error response.

---

## Validation System

### Zod Schema Patterns

Request validation uses Zod schemas organized by domain. Common schemas define reusable validators for video IDs (string with format constraints), titles (string with length limits), formats (enum of allowed video formats), resolutions (enum of supported resolutions), and other shared fields.

Domain-specific schemas compose these common schemas into complete validation objects for route parameters (video ID in URL path), query strings (search terms, pagination, sorting), and request bodies (video import data, comment content, report details).

### Fastify Integration

The application uses fastify-type-provider-zod to integrate Zod validation with Fastify. Routes specify validation schemas for params, querystring, and body. Fastify automatically validates incoming requests against these schemas, returning 400 Bad Request errors for invalid data. TypeScript types are automatically inferred from schemas, providing type-safe request handling.

---

## Testing Strategy

### Test Framework

The project uses **Vitest** as the test runner with **V8 Coverage** for code coverage reporting.

### Configuration

Test configuration includes: node environment, test file patterns (all test and spec files in the tests directory), path alias resolution matching the TypeScript configuration, and coverage settings excluding non-source directories.

### NPM Scripts

Test commands are available for: running tests once, running in watch mode for development, and running with coverage reporting (text, JSON, and HTML formats).

---

## Development Workflow

### Prerequisites

- Node.js version 20.0.0 or higher
- npm package manager

### Setup

Clone the repository, navigate to the directory, and run npm install to install dependencies.

### Development Commands

- **npm run dev**: Start development server with hot reload using tsx
- **npm run typecheck**: Run TypeScript type checking without emitting files
- **npm run lint / lint:fix**: Run ESLint to check/fix code style issues
- **npm run format / format:check**: Run Prettier to format/check code formatting
- **npm run build**: Compile TypeScript to JavaScript for production
- **npm run start**: Run the compiled production build
- **npm run knip**: Detect unused code, dependencies, and exports

### Database Commands

- **npm run db:generate**: Generate migration files from schema changes
- **npm run db:migrate**: Apply pending migrations to the database
- **npm run db:push**: Push schema changes directly (development use)

### Code Quality

- **ESLint**: Strict TypeScript rules including no-any, consistent-type-imports, and floating-promises detection
- **Prettier**: Consistent code formatting across the codebase
- **Husky**: Git pre-commit hooks running lint-staged
- **TypeScript**: Strict mode with all enhanced type checks enabled

---

## Deployment

### NPM Global Installation

Install globally via npm and run using the moartube-node command. The node will start on the configured port (default 80).

### Docker

Docker images are available for both x86-64 and ARM64 architectures. The container exposes port 80, with the /data volume for persistent storage. Run with appropriate port mapping and restart policy.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | Set to `development` or `production` |
| `IS_DOCKER_ENVIRONMENT` | Set to `true` for Docker deployments (adjusts data paths) |
| `MOARTUBE_DATA_DIR` | Custom data directory path |
| `DATABASE_URL` | Database connection string (for PostgreSQL) |
| `DATABASE_DIALECT` | Set to `sqlite` or `postgresql` |
| `LOG_LEVEL` | Pino log level (debug, info, warn, error) |

---

## Key Patterns & Conventions

### TypeScript Path Aliases

The project uses path aliases for clean imports. The `@/` prefix maps to the src directory, with specific aliases for each subdirectory: @config, @core, @database, @services, @controllers, @routes, @plugins, @utils, @validators, @websocket, and @types.

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `video-upload.ts` |
| Classes | PascalCase | `VideosService` |
| Interfaces | PascalCase | `VideoWatchData` |
| Functions | camelCase | `getVideoById` |
| Constants | SCREAMING_SNAKE_CASE | `VIEW_DEBOUNCE_MS` |
| Database columns | snake_case | `video_id`, `is_published` |
| API params | camelCase | `videoId`, `isPublished` |

### Barrel Exports

Each module directory has an index.ts file that re-exports public interfaces, enabling clean imports from the directory path rather than specific files.

### Import Style

Type-only imports use the `import type` syntax to ensure they are erased at runtime. Value imports use standard import syntax. All imports from the project use the `.js` extension (required for ESM with TypeScript).

### Error Handling Pattern

Services wrap async operations in the `withErrorLogging` helper which catches errors, logs them with context, and re-throws. Controllers use try-catch blocks to handle errors and return appropriate HTTP responses using the standardized `sendSuccess` and `sendError` methods.

---

## Critical Files Reference

### Entry Point
- **src/moartube-node.ts**: Application bootstrap, loads config, starts master or worker based on cluster role

### Configuration
- **src/config/index.ts**: Main Config singleton with all configuration accessors
- **src/config/schema.ts**: Zod validation schemas for configuration structures

### Core Infrastructure
- **src/core/container.ts**: Awilix DI container setup and registration
- **src/core/cluster/master.ts**: Master process implementation
- **src/core/cluster/worker.ts**: Worker process implementation

### Database
- **src/database/connection.ts**: Database connection factory
- **src/database/schemas/sqlite/index.ts**: SQLite schema barrel exports
- **src/database/schemas/postgres/index.ts**: PostgreSQL schema barrel exports
- **src/database/repositories/videos.ts**: Videos repository implementation

### Services
- **src/services/videos.ts**: Core video service with CRUD and lifecycle management
- **src/services/streams.ts**: Live streaming service
- **src/services/storage.ts**: Storage abstraction service

### HTTP Layer
- **src/plugins/index.ts**: Fastify app factory and plugin registration
- **src/routes/index.ts**: Central route registration
- **src/plugins/authentication.ts**: JWT authentication plugin

### WebSocket
- **src/websocket/websocket-manager.ts**: WebSocket connection manager
- **src/websocket/handlers/base.ts**: Abstract handler base class

---

## Common Tasks & Modifications

### Adding a New API Endpoint

1. Create or update the validator schema in the validators/schemas directory
2. Add a service method in the appropriate service class
3. Add a controller method in the appropriate controller class
4. Register the route in the appropriate routes file with validation schema and authentication requirements

### Adding a New Database Table

1. Create schema files for both SQLite and PostgreSQL in the respective database/schemas directories
2. Export the new schema from the barrel export files
3. Create a repository class extending BaseRepository
4. Add the repository to the ContainerCradle interface
5. Register the repository in the DI container
6. Run the migration generation command

### Adding a New Service

1. Create a service file extending BaseService in the services directory
2. Export the service from the services barrel export
3. Add the service to the ContainerCradle interface
4. Register the service in the DI container with its dependencies

### Adding a WebSocket Handler

1. Create a handler class extending WebSocketHandler in the websocket/handlers directory
2. Implement the name property, canHandle method, and handle method
3. Register the handler in the WebSocketManager (either in registerHandlers or registerServiceHandlers depending on dependencies)

### Modifying Configuration

1. Update the Zod schema in config/schema.ts
2. Update the type interface in types/config.ts if needed
3. Update the Config class in config/index.ts to handle the new option

---

## Summary

MoarTube-Node is a well-structured TypeScript application following clean architecture principles:

- **Separation of Concerns**: Routes → Controllers → Services → Repositories
- **Dependency Injection**: Awilix container for loose coupling
- **Type Safety**: Strict TypeScript with Zod runtime validation
- **Multi-Process**: Node.js cluster for scalability
- **Storage Abstraction**: Filesystem or S3-compatible storage
- **Database Flexibility**: SQLite (local) or PostgreSQL (decentralized)
- **Real-Time**: WebSocket support for live features

The codebase is designed for maintainability, testability, and extensibility while providing a lightweight, resource-efficient video hosting solution.

---

*This document serves as the authoritative reference for AI agents working with the MoarTube-Node codebase.*
