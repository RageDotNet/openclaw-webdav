# OpenClaw WebDAV Community Plugin — Project Plan (v2.1, Final)
_Standalone-first architecture. OpenClaw integration deferred to Phase 5._
_Last updated: 2026-03-29. Authored by Nemotron, peer reviewed x2, revised._

---

## Phase 1: Repo Scaffold & Standalone Harness

### WD-01 — Initialize repository and project scaffolding
**Description**: Create repo with standard structure, TypeScript (strict), ESLint, Prettier, Vitest, and GitHub Actions CI.

**Acceptance Criteria**:
- Directory layout: `src/core/`, `src/adapter/`, `test/core/`, `test/adapter/`, `test/helpers/`
- `npm run build` compiles cleanly
- `npm test` runs (even empty)
- CI config present (GitHub Actions)
- `.gitignore` covers `node_modules`, `dist`, `.env`

**Dependencies**: None
**Estimated Effort**: 4h
**Notes/Hints**: Use OpenClaw plugin template if available. Reference lossless-claw for structure.

---

### WD-02 — Define core layer TypeScript interfaces
**Description**: Define all shared types and interfaces in `src/types.ts`. These are the contracts between every layer.

**Acceptance Criteria**:
- `ParsedRequest`: `{ method, path, query, headers: IncomingHttpHeaders, body: Buffer }`
- `HandlerResult`: `{ status: number, headers: OutgoingHttpHeaders, body: string | Buffer | null | undefined }` — `undefined` signals empty body (for 204), `null` is also acceptable empty
- `StorageAdapter`: `exists(path): Promise<boolean>`, `readFile(path): Promise<Buffer>`, `writeFile(path, data: Buffer): Promise<void>`, `createReadStream(path): Readable`, `createWriteStream(path): Writable`, `unlink(path): Promise<void>`, `rename(src, dest): Promise<void>`, `stat(path): Promise<StatResult>`, `readdir(path): Promise<string[]>`, `mkdir(path, opts?: {recursive?: boolean}): Promise<void>`, `rmdir(path): Promise<void>`, `copy(src, dest): Promise<void>`
- `StorageError`: typed error with `code: 'ENOENT' | 'EISDIR' | 'EACCES' | 'EEXIST' | 'ENOTEMPTY'` and `path: string`; storage methods throw this; core layer maps codes to HTTP statuses
- `LockManager`: `lock(path, owner: string, scope: 'exclusive'|'shared', depth: '0'|'infinity', timeoutSeconds: number): Promise<ILock>`, `unlock(path, token: string): Promise<void>`, `refresh(token, timeoutSeconds: number): Promise<void>`, `getLocks(path): Promise<ILock[]>`, `isLocked(path): Promise<boolean>`
- `ILock`: `{ token: string, path: string, owner: string, scope, depth, expiresAt: Date }`
- `ValidationResult`: `{ valid: true, normalizedPath: string } | { valid: false, errorCode: 403 | 400, reason: string }`
- All types exported; zero runtime code here

**Dependencies**: WD-01
**Estimated Effort**: 4h
**Notes/Hints**: Body as `Buffer` throughout — avoids encoding assumptions for binary files. `HandlerResult.body = undefined` is the canonical "no body" (204 responses).

---

### WD-03 — Create mock OpenClaw API factory
**Description**: `test/helpers/mockApi.ts` — exports `createMockApi(overrides?)` factory returning a mock of the OpenClaw plugin `api` object for use in adapter tests.

**Acceptance Criteria**:
- Returns object with: `id`, `name`, `pluginConfig` (configurable), `runtime.workspaceDir` (defaults to `os.tmpdir()/webdav-claw-test`), `logger` (debug/info/warn/error all `vi.fn()`), `registerHttpRoute: vi.fn()`, `resolvePath: (p) => p`
- Importable with zero OpenClaw installation
- `createMockApi({ pluginConfig: {...} })` overrides work

**Dependencies**: WD-01, WD-02
**Estimated Effort**: 4h

---

### WD-04 — Implement HTTP test harness
**Description**: `test/helpers/httpHarness.ts` — simulate HTTP requests to handler functions without a real server.

