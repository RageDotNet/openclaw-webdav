---
task: Build a CLI todo app in TypeScript
test_command: "npm test"
---
# TICKLIST — OpenClaw WebDAV Plugin (v2.1)

## Ralph Instructions

## Ralph Instructions

1. Work on the next incomplete criterion (marked [ ])
2. Check off completed criteria (change [ ] to [x])
3. Always update the criteria file
4. Commit your changes frequently
5. When ALL criteria are [x], output: `<ralph>COMPLETE</ralph>`
6. If stuck on the same issue 3+ times, output: `<ralph>GUTTER</ralph>`

The full description, acceptance criteria, and notes for each task are in:
`webdav-plugin-plan-v2-final.md`

Each implementation task is followed by a QA verification task. Complete the QA task before moving to the next implementation task.

## Phase 1: Repo Scaffold & Standalone Harness

- [x] WD-01: Initialize repository and project scaffolding
- [x] WD-01-QA: Verify repo structure, `npm run build` and `npm test` pass, CI config present
- [x] WD-02: Define core layer TypeScript interfaces (ParsedRequest, HandlerResult, StorageAdapter, LockManager, ValidationResult)
- [x] WD-02-QA: Verify all interfaces exported from `src/types.ts`, no runtime code, compiles cleanly
- [x] WD-03: Create mock OpenClaw API factory (`test/helpers/mockApi.ts`)
- [x] WD-03-QA: Verify `createMockApi()` works with overrides, importable with no OpenClaw installed
- [x] WD-04: Implement HTTP test harness (`test/helpers/httpHarness.ts`)
- [x] WD-04-QA: Verify harness can invoke a handler and capture status/headers/body; self-test passes
- [x] WD-05: Implement path validation — `validatePath()` with traversal/encoding/Windows name protections
- [x] WD-05-QA: Verify unit tests pass for `../`, double-encode, null byte, Windows reserved names, Unicode NFC/NFD, valid paths
- [x] WD-06: Implement `NodeFsStorageAdapter` + `MemoryStorageAdapter` + shared compliance test suite
- [x] WD-06-QA: Verify both adapters pass compliance suite; `MemoryStorageAdapter` usable in handler tests
- [x] WD-07: Implement WebDAV error XML helper (`buildErrorXml`)
- [x] WD-07-QA: Verify output is valid RFC 4918 §14 XML for all standard error conditions

## Phase 2: Read-Only Protocol

- [x] WD-08: Implement OPTIONS handler (DAV: 1,2, Allow header, MS-Author-Via)
- [x] WD-08-QA: Verify unit tests pass; correct headers returned; no body
- [x] WD-09: Implement GET handler (stream file, 200/404/403/405, Content-Type/Length/Last-Modified/ETag)
- [x] WD-09-QA: Verify unit tests pass with MemoryStorageAdapter; streaming confirmed (no full buffer)
- [x] WD-10: Implement HEAD handler (same headers as GET, no body)
- [x] WD-10-QA: Verify same headers as GET, body is undefined/empty
- [x] WD-11: Implement PROPFIND Depth:0 handler (207 multi-status XML, standard properties)
- [x] WD-11-QA: Verify 207 XML structure, correct DAV: namespace, all required properties present
- [x] WD-12: Implement PROPFIND Depth:1 and infinity handler (with safety depth limit)
- [x] WD-12-QA: Verify Depth:1 children, Depth:infinity recursion, depth limit returns 403 with error XML

## Phase 3: Read-Write Protocol

- [x] WD-13: Implement PUT handler (stream body, 201/204, parent dir creation, 409/403/423)
- [x] WD-13-QA: Verify unit tests pass; streaming confirmed; parent-is-file returns 409
- [x] WD-14: Implement DELETE handler (204/404/409, Depth semantics, 423 on locked)
- [x] WD-14-QA: Verify file delete, empty dir, non-empty dir Depth:0 vs infinity, locked resource 423
- [x] WD-15: Implement MKCOL handler (201/405/409/415/403)
- [x] WD-15-QA: Verify success, already-exists 405, missing-parent 409, body-present 415
- [x] WD-16: Implement COPY handler (Destination/Overwrite headers, Depth:0/infinity, 201/204/400/412/502)
- [x] WD-16-QA: Verify file copy, recursive collection, Overwrite:F conflict 412, cross-server 502
- [x] WD-17: Implement MOVE handler (same Destination/Overwrite semantics as COPY)
- [x] WD-17-QA: Verify rename, cross-directory move, Overwrite conflict, error codes match RFC 4918

