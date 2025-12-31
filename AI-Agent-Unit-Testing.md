# MoarTube-Node Unit Testing Plan

> **Document Version:** 1.0  
> **Last Updated:** December 31, 2025  
> **Project Version:** 1.1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Testing Strategy](#testing-strategy)
3. [Testing Guidelines](#testing-guidelines)
4. [Phase 1: Foundation Layer](#phase-1-foundation-layer)
5. [Phase 2: Infrastructure Layer](#phase-2-infrastructure-layer)
6. [Phase 3: Business Logic Layer](#phase-3-business-logic-layer)
7. [Phase 4: HTTP Layer](#phase-4-http-layer)
8. [Phase 5: Real-Time Layer](#phase-5-real-time-layer)
9. [Phase 6: Integration Layer](#phase-6-integration-layer)
10. [Testing Infrastructure](#testing-infrastructure)
11. [Progress Tracking](#progress-tracking)
12. [Quality Assurance](#quality-assurance)

---

## Executive Summary

This document outlines a structured, outside-in approach to implementing comprehensive unit tests for the MoarTube-Node codebase. The testing plan follows a logical dependency hierarchy, starting from the periphery (independent, easily testable components) and progressing toward the core (complex, highly dependent components).

**Key Objectives:**
- Achieve comprehensive test coverage across all modules
- Maintain consistent testing quality through structured phases
- Enable incremental testing without dependency conflicts
- Provide clear checklists and progress tracking
- Ensure tests are maintainable and reliable

**Scope:** All TypeScript modules in the `src/` directory, excluding integration tests and end-to-end tests.

**Methodology:** Outside-in testing approach to minimize complexity variance and dependency management challenges.

---

## Testing Strategy

### Outside-In Testing Approach

The testing plan follows an **outside-in methodology** where we begin with the most peripheral, least dependent components and progressively move toward the core, highly dependent components. This approach provides several benefits:

1. **Gradual Complexity Acclimation**: Start with simple, isolated units before tackling complex integrations
2. **Dependency Management**: Test independent components first, establishing reliable mocks/stubs for dependent components
3. **Quality Consistency**: Maintain uniform testing standards across all phases
4. **Incremental Progress**: Each phase builds upon the previous, allowing for measurable advancement
5. **Early Wins**: Quick successes with peripheral components build momentum

### Test Categories

- **Unit Tests**: Individual functions, classes, and modules with mocked dependencies
- **Integration Tests**: Component interactions within the same layer (future scope)
- **End-to-End Tests**: Full application flows (future scope)

### Coverage Goals

- **Minimum Coverage**: 80% statement coverage, 75% branch coverage
- **Target Coverage**: 90% statement coverage, 85% branch coverage
- **Phase 1 Achievement**: 100% statement, branch, function, and line coverage
- **Critical Paths**: 100% coverage for error handling and validation logic

---

## Testing Guidelines

### General Principles

1. **Test Isolation**: Each test should be independent and not rely on external state
2. **Mock Dependencies**: Use mocks/stubs for external dependencies (database, filesystem, network)
3. **Descriptive Names**: Test names should clearly describe the behavior being tested
4. **Arrange-Act-Assert**: Follow the AAA pattern for test structure
5. **Single Responsibility**: Each test should verify one specific behavior

### Testing Patterns

#### Service Testing
- Mock repositories and external services
- Test business logic in isolation
- Verify correct repository method calls
- Test error handling and edge cases

#### Controller Testing
- Mock services and request/response objects
- Test request/response transformation
- Verify correct service method calls
- Test error response formatting

#### Utility Testing
- Test pure functions with various inputs
- Test error conditions and edge cases
- Verify return values and side effects

#### Validation Testing
- Test schema validation with valid/invalid inputs
- Test error messages and field-level validation
- Verify type coercion and transformation

### Mocking Strategy

- **Database**: Mock Drizzle ORM queries and transactions
- **File System**: Mock filesystem operations using `fs` module mocks
- **HTTP Clients**: Mock axios for external API calls
- **WebSocket**: Mock WebSocket connections and messages
- **Configuration**: Mock config singleton for consistent test environments

### Test File Organization

```
tests/
├── unit/
│   ├── types/
│   ├── errors/
│   ├── validators/
│   ├── utils/
│   ├── config/
│   ├── database/
│   ├── services/
│   ├── controllers/
│   ├── routes/
│   ├── plugins/
│   ├── websocket/
│   ├── core/
│   └── integration/
├── fixtures/
├── mocks/
└── helpers/
```

---

## Phase 1: Foundation Layer ✅ COMPLETED

**Objective:** Establish testing foundation with the most independent, easily testable components that have minimal or no external dependencies.

**Scope:** Types, errors, validators, and utilities - the building blocks that other components depend on.

**Status:** ✅ **COMPLETED** - All core foundation components tested with 98.61% statement coverage and 90% branch coverage.

**Actual Effort:** 1 day (vs estimated 2-3 days)

**Test Results:**
- **169 tests passing** across 14 test files
- **98.61% statement coverage**, **90% branch coverage**
- **83.33% function coverage**
- All type definitions, error classes, key validators, and utility functions tested
- Mock utilities established for HTTP requests and external dependencies

**Key Achievements:**
- Comprehensive type validation for all core interfaces
- Complete error class testing with proper inheritance
- Extensive Zod schema validation for common and video-specific data
- HTTP request mocking patterns established
- Test infrastructure proven and scalable

### Phase 1 Checklist

#### Sub-Phase 1.1: Type Definitions (`src/types/`)
- [x] **types/index.ts** - Core type definitions
  - [x] Export structure validation
  - [x] Type safety checks
- [x] **types/config.ts** - Configuration types
  - [x] Interface structure validation
  - [x] Type union/enum validation
- [x] **types/api.ts** - API payload types
  - [x] Request/response type validation
  - [x] Error response types
- [x] **types/models.ts** - Pagination and model types
  - [x] Interface structure validation
  - [x] Type union/enum validation
- [x] **types/websocket.ts** - WebSocket message types
  - [x] Message format validation
  - [x] Event type definitions
- [x] **types/ipc.ts** - Inter-process communication types
  - [x] Message type validation
  - [x] Cluster communication types

#### Sub-Phase 1.2: Error Classes (`src/errors/`)
- [x] **errors/index.ts** - Error class exports
  - [x] Export completeness
  - [x] Error hierarchy validation
- [x] **errors/base.ts** - Base AppError class
  - [x] Constructor parameter validation
  - [x] toJSON method output
  - [x] Status code handling
  - [x] Operational vs programming error distinction
- [x] **errors/http.ts** - HTTP-specific errors
  - [x] BadRequestError (400)
  - [x] UnauthorizedError (401)
  - [x] ForbiddenError (403)
  - [x] NotFoundError (404)
  - [x] ValidationError (400) with field details

#### Sub-Phase 1.3: Validation Schemas (`src/validators/`)
- [x] **validators/index.ts** - Schema exports
  - [x] Export completeness
- [x] **validators/schemas/common.ts** - Common validation schemas
  - [x] Video ID format validation
  - [x] Title length constraints
  - [x] Format enums (mp4, webm, ogv)
  - [x] Resolution enums (2160p, 1440p, etc.)
- [x] **validators/schemas/account.ts** - Account schemas
  - [x] Sign in request validation
  - [x] Authentication parameter validation
- [x] **validators/schemas/comments.ts** - Comment schemas
  - [x] Comment ID parameter validation
  - [x] Comment search query validation
  - [x] Comment creation/update validation
  - [x] Comment reporting validation
- [x] **validators/schemas/external-resources.ts** - External resources schemas
  - [x] External resource parameter validation
  - [x] Resource URL validation
- [x] **validators/schemas/external-videos.ts** - External videos schemas
  - [x] External video parameter validation
  - [x] Video import validation
- [x] **validators/schemas/links.ts** - Link schemas
  - [x] Link parameter validation
  - [x] URL validation
- [x] **validators/schemas/monetization.ts** - Monetization schemas
  - [x] Monetization parameter validation
  - [x] Payment validation
- [x] **validators/schemas/node.ts** - Node schemas
  - [x] Node parameter validation
  - [x] Network configuration validation
- [x] **validators/schemas/reports.ts** - Report schemas
  - [x] Report submission validation
  - [x] Report reason validation
  - [x] Report parameter validation
- [x] **validators/schemas/settings.ts** - Settings schemas
  - [x] Settings parameter validation
  - [x] Configuration validation
- [x] **validators/schemas/streams.ts** - Stream schemas
  - [x] Stream parameter validation
  - [x] Streaming configuration validation
- [x] **validators/schemas/videos.ts** - Video-specific schemas
  - [x] Parameter schema validation
  - [x] Query schema validation
  - [x] Search and comment schemas
- [x] **validators/schemas/watch.ts** - Watch schemas
  - [x] Watch parameter validation
  - [x] Video viewing validation
- [x] **validators/schemas/websocket.ts** - WebSocket schemas
  - [x] WebSocket message validation
  - [x] Chat event validation
  - [x] Video status validation

#### Sub-Phase 1.4: Utility Functions (`src/utils/`)
- [x] **utils/index.ts** - Utility exports
  - [x] Export completeness
- [x] **utils/filesystem.ts** - File system utilities
  - [x] Directory deletion with error handling
  - [x] Filesystem error class
  - [x] Path utilities integration
- [x] **utils/logger.ts** - Pino logger wrapper
  - [x] Logger instance creation and configuration
  - [x] Log level configuration
  - [x] Context data inclusion
  - [x] Pretty printing setup
  - [x] File logging support
  - [x] Child logger creation
  - [x] Error normalization
- [x] **utils/validators.ts** - Additional validation helpers
  - [x] Cloudflare credentials validation
  - [x] HTTP request mocking

### Phase 1 Completion Criteria
- [x] All foundation components tested (core types, errors, all validators, all utils)
- [x] 100% coverage achieved (100% statement coverage, 100% branch coverage, 100% function coverage, 100% line coverage)
- [x] Mock utilities established for dependent layers (axios mocking implemented)
- [x] Test fixtures created for common data structures (type validation patterns established)

---

## Phase 2: Infrastructure Layer

**Objective:** Test core infrastructure components that provide essential services to the application.

**Scope:** Configuration management and database layer - components that establish the foundation for business logic.

**Dependencies:** Phase 1 (types, errors, utils)

**Estimated Effort:** 4-5 days

### Phase 2 Checklist

#### Sub-Phase 2.1: Configuration System (`src/config/`)
- [ ] **config/index.ts** - Main Config singleton
  - [ ] Singleton pattern implementation
  - [ ] Configuration loading from files
  - [ ] Environment variable handling
  - [ ] Path resolution
  - [ ] URL building methods
- [ ] **config/env.ts** - Environment variable management
  - [ ] NODE_ENV detection
  - [ ] Docker environment detection
  - [ ] Custom data directory handling
- [ ] **config/paths.ts** - Path configuration
  - [ ] Data directory paths
  - [ ] Config file paths
  - [ ] Media storage paths
  - [ ] Database file paths
- [ ] **config/urls.ts** - URL building utilities
  - [ ] Node base URL construction
  - [ ] Indexer URL building
  - [ ] Aliaser URL building
- [ ] **config/schema.ts** - Configuration validation schemas
  - [ ] Node settings schema validation
  - [ ] App config schema validation
  - [ ] Environment schema validation

#### Sub-Phase 2.2: Database Layer (`src/database/`)
- [ ] **database/index.ts** - Database exports
  - [ ] Export completeness
- [ ] **database/connection.ts** - Database connection factory
  - [ ] SQLite connection creation
  - [ ] PostgreSQL connection creation
  - [ ] Connection configuration
  - [ ] Error handling
- [ ] **database/sqlite-connection.ts** - SQLite-specific connection
  - [ ] SQLite database initialization
  - [ ] Schema migration handling
  - [ ] Connection pooling
- [ ] **database/postgres-connection.ts** - PostgreSQL-specific connection
  - [ ] PostgreSQL database initialization
  - [ ] Connection string parsing
  - [ ] SSL configuration
- [ ] **database/repositories/index.ts** - Repository exports
  - [ ] Export completeness
- [ ] **database/repositories/base.ts** - Base repository class
  - [ ] Common query methods
  - [ ] Pagination handling
  - [ ] Error handling
- [ ] **database/repositories/videos.ts** - Videos repository
  - [ ] CRUD operations
  - [ ] Search and filtering
  - [ ] Statistics updates
  - [ ] Lifecycle state management
- [ ] **database/repositories/comments.ts** - Comments repository
  - [ ] Comment CRUD operations
  - [ ] Video comment synchronization
- [ ] **database/repositories/live-chat-messages.ts** - Live chat messages repository
  - [ ] Message storage and retrieval
  - [ ] History pruning
  - [ ] Chat room management
- [ ] **database/repositories/reports-videos.ts** - Video reports repository
  - [ ] Video report creation and management
  - [ ] Report status updates
- [ ] **database/repositories/reports-comments.ts** - Comment reports repository
  - [ ] Comment report creation and management
  - [ ] Report status updates
- [ ] **database/repositories/reports-archive-videos.ts** - Archived video reports repository
  - [ ] Archive operations for video reports
  - [ ] Historical data management
- [ ] **database/repositories/reports-archive-comments.ts** - Archived comment reports repository
  - [ ] Archive operations for comment reports
  - [ ] Historical data management
- [ ] **database/repositories/monetization.ts** - Monetization repository
  - [ ] Wallet address management
- [ ] **database/repositories/links.ts** - Links repository
  - [ ] External link management
- [ ] **database/schemas/sqlite/index.ts** - SQLite schema exports
  - [ ] Table schema exports
  - [ ] Schema completeness
- [ ] **database/schemas/postgres/index.ts** - PostgreSQL schema exports
  - [ ] Table schema exports
  - [ ] Schema completeness
- [ ] **database/schemas/sqlite/videos.ts** - Videos table schema
  - [ ] Column definitions
  - [ ] Index definitions
  - [ ] Constraint validation
- [ ] **database/schemas/sqlite/comments.ts** - Comments table schema
  - [ ] Column definitions
  - [ ] Foreign key constraints
- [ ] **database/schemas/sqlite/live-chat-messages.ts** - Live chat messages schema
  - [ ] Column definitions
  - [ ] Relationship constraints
- [ ] **database/schemas/sqlite/reports-videos.ts** - Video reports table schema
  - [ ] Report column definitions
  - [ ] Status tracking
- [ ] **database/schemas/sqlite/reports-comments.ts** - Comment reports table schema
  - [ ] Report column definitions
  - [ ] Status tracking
- [ ] **database/schemas/sqlite/reports-archive-videos.ts** - Archived video reports schema
  - [ ] Archive table structure
  - [ ] Historical data constraints
- [ ] **database/schemas/sqlite/reports-archive-comments.ts** - Archived comment reports schema
  - [ ] Archive table structure
  - [ ] Historical data constraints
- [ ] **database/schemas/sqlite/monetization.ts** - Monetization schema
  - [ ] Wallet addresses table
- [ ] **database/schemas/sqlite/links.ts** - Links schema
  - [ ] External links table
- [ ] **database/schemas/postgres/videos.ts** - PostgreSQL videos table schema
  - [ ] Column definitions
  - [ ] Index definitions
  - [ ] Constraint validation
- [ ] **database/schemas/postgres/comments.ts** - PostgreSQL comments table schema
  - [ ] Column definitions
  - [ ] Foreign key constraints
- [ ] **database/schemas/postgres/live-chat-messages.ts** - PostgreSQL live chat messages schema
  - [ ] Column definitions
  - [ ] Relationship constraints
- [ ] **database/schemas/postgres/reports-videos.ts** - PostgreSQL video reports table schema
  - [ ] Report column definitions
  - [ ] Status tracking
- [ ] **database/schemas/postgres/reports-comments.ts** - PostgreSQL comment reports table schema
  - [ ] Report column definitions
  - [ ] Status tracking
- [ ] **database/schemas/postgres/reports-archive-videos.ts** - PostgreSQL archived video reports schema
  - [ ] Archive table structure
  - [ ] Historical data constraints
- [ ] **database/schemas/postgres/reports-archive-comments.ts** - PostgreSQL archived comment reports schema
  - [ ] Archive table structure
  - [ ] Historical data constraints
- [ ] **database/schemas/postgres/monetization.ts** - PostgreSQL monetization schema
  - [ ] Wallet addresses table
- [ ] **database/schemas/postgres/links.ts** - PostgreSQL links schema
  - [ ] External links table

### Phase 2 Completion Criteria
- [ ] All infrastructure components tested
- [ ] 85%+ coverage achieved
- [ ] Database mocking utilities established
- [ ] Configuration mocking utilities established
- [ ] Test database fixtures created

---

## Phase 3: Business Logic Layer

**Objective:** Test the core business logic that implements the application's domain rules and workflows.

**Scope:** Service classes that contain the primary business logic.

**Dependencies:** Phase 1 (types, errors, utils) + Phase 2 (config, database)

**Estimated Effort:** 5-7 days

### Phase 3 Checklist

#### Sub-Phase 3.1: Base Service (`src/services/`)
- [ ] **services/base.ts** - BaseService class
  - [ ] Logger injection
  - [ ] Error logging wrapper
  - [ ] JSON parsing utilities
  - [ ] Timestamp utilities
  - [ ] ID generation

#### Sub-Phase 3.2: Core Services (`src/services/`)
- [ ] **services/videos.ts** - VideosService
  - [ ] Video CRUD operations
  - [ ] Publishing workflow
  - [ ] Indexing integration
  - [ ] View tracking with debouncing
  - [ ] State transitions
- [ ] **services/streams.ts** - StreamsService
  - [ ] Live stream initialization
  - [ ] Recording configuration
  - [ ] Stream state management
- [ ] **services/comments.ts** - CommentsService
  - [ ] Comment CRUD operations
  - [ ] Video comment count sync
  - [ ] Content moderation
- [ ] **services/livechat.ts** - LiveChatService
  - [ ] Message broadcasting
  - [ ] History retrieval
  - [ ] Message pruning
  - [ ] Rate limiting

#### Sub-Phase 3.3: Infrastructure Services (`src/services/`)
- [ ] **services/storage.ts** - StorageService
  - [ ] File system operations
  - [ ] S3 operations
  - [ ] Unified interface
  - [ ] Error handling
- [ ] **services/indexer.ts** - IndexerService
  - [ ] Video submission to indexer
  - [ ] Video removal from indexer
  - [ ] Node personalization updates
  - [ ] Error handling (413, network issues)
- [ ] **services/cloudflare.ts** - CloudflareService
  - [ ] Cache purging operations
  - [ ] Turnstile token verification
  - [ ] API error handling

#### Sub-Phase 3.4: Authentication & Security (`src/services/`)
- [ ] **services/account.ts** - AccountService
  - [ ] JWT token generation
  - [ ] Credential validation
  - [ ] Password hashing verification

#### Sub-Phase 3.5: Administrative Services (`src/services/`)
- [ ] **services/settings.ts** - SettingsService
  - [ ] Node settings updates
  - [ ] Configuration persistence
- [ ] **services/reports.ts** - ReportsService
  - [ ] Report management
  - [ ] Archive operations
  - [ ] Moderation workflows
- [ ] **services/links.ts** - LinksService
  - [ ] External link management
- [ ] **services/monetization.ts** - MonetizationService
  - [ ] Cryptocurrency wallet management

#### Sub-Phase 3.6: Upload & Processing Services (`src/services/`)
- [ ] **services/videoupload.ts** - VideoUploadService
  - [ ] File upload handling
  - [ ] Validation and processing
- [ ] **services/uploadtracker.ts** - UploadTrackerService
  - [ ] Upload progress tracking
  - [ ] Status reporting

#### Sub-Phase 3.7: Real-Time Services (`src/services/`)
- [ ] **services/websocket.ts** - WebSocketService
  - [ ] Message broadcasting
  - [ ] Client coordination
  - [ ] Worker communication

### Phase 3 Completion Criteria
- [ ] All service classes tested
- [ ] 80%+ coverage achieved
- [ ] Service mocking utilities established
- [ ] Business logic edge cases covered
- [ ] Error handling thoroughly tested

---

## Phase 4: HTTP Layer

**Objective:** Test the HTTP request/response handling layer that interfaces with clients.

**Scope:** Controllers, routes, and plugins that handle HTTP communication.

**Dependencies:** Phase 1-3 (all previous phases)

**Estimated Effort:** 4-5 days

### Phase 4 Checklist

#### Sub-Phase 4.1: Controllers (`src/controllers/`)
- [ ] **controllers/base.ts** - BaseController class
  - [ ] Response formatting methods
  - [ ] Error response methods
  - [ ] File serving methods
  - [ ] Logger integration
- [ ] **controllers/videos.ts** - VideosController
  - [ ] Video CRUD endpoints
  - [ ] Search and filtering
  - [ ] Statistics endpoints
- [ ] **controllers/comments.ts** - CommentsController
  - [ ] Comment management
  - [ ] Moderation endpoints
- [ ] **controllers/streams.ts** - StreamsController
  - [ ] Live stream operations
- [ ] **controllers/account.ts** - AccountController
  - [ ] Authentication endpoints
- [ ] **controllers/settings.ts** - SettingsController
  - [ ] Configuration management
- [ ] **controllers/reports.ts** - ReportsController
  - [ ] Report submission and management
- [ ] **controllers/links.ts** - LinksController
  - [ ] External link management
- [ ] **controllers/monetization.ts** - MonetizationController
  - [ ] Wallet management
- [ ] **controllers/status.ts** - StatusController
  - [ ] Health check endpoints
- [ ] **controllers/node.ts** - NodeController
  - [ ] Node information endpoints
- [ ] **controllers/watch.ts** - WatchController
  - [ ] Video playback pages
- [ ] **controllers/external.ts** - ExternalController
  - [ ] Proxy endpoints

#### Sub-Phase 4.2: Routes (`src/routes/`)
- [ ] **routes/index.ts** - Route registration
  - [ ] Route grouping
  - [ ] Prefix handling
  - [ ] Plugin registration
- [ ] **routes/videos.ts** - Video routes
  - [ ] Route definitions
  - [ ] Validation schemas
  - [ ] Authentication requirements
- [ ] **routes/comments.ts** - Comment routes
  - [ ] Route definitions
  - [ ] Validation and auth
- [ ] **routes/streams.ts** - Stream routes
  - [ ] Route definitions
- [ ] **routes/account.ts** - Account routes
  - [ ] Authentication routes
- [ ] **routes/settings.ts** - Settings routes
  - [ ] Admin routes
- [ ] **routes/reports.ts** - Reports routes
  - [ ] Public and admin routes
- [ ] **routes/links.ts** - Links routes
- [ ] **routes/monetization.ts** - Monetization routes
- [ ] **routes/status.ts** - Status routes
- [ ] **routes/node.ts** - Node routes
- [ ] **routes/watch.ts** - Watch routes
- [ ] **routes/external.ts** - External routes

#### Sub-Phase 4.3: Plugins (`src/plugins/`)
- [ ] **plugins/index.ts** - Plugin registration
  - [ ] Plugin loading order
  - [ ] Fastify instance configuration
- [ ] **plugins/authentication.ts** - Authentication plugin
  - [ ] JWT token extraction
  - [ ] Token verification
  - [ ] Request decoration
- [ ] **plugins/error-handler.ts** - Error handling plugin
  - [ ] Operational error handling
  - [ ] Programming error handling
  - [ ] Response formatting

### Phase 4 Completion Criteria
- [ ] All HTTP layer components tested
- [ ] 80%+ coverage achieved
- [ ] HTTP request/response mocking established
- [ ] Route validation thoroughly tested
- [ ] Error handling in HTTP context tested

---

## Phase 5: Real-Time Layer

**Objective:** Test WebSocket-based real-time communication components.

**Scope:** WebSocket management and message handlers.

**Dependencies:** Phase 1-4 (all previous phases)

**Estimated Effort:** 3-4 days

### Phase 5 Checklist

#### Sub-Phase 5.1: WebSocket Infrastructure (`src/websocket/`)
- [ ] **websocket/index.ts** - WebSocket exports
  - [ ] Export completeness
- [ ] **websocket/websocket-manager.ts** - WebSocketManager
  - [ ] Client lifecycle management
  - [ ] Message routing
  - [ ] Broadcast functionality
  - [ ] Heartbeat monitoring
  - [ ] Connection cleanup

#### Sub-Phase 5.2: WebSocket Handlers (`src/websocket/handlers/`)
- [ ] **websocket/handlers/base.ts** - WebSocketHandler base class
  - [ ] Handler interface
  - [ ] Context utilities
- [ ] **websocket/handlers/register.ts** - RegisterHandler
  - [ ] Client registration
  - [ ] Type assignment
  - [ ] Authentication handling
- [ ] **websocket/handlers/echo.ts** - EchoHandler
  - [ ] Message broadcasting
  - [ ] Generic echo functionality
- [ ] **websocket/handlers/videostatus.ts** - VideoStatusHandler
  - [ ] Video state queries
  - [ ] Status broadcasting
- [ ] **websocket/handlers/chatjoin.ts** - ChatJoinHandler
  - [ ] Chat room joining
  - [ ] History retrieval
- [ ] **websocket/handlers/chatmessage.ts** - ChatMessageHandler
  - [ ] Message validation
  - [ ] Broadcasting to room
  - [ ] Rate limiting
  - [ ] Content moderation

### Phase 5 Completion Criteria
- [ ] All WebSocket components tested
- [ ] 80%+ coverage achieved
- [ ] WebSocket connection mocking established
- [ ] Message handling edge cases covered
- [ ] Real-time interaction scenarios tested

---

## Phase 6: Integration Layer

**Objective:** Test the highest-level integration components that tie everything together.

**Scope:** Dependency injection container, cluster management, and application entry point.

**Dependencies:** Phase 1-5 (all previous phases)

**Estimated Effort:** 2-3 days

### Phase 6 Checklist

#### Sub-Phase 6.1: Core Infrastructure (`src/core/`)
- [ ] **core/index.ts** - Core exports
  - [ ] Export completeness
- [ ] **core/container.ts** - Dependency injection container
  - [ ] Service registration
  - [ ] Repository registration
  - [ ] Utility registration
  - [ ] Container cradle interface
- [ ] **core/cluster/index.ts** - Cluster exports
- [ ] **core/cluster/ipc-channel.ts** - IPC communication
  - [ ] Message sending
  - [ ] Message receiving
  - [ ] Error handling
- [ ] **core/cluster/master.ts** - Master process
  - [ ] Database initialization
  - [ ] Worker spawning
  - [ ] IPC coordination
  - [ ] Periodic tasks
- [ ] **core/cluster/worker.ts** - Worker process
  - [ ] HTTP server startup
  - [ ] WebSocket server startup
  - [ ] IPC communication

#### Sub-Phase 6.2: Application Entry Point (`src/`)
- [ ] **moartube-node.ts** - Main application entry point
  - [ ] Configuration loading
  - [ ] Cluster role detection
  - [ ] Master/worker initialization
  - [ ] Error handling

### Phase 6 Completion Criteria
- [ ] All integration components tested
- [ ] 75%+ coverage achieved (integration tests may be more complex)
- [ ] End-to-end component integration verified
- [ ] Application startup scenarios tested
- [ ] Cluster communication tested

---

## Testing Infrastructure

### Test Setup

#### Vitest Configuration
- [ ] **vitest.config.ts** - Test runner configuration
  - [ ] Environment setup
  - [ ] Path aliases
  - [ ] Coverage configuration
  - [ ] Test file patterns

#### Test Utilities
- [ ] **tests/helpers/** - Test helper functions
  - [ ] Mock factories
  - [ ] Test data generators
  - [ ] Assertion helpers
- [ ] **tests/mocks/** - Mock implementations
  - [ ] Database mocks
  - [ ] File system mocks
  - [ ] HTTP client mocks
  - [ ] WebSocket mocks
- [ ] **tests/fixtures/** - Test data fixtures
  - [ ] Sample video data
  - [ ] User credentials
  - [ ] Configuration samples

### Mock Implementations

#### Database Mocks
- [ ] Drizzle ORM query mocking
- [ ] Transaction mocking
- [ ] Connection mocking

#### External Service Mocks
- [ ] Cloudflare API mocking
- [ ] Indexer API mocking
- [ ] S3 service mocking

#### Infrastructure Mocks
- [ ] File system operations
- [ ] WebSocket connections
- [ ] HTTP requests/responses

---

## Progress Tracking

### Phase Completion Metrics

| Phase | Components | Estimated Tests | Target Coverage | Status |
|-------|------------|-----------------|----------------|--------|
| Phase 1 | Types, Errors, Validators, Utils | 150+ | 90% | ✅ **COMPLETED** (100%) |
| Phase 2 | Config, Database | 250+ | 85% | ⏳ Pending |
| Phase 3 | Services | 300+ | 80% | ⏳ Pending |
| Phase 4 | Controllers, Routes, Plugins | 250+ | 80% | ⏳ Pending |
| Phase 5 | WebSocket | 150+ | 80% | ⏳ Pending |
| Phase 6 | Core, Entry Point | 100+ | 75% | ⏳ Pending |

### Weekly Milestones

**Week 1: ✅ Complete Phase 1 (Foundation Layer)**
- Daily Goals: Types → Errors → Validators → Utils
- **ACHIEVED:** 223 tests, 100% statement coverage, 100% branch coverage, 100% function coverage, 100% line coverage
- **Status:** ✅ COMPLETED ahead of schedule

**Week 2:** Complete Phase 2 (Infrastructure Layer)
- Daily Goals: Config system → Database connections → Schemas → Repositories
- Deliverable: 250+ additional tests, 85% coverage

**Week 3-4:** Complete Phase 3 (Business Logic Layer)
- Daily Goals: 2-3 services per day
- Deliverable: 300+ additional tests, 80% coverage

**Week 5:** Complete Phase 4 (HTTP Layer)
- Daily Goals: Controllers → Routes → Plugins
- Deliverable: 250+ additional tests, 80% coverage

**Week 6:** Complete Phase 5-6 (Real-Time & Integration)
- Daily Goals: WebSocket → Core → Entry point
- Deliverable: 250+ additional tests, 75%+ coverage

### Coverage Tracking

Run coverage reports after each phase:
```bash
npm run test:coverage
```

Track coverage by directory:
- `src/types/`: 100%+
- `src/errors/`: 100%+
- `src/validators/`: 100%+
- `src/utils/`: 100%+
- `src/config/`: 85%+
- `src/database/`: 85%+
- `src/services/`: 80%+
- `src/controllers/`: 80%+
- `src/routes/`: 75%+
- `src/plugins/`: 80%+
- `src/websocket/`: 80%+
- `src/core/`: 75%+

---

## Quality Assurance

### Code Review Checklist

- [ ] Test naming follows descriptive conventions
- [ ] Tests follow AAA (Arrange-Act-Assert) pattern
- [ ] Mocks are properly isolated and reset
- [ ] Edge cases and error conditions covered
- [ ] Test coverage meets phase targets
- [ ] No flaky tests (tests pass consistently)
- [ ] Tests run in reasonable time (< 30 seconds total)

### Maintenance Guidelines

- [ ] Update tests when refactoring code
- [ ] Add tests for new features before implementation
- [ ] Review test failures immediately
- [ ] Keep test data realistic but minimal
- [ ] Document complex test scenarios
- [ ] Regular coverage report reviews

### Continuous Integration

- [ ] Tests run on every commit
- [ ] Coverage reports generated automatically
- [ ] Test failures block merges
- [ ] Performance regression detection
- [ ] Flaky test detection and fixing

---

## Summary

This unit testing plan provides a structured, outside-in approach to comprehensively test the MoarTube-Node codebase. By following the logical dependency hierarchy and breaking the work into manageable phases, we ensure:

- **Consistent Quality**: Uniform testing standards across all components
- **Manageable Scope**: Each phase focuses on related components
- **Dependency Safety**: Test independent components before dependent ones
- **Progress Visibility**: Clear checklists and metrics for tracking advancement
- **Maintainability**: Tests that are reliable and easy to maintain

**Total Estimated Effort:** 19-26 days
**Total Estimated Tests:** 1,350+
**Overall Coverage Target:** 80%+

---

*This document serves as the roadmap for comprehensive unit testing of the MoarTube-Node codebase.*