**Acceptance Criteria**:
- `createMockRequest(method, path, headers?, body?: Buffer | string)` returns mock req
- `createMockResponse()` returns mock res that captures: `statusCode`, `headers` (via `setHeader`/`writeHead`), `body` (via `write`/`end`)
- `invokeHandler(handler, req, res): Promise<void>` calls handler and settles
- Helpers to extract handler from `mockApi.registerHttpRoute.mock.calls[0][0].handler`
- Test verifying harness itself works

**Dependencies**: WD-01, WD-02, WD-03
**Estimated Effort**: 4h

---

### WD-05 — Implement path validation (core layer)
**Description**: Pure function `validatePath(inputPath: string, workspaceDir: string): ValidationResult` in `src/core/storage/pathValidation.ts`.

**Acceptance Criteria**:
- Decodes URL-encoded input exactly once
- Rejects encoded path separators (`%2F`, `%5C`) after decode → `{ valid: false, errorCode: 400, reason: "encoded separator" }`
- Rejects null bytes (`\x00`) and ASCII control chars → 400
- Rejects Windows reserved names (CON, PRN, AUX, NUL, COM1–9, LPT1–9) case-insensitive, with/without extension → 400
- Normalizes via `path.resolve()` after decode; paths resolving outside `workspaceDir` → `{ valid: false, errorCode: 403, reason: "outside workspace" }`
- Valid paths return `{ valid: true, normalizedPath: string }`
- Unit tests cover: traversal (`../`), double-encode (`%252e%252e`), Unicode NFC/NFD normalization edge cases, null byte, Windows reserved names, valid paths

**Dependencies**: WD-01, WD-02
**Estimated Effort**: 6h
**Notes/Hints**: Split across two work sessions. This is security-critical — test exhaustively.

---

### WD-06 — Implement storage adapters and compliance test suite
**Description**: `NodeFsStorageAdapter` (Node.js `fs/promises` + streams) and `MemoryStorageAdapter` (in-memory Map/tree). Shared compliance test suite validates both implement the interface identically.

**Acceptance Criteria**:
- `NodeFsStorageAdapter` implements full `StorageAdapter` including streaming
- `MemoryStorageAdapter` implements full `StorageAdapter` with in-memory tree — zero disk I/O
- Both throw `StorageError` with correct codes (`ENOENT`, `EISDIR`, etc.)
- Compliance test suite in `test/core/storageAdapter.spec.ts` passes for both adapters
- `MemoryStorageAdapter` exported from `test/helpers/` for use in all handler tests

**Dependencies**: WD-02, WD-05
**Estimated Effort**: 4h

---

### WD-07 — WebDAV error XML helper
**Description**: `buildErrorXml(code: number, condition: string): string` in `src/core/util/errorXml.ts`. Produces RFC 4918 §14-compliant XML error bodies.

**Acceptance Criteria**:
- Returns valid XML: `<?xml version="1.0" encoding="utf-8"?><D:error xmlns:D="DAV:"><D:{condition}/></D:error>`
- Covers standard conditions: `lock-token-matches-request-uri`, `no-conflicting-lock`, `precondition-failed`, etc.
- Unit tests verify output format matches RFC 4918 §14 examples
- Used by all handlers for 4xx/5xx responses

**Dependencies**: WD-01, WD-02
**Estimated Effort**: 2h

---

## Phase 2: Read-Only Protocol

---

### WD-08 — OPTIONS handler (core layer, with tests)
**Description**: `handleOptions(req: ParsedRequest): HandlerResult` in `src/core/protocol/options.handler.ts`.

**Acceptance Criteria**:
- Returns status 200
- `DAV: 1, 2` initially; updated to `DAV: 1, 2, 3` note when full compliance verified
- `Allow:` header lists all implemented methods (update as methods added)
- `MS-Author-Via: DAV` header (required for Windows WebDAV client)
- Body: empty (`undefined`)
- Unit tests via HTTP test harness

**Dependencies**: WD-01–WD-07
**Estimated Effort**: 2h

---