## Phase 4: Locking Protocol

- [x] WD-18: Implement `InMemoryLockManager` (opaquelocktoken UUIDs, expiration, getLocks path lookup)
- [x] WD-18-QA: Verify add/remove, expiration cleanup, path lookup, exclusive vs shared conflict
- [x] WD-19: Implement LOCK handler pt1 — lockinfo XML parsing + Timeout header + store lock (400/423)
- [x] WD-19-QA: Verify valid lockinfo parse, malformed XML 400, duplicate exclusive lock 423
- [x] WD-20: Implement LOCK handler pt2 — lockdiscovery response XML + Lock-Token header
- [x] WD-20-QA: Verify response XML structure matches RFC 4918 §15, Lock-Token header format correct
- [x] WD-21: Implement UNLOCK handler (204/400/409/404)
- [x] WD-21-QA: Verify successful unlock, missing token 400, wrong token 409, missing resource 404
- [x] WD-22: Implement If: header precondition handling (PreconditionError, 412/423, all write handlers)
- [x] WD-22-QA: Verify valid token passes, wrong token 412, locked resource no token 423, all write handlers integrated
- [x] WD-23: Litmus WebDAV conformance testing (standalone HTTP server wrapper, `npm run test:conformance`)
- [x] WD-23-QA: Verify litmus basic + locking tests pass (or failures documented with justification)
  <!-- Results: basic 100%, copymove 100%, locks 92.7% (3 failures: owner_modify PROPPATCH stub — known limitation) -->

## Phase 5: OpenClaw Integration

- [x] WD-24: Implement HTTP adapter layer (`parseOpenClawRequest` / `sendHandlerResult`)
- [x] WD-24-QA: Verify adapter unit tests pass with mockApi; no WebDAV logic in adapter file
- [x] WD-25: Implement config adapter (`pluginConfig` → `WebDavConfig` with validation)
- [x] WD-25-QA: Verify defaults correct, invalid config throws descriptive error, unit tests pass
- [x] WD-26: Implement route registration adapter (dispatch, readOnly enforcement, maxUploadSizeMb)
- [x] WD-26-QA: Verify mockApi.registerHttpRoute called correctly, readOnly blocks writes with 405, PUT over limit returns 413
- [ ] WD-27: Implement plugin entry point (`src/index.ts`) and complete `openclaw.plugin.json` manifest
- [ ] WD-27-QA: Verify plugin loads in OpenClaw without errors; configSchema validates correctly
- [ ] WD-28: Integration smoke tests (curl commands for OPTIONS/GET/PUT/PROPFIND/DELETE/LOCK/UNLOCK)
- [ ] WD-28-QA: Verify all smoke tests pass against local OpenClaw; readOnly config blocks writes
- [ ] WD-29: Integration buffer — fix core layer issues discovered during OpenClaw integration
- [ ] WD-29-QA: Verify no regressions in unit tests or litmus conformance after fixes

## Phase 6: Hardening & E2E Testing

- [ ] WD-30: Path traversal hardening audit + dedicated test file + WARN logging
- [ ] WD-30-QA: Verify all attack vectors rejected; WARN log emitted for traversal attempts
- [ ] WD-31: Implement rate limiting (sliding-window per IP, 429/Retry-After, bulk op exemption)
- [ ] WD-31-QA: Verify limit enforcement, Retry-After header, PROPFIND depth:infinity not false-limited
- [ ] WD-32: E2E testing with real WebDAV clients (Cyberduck, macOS Finder, Windows Explorer, davfs2)
- [ ] WD-32-QA: Verify all clients perform basic CRUD; Windows LOCK/UNLOCK flow verified; COMPATIBILITY.md written

## Phase 7: Docs & Community Release

- [ ] WD-33: Write README and per-client setup guides (7 clients + security + troubleshooting)
- [ ] WD-33-QA: Verify all sections present, client guides accurate, renders correctly on GitHub
- [ ] WD-34: Write CHANGELOG, LICENSE, CONTRIBUTING, and package for clawhub
- [ ] WD-34-QA: Verify CHANGELOG format, MIT license present, CONTRIBUTING notes standalone test execution, package.json correct, submitted to clawhub.ai

_68 items total (34 tasks + 34 QA checks). Full task specs in `webdav-plugin-plan-v2-final.md`._