### WD-09 — GET handler (core layer, with tests)
**Description**: `handleGet(req: ParsedRequest, storage: StorageAdapter): Promise<HandlerResult>`. Streams file content.

**Acceptance Criteria**:
- Returns 200 + streamed file content via `storage.createReadStream()`
- Returns 404 for non-existent paths (via `StorageError ENOENT`)
- Returns 405 for directories
- Returns 403 for paths outside workspace (via `validatePath`)
- Sets `Content-Type` (mime from extension), `Content-Length`, `Last-Modified`, `ETag`
- Uses streaming — does not buffer entire file
- Unit tests with `MemoryStorageAdapter`

**Dependencies**: WD-05, WD-06, WD-07, WD-08
**Estimated Effort**: 4h

---

### WD-10 — HEAD handler (core layer, with tests)
**Description**: `handleHead` — same as GET but no body.

**Acceptance Criteria**:
- Returns same status and headers as GET
- `body: undefined` (no body sent)
- Unit tests verify header parity with GET, no body

**Dependencies**: WD-09
**Estimated Effort**: 2h

---

### WD-11 — PROPFIND handler Depth:0 (core layer, with tests)
**Description**: `handlePropfind` for `Depth: 0` — returns 207 multi-status XML for the requested resource only.

**Acceptance Criteria**:
- Returns 207 multi-status XML
- Properties: `creationdate`, `getcontentlength`, `getcontenttype`, `getetag`, `getlastmodified`, `resourcetype` (`<D:collection/>` for dirs, empty for files), `supportedlock`
- Correct `DAV:` XML namespace (`xmlns:D="DAV:"`)
- `owner` element stored/returned as opaque XML verbatim
- Returns 404 for non-existent resources
- PROPPATCH returns 405 (stub in same file)
- Unit tests with `MemoryStorageAdapter`

**Dependencies**: WD-05–WD-10
**Estimated Effort**: 4h
**Notes/Hints**: Use `xmlbuilder2`. XML namespace is `DAV:` per RFC 4918 §14/§15.

---

### WD-12 — PROPFIND handler Depth:1 and infinity (core layer, with tests)
**Description**: Extend `handlePropfind` to support `Depth: 1` (immediate children) and `Depth: infinity` (recursive).

**Acceptance Criteria**:
- `Depth: 1` returns resource + immediate children in single 207 response
- `Depth: infinity` returns resource + all descendants recursively
- When safety depth limit exceeded (configurable, default 20): return 403 with `DAV:` error XML — not silent truncation
- Unit tests: Depth:1 with nested dirs, Depth:infinity traversal, depth limit enforcement

**Dependencies**: WD-11
**Estimated Effort**: 4h

---

## Phase 3: Read-Write Protocol

---

### WD-13 — PUT handler (core layer, with tests)
**Description**: `handlePut(req: ParsedRequest, storage: StorageAdapter): Promise<HandlerResult>`. Streams request body to filesystem.

**Acceptance Criteria**:
- Streams `req.body` to `storage.createWriteStream()` — no full buffering
- Returns 201 for new files, 204 for replaced
- Creates intermediate parent directories if missing
- Returns 409 if a parent path component is a file
- Returns 403 for paths outside workspace
- If resource is locked, returns 423 (lock check integrated with WD-23 If: handler)
- Unit tests: create, overwrite, parent-is-file, path traversal rejection, large file (stream-only)

**Dependencies**: WD-05–WD-12
**Estimated Effort**: 4h

---

### WD-14 — DELETE handler (core layer, with tests)
**Description**: `handleDelete(req, storage): Promise<HandlerResult>`. Handles `Depth` semantics.

**Acceptance Criteria**:
- Returns 204 on success
- Returns 404 for non-existent resources
- `Depth: 0` on non-empty collection returns 409
- `Depth: infinity` recursively deletes collection
- Files deleted regardless of Depth header
- Returns 403 for paths outside workspace
- Returns 423 if locked without valid `If:` token
- Unit tests: file delete, empty dir, non-empty dir Depth:0 vs infinity

**Dependencies**: WD-05–WD-13
**Estimated Effort**: 4h

---

### WD-15 — MKCOL handler (core layer, with tests)
**Description**: `handleMkcol(req, storage): Promise<HandlerResult>`.

**Acceptance Criteria**:
- Returns 201 on success
- Returns 405 if path already exists
- Returns 409 if parent does not exist OR intermediate component is a file
- Returns 415 if request body is non-empty
- Returns 403 for paths outside workspace
- Unit tests: success, already-exists, missing-parent, body-present

**Dependencies**: WD-05–WD-14
**Estimated Effort**: 4h
**Notes/Hints**: Use `storage.mkdir()` WITHOUT recursive — per WebDAV spec, parent must exist.

---

### WD-16 — COPY handler (core layer, with tests)
**Description**: `handleCopy(req, storage): Promise<HandlerResult>`. Parses `Destination` and `Overwrite` headers per RFC 4918.

**Acceptance Criteria**:
- `Destination` header required; returns 400 if missing
- Same-host destination required; returns 502 for cross-server
- `Overwrite: T` (default) overwrites; `Overwrite: F` returns 412 if destination exists
- `Depth: 0` copies single resource; `Depth: infinity` copies collection recursively
- Returns 201 (created) or 204 (overwritten)
- Returns 404/409/403/423 per RFC 4918
- Unit tests: file copy, recursive collection, Overwrite:F conflict, cross-server rejection

**Dependencies**: WD-05–WD-15
**Estimated Effort**: 4h

---

### WD-17 — MOVE handler (core layer, with tests)
**Description**: `handleMove(req, storage): Promise<HandlerResult>`. Same Destination/Overwrite semantics as COPY.

**Acceptance Criteria**:
- Returns 201/204 per RFC 4918
- `Destination` required; 400 if missing; 502 if cross-server
- `Overwrite: F` returns 412 if destination exists
- Returns 404/409/403/423 per RFC 4918
- Unit tests: rename, cross-directory move, Overwrite conflict

**Dependencies**: WD-05–WD-16
**Estimated Effort**: 4h
**Notes/Hints**: Prefer `storage.rename()`; fall back to copy+delete for cross-device.

---

## Phase 4: Locking Protocol

---

### WD-18 — LockManager implementation (core layer, with tests)
**Description**: `InMemoryLockManager` in `src/core/locks/lockManager.ts` implementing `LockManager` interface.

**Acceptance Criteria**:
- In-memory `Map<token, ILock>` keyed by `opaquelocktoken:<uuid>` (`crypto.randomUUID()`)
- `lock()`: creates lock, stores with `expiresAt = now + timeoutSeconds`
- `unlock()`: removes lock; throws if token doesn't match
- `refresh()`: updates `expiresAt`
- `getLocks(path)`: returns all active non-expired locks covering this path (exact + depth:infinity ancestors)
- `isLocked(path)`: convenience boolean
- `setInterval` every 60s cleans up expired locks
- `owner` stored verbatim as opaque XML string
- Unit tests: add/remove, expiration, path lookup, concurrent locks, exclusive vs shared conflict

**Dependencies**: WD-02
**Estimated Effort**: 4h

---

### WD-19 — LOCK handler: XML parsing and storage (core layer, with tests)
**Description**: First half of `handleLock` — parse `lockinfo` XML body, handle `Timeout:` header, store lock.

**Acceptance Criteria**:
- Parses lockinfo XML per RFC 4918 §10.6: `locktype`, `lockscope`, `depth`, `owner` (stored as opaque XML string verbatim)
- XML namespace: `DAV:` (`xmlns:D="DAV:"`)
- Returns 400 for malformed XML or missing required elements
- `Timeout: Second-<n>` → n seconds; `Timeout: Infinite` → 86400s; default 3600s if absent
- Stores lock in `LockManager`
- Returns 423 if resource already has an exclusive lock held by different token (include lockdiscovery XML in 423 body)
- Unit tests: valid lockinfo, malformed XML 400, duplicate exclusive lock 423

**Dependencies**: WD-18
**Estimated Effort**: 4h
**Notes/Hints**: Use `@xmldom/xmldom` or `fast-xml-parser`. Owner element: treat as opaque, store and return verbatim.

---

### WD-20 — LOCK handler: response XML and headers (core layer, with tests)
**Description**: Second half of `handleLock` — build `lockdiscovery` XML response, set `Lock-Token` header.

**Acceptance Criteria**:
- Returns 200 with `Content-Type: application/xml`
- Response body: `lockdiscovery` XML containing `locktoken` element, per RFC 4918 §15
- `Lock-Token` response header: `<opaquelocktoken:<uuid>>`
- Supports `Depth: 0` and `Depth: infinity`
- Note in code: update `DAV:` header in OPTIONS (WD-08) to include `2` with this task
- Unit tests: verify response XML structure, Lock-Token header, Depth handling

**Dependencies**: WD-19
**Estimated Effort**: 4h

---

### WD-21 — UNLOCK handler (core layer, with tests)
**Description**: `handleUnlock(req, lockManager): Promise<HandlerResult>`.

**Acceptance Criteria**:
- `Lock-Token` header required; returns 400 if missing or not in `<opaquelocktoken:...>` format
- Removes matching lock; returns 204
- Returns 409 if token does not match any lock for the resource
- Returns 404 if resource doesn't exist

**Dependencies**: WD-18, WD-19, WD-20
**Estimated Effort**: 4h

---

### WD-22 — If: header precondition handling (core layer, with tests)
**Description**: RFC 4918 §10.4 `If:` header parser/evaluator in `src/core/protocol/preconditions.ts`. Throws typed `PreconditionError` to propagate 412/423 cleanly.

**Acceptance Criteria**:
- Parses `If:` header — focus on single untagged state token `(<opaquelocktoken:uuid>)` common case
- Evaluates token against `LockManager`
- Throws `PreconditionError({ code: 412 })` if token doesn't match
- Throws `PreconditionError({ code: 423 })` if resource is locked and no `If:` header present
- All write handlers (PUT, DELETE, COPY, MOVE, LOCK, UNLOCK) call `checkPreconditions()` and catch `PreconditionError` → return appropriate HandlerResult
- Unit tests: valid token passes, wrong token → 412, locked resource no token → 423

**Dependencies**: WD-18, WD-19, WD-20, WD-21
**Estimated Effort**: 4h
**Notes/Hints**: `PreconditionError` is a typed error class with `code` field. Reference RFC 4918 §10.4.

---

### WD-23 — Litmus WebDAV conformance testing
**Description**: Run the open-source `litmus` WebDAV test suite against the core layer via a thin standalone HTTP server wrapper. Validates protocol correctness before OpenClaw integration.

**Acceptance Criteria**:
- Thin test HTTP server in `test/conformance/server.ts` wires all core handlers to a real Node.js `http.createServer` (no OpenClaw)
- `npm run test:conformance` spins up server and runs `litmus` against it
- All basic and locking litmus tests pass (or failures are documented with justification)
- Instructions in CONTRIBUTING.md for running conformance tests

**Dependencies**: WD-08–WD-22
**Estimated Effort**: 4h
**Notes/Hints**: `litmus` is a standard WebDAV compliance test suite. Install via package manager or Docker. This is the quality gate before Phase 5.

---

## Phase 5: OpenClaw Integration

---

### WD-24 — HTTP adapter layer
**Description**: `src/adapter/http.ts` — translates OpenClaw `req`/`res` objects to/from `ParsedRequest`/`HandlerResult`. Zero WebDAV logic.

**Acceptance Criteria**:
- `parseOpenClawRequest(req): ParsedRequest` — extracts method, path, headers, body (as Buffer)
- `sendHandlerResult(res, result: HandlerResult): void` — writes status, headers, body to OpenClaw res
- Handles streaming body (`body` as `Readable`) in `sendHandlerResult`
- Adapter unit tests use `mockApi` + HTTP test harness (no real OpenClaw)
- No WebDAV protocol logic in this file

**Dependencies**: WD-02, WD-03, WD-04
**Estimated Effort**: 4h

---

### WD-25 — Config adapter
**Description**: `src/adapter/config.ts` — maps `api.pluginConfig` to typed `WebDavConfig`.

**Acceptance Criteria**:
- `parsePluginConfig(pluginConfig): WebDavConfig`
- Options: `rootPath` (default: `workspaceDir`), `readOnly` (default: false), `maxUploadSizeMb` (default: 100), `rateLimitPerIp` (default: `{ enabled: true, max: 100, windowSeconds: 10 }`)
- Validates all options on parse; throws descriptive error for invalid values
- Unit tests: defaults, valid values, invalid values

**Dependencies**: WD-02, WD-03
**Estimated Effort**: 4h

---

### WD-26 — Route registration adapter
**Description**: `src/adapter/routes.ts` — registers `/webdav/*` route via `api.registerHttpRoute`. Dispatches to core handlers.

**Acceptance Criteria**:
- Calls `api.registerHttpRoute({ path: "/webdav/*", auth: "gateway", handler })`
- Handler dispatches by HTTP method to correct core handler
- Returns 405 for unimplemented methods
- `readOnly: true` returns 405 for all write methods (PUT, DELETE, MKCOL, COPY, MOVE, LOCK, UNLOCK)
- `maxUploadSizeMb` enforced on PUT → 413 if exceeded
- Auth model note: OpenClaw gateway auth (`auth: "gateway"`) handles authentication; no per-user workspace scoping in v1 (document as future work)
- Adapter unit tests with `mockApi` verify registration + dispatch

**Dependencies**: WD-24, WD-25, WD-08–WD-22
**Estimated Effort**: 4h

---

### WD-27 — Plugin entry point and manifest
**Description**: `src/index.ts` — wires everything via `definePluginEntry`. `openclaw.plugin.json` with complete `configSchema`.

**Acceptance Criteria**:
- Uses `definePluginEntry` from `openclaw/plugin-sdk/plugin-entry` (reference lossless-claw)
- `registerFull(api)`: parse config → create `NodeFsStorageAdapter` → create `InMemoryLockManager` → register routes
- `openclaw.plugin.json` complete: id, name, version, extensions, `configSchema` matching `WebDavConfig`
- Plugin loads in OpenClaw without errors
- Note: this is the first task requiring a real OpenClaw installation

**Dependencies**: WD-25, WD-26
**Estimated Effort**: 4h

---

### WD-28 — Integration smoke tests
**Description**: Basic end-to-end validation against a real running OpenClaw instance.

**Acceptance Criteria**:
- `test/integration/smoke.md` documents `curl` commands for: OPTIONS, GET, PUT, PROPFIND, DELETE, LOCK/UNLOCK round-trip
- All smoke tests pass against local OpenClaw instance
- `readOnly: true` config verified to block writes (405)
- Documented setup instructions for running smoke tests

**Dependencies**: WD-27
**Estimated Effort**: 4h

---

### WD-29 — Integration buffer: core layer fixes
**Description**: Dedicated time budget for fixes to the core layer discovered during OpenClaw integration. Not optional — integration always surfaces edge cases.

**Acceptance Criteria**:
- All issues discovered in WD-27/WD-28 resolved
- Core layer unit tests updated to cover newly discovered edge cases
- No regression in conformance tests (WD-23)

**Dependencies**: WD-27, WD-28
**Estimated Effort**: 4h
**Notes/Hints**: Common issues: header case sensitivity, body encoding, path prefix stripping, streaming edge cases.

---

## Phase 6: Hardening & E2E Testing

---

### WD-30 — Path traversal hardening audit and dedicated tests
**Description**: Audit all path validation coverage, add missing attack vectors, add WARN logging.

**Acceptance Criteria**:
- Dedicated test file `test/core/pathTraversal.spec.ts`
- Covers: `../`, `%2e%2e%2f`, `%252e%252e%252f`, null byte, Windows reserved names, Unicode NFC/NFD normalization
- All traversal attempts logged at WARN with source IP and attempted path
- Zero new attack vectors can reach filesystem

**Dependencies**: WD-05, WD-28
**Estimated Effort**: 4h

---

### WD-31 — Rate limiting
**Description**: Sliding-window rate limiter per IP in `src/adapter/rateLimiter.ts`.

**Acceptance Criteria**:
- Default: 100 requests per 10s per IP (configurable via WD-25)
- Returns 429 with `Retry-After` header
- PROPFIND depth:infinity and bulk COPY/MOVE counted as single request
- Rate limit state in memory (v1)
- Unit tests: limit enforcement, Retry-After, bulk operation exemption

**Dependencies**: WD-25, WD-26
**Estimated Effort**: 4h

---

### WD-32 — E2E testing with real WebDAV clients
**Description**: End-to-end testing against running OpenClaw + plugin with real clients.

**Acceptance Criteria**:
- Tested with: Cyberduck, macOS Finder, Windows Explorer (Map Network Drive), davfs2
- Test matrix: list directory, upload, download, rename, delete, create folder, LOCK/UNLOCK
- All clients connect and perform basic CRUD
- Known client quirks documented in `COMPATIBILITY.md`
- Windows Explorer LOCK/UNLOCK and `If:` header flows verified

**Dependencies**: WD-28, WD-29, WD-30, WD-31
**Estimated Effort**: 8h
**Notes/Hints**: Budget a full day — four clients across different OSes. Windows Explorer is the pickiest.

---

## Phase 7: Docs & Community Release

---

### WD-33 — README and user documentation
**Description**: Comprehensive README with installation, configuration, and per-client setup guides.

**Acceptance Criteria**:
- Sections: overview, requirements (Node ≥18, OpenClaw version), installation, configuration reference
- Client guides: macOS Finder, Windows Explorer, Linux davfs2, iOS Files, Android (Solid Explorer), Cyberduck, rclone
- Security section: path scoping, auth model, rate limiting, read-only mode
- Troubleshooting: common errors per client, how to enable debug logging
- Cross-references `COMPATIBILITY.md`

**Dependencies**: WD-29, WD-32
**Estimated Effort**: 8h
**Notes/Hints**: 7 client guides + security + troubleshooting is a full day. Don't underestimate.

---

### WD-34 — CHANGELOG, LICENSE, CONTRIBUTING, and community packaging
**Description**: Final release packaging.

**Acceptance Criteria**:
- `CHANGELOG.md` — Keep a Changelog format; v0.1.0 entry
- `LICENSE` — MIT
- `CONTRIBUTING.md` — dev setup, **explicitly notes: full test suite runs with zero OpenClaw installation** (just `npm test`), PR process, coding conventions
- `package.json` — name, version (0.1.0), keywords (`webdav openclaw plugin`), `engines: { node: ">=18" }`
- Plugin submitted to clawhub.ai

**Dependencies**: WD-33
**Estimated Effort**: 4h

---

## Summary

| Phase | Tasks | Est. Effort |
|-------|-------|-------------|
| Phase 1: Repo Scaffold & Harness | WD-01 – WD-07 | ~26h |
| Phase 2: Read-Only Protocol | WD-08 – WD-12 | ~16h |
| Phase 3: Read-Write Protocol | WD-13 – WD-17 | ~20h |
| Phase 4: Locking Protocol | WD-18 – WD-23 | ~24h |
| Phase 5: OpenClaw Integration | WD-24 – WD-29 | ~24h |
| Phase 6: Hardening & E2E | WD-30 – WD-32 | ~16h |
| Phase 7: Docs & Release | WD-33 – WD-34 | ~12h |
| **Total** | **34 tasks** | **~138h (~34.5 solo days)** |

### Key Architectural Decisions

- **No OpenClaw imports until WD-24** — all Phases 1–4 are pure TypeScript, runnable standalone
- **`MemoryStorageAdapter`** (WD-06) enables all handler tests without disk I/O
- **Litmus conformance testing** (WD-23) is the quality gate before integration — protocol bugs caught standalone
- **`PreconditionError`** typed throw pattern (WD-22) keeps `If:` header logic clean across all write handlers
- **`owner` element** in LOCK stored/returned as opaque XML string — no parsing of owner structure
- **Integration buffer** (WD-29) explicitly budgeted — integration always surfaces surprises
- **CONTRIBUTING.md** explicitly advertises zero-OpenClaw test execution — key for community contributors

---

_Plan v2.1 final. Research → Plan → Review → Revise → Review → Final. 2026-03-29._
