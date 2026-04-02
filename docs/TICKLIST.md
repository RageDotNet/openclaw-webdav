# TICKLIST — OpenClaw WebDAV Plugin (v2.1)

## Instructions

Complete the tasks in this file **one-by-one**. You must always update the status of the task:
- Set it to `[TODO]` if it is not started
- Set it to `[IN PROGRESS]` when you start it
- Set it to `[DONE]` when the task is complete

The full description, acceptance criteria, and notes for each task are in:
`webdav-plugin-plan-v2-final.md`

Each implementation task is followed by a QA verification task. Complete the QA task before moving to the next implementation task.

---

## Phase 1: Repo Scaffold & Standalone Harness

- [TODO] WD-01: Initialize repository and project scaffolding
- [TODO] WD-01-QA: Verify repo structure, `npm run build` and `npm test` pass, CI config present
- [TODO] WD-02: Define core layer TypeScript interfaces (ParsedRequest, HandlerResult, StorageAdapter, LockManager, ValidationResult)
- [TODO] WD-02-QA: Verify all interfaces exported from `src/types.ts`, no runtime code, compiles cleanly
- [TODO] WD-03: Create mock OpenClaw API factory (`test/helpers/mockApi.ts`)
- [TODO] WD-03-QA: Verify `createMockApi()` works with overrides, importable with no OpenClaw installed
- [TODO] WD-04: Implement HTTP test harness (`test/helpers/httpHarness.ts`)
- [TODO] WD-04-QA: Verify harness can invoke a handler and capture status/headers/body; self-test passes
- [TODO] WD-05: Implement path validation — `validatePath()` with traversal/encoding/Windows name protections
- [TODO] WD-05-QA: Verify unit tests pass for `../`, double-encode, null byte, Windows reserved names, Unicode NFC/NFD, valid paths
- [TODO] WD-06: Implement `NodeFsStorageAdapter` + `MemoryStorageAdapter` + shared compliance test suite
- [TODO] WD-06-QA: Verify both adapters pass compliance suite; `MemoryStorageAdapter` usable in handler tests
- [TODO] WD-07: Implement WebDAV error XML helper (`buildErrorXml`)
- [TODO] WD-07-QA: Verify output is valid RFC 4918 §14 XML for all standard error conditions

---

## Phase 2: Read-Only Protocol

- [TODO] WD-08: Implement OPTIONS handler (DAV: 1,2, Allow header, MS-Author-Via)
- [TODO] WD-08-QA: Verify unit tests pass; correct headers returned; no body
- [TODO] WD-09: Implement GET handler (stream file, 200/404/403/405, Content-Type/Length/Last-Modified/ETag)
- [TODO] WD-09-QA: Verify unit tests pass with MemoryStorageAdapter; streaming confirmed (no full buffer)
- [TODO] WD-10: Implement HEAD handler (same headers as GET, no body)
- [TODO] WD-10-QA: Verify same headers as GET, body is undefined/empty
- [TODO] WD-11: Implement PROPFIND Depth:0 handler (207 multi-status XML, standard properties)
- [TODO] WD-11-QA: Verify 207 XML structure, correct DAV: namespace, all required properties present
- [TODO] WD-12: Implement PROPFIND Depth:1 and infinity handler (with safety depth limit)
- [TODO] WD-12-QA: Verify Depth:1 children, Depth:infinity recursion, depth limit returns 403 with error XML

---

## Phase 3: Read-Write Protocol

- [TODO] WD-13: Implement PUT handler (stream body, 201/204, parent dir creation, 409/403/423)
- [TODO] WD-13-QA: Verify unit tests pass; streaming confirmed; parent-is-file returns 409
- [TODO] WD-14: Implement DELETE handler (204/404/409, Depth semantics, 423 on locked)
- [TODO] WD-14-QA: Verify file delete, empty dir, non-empty dir Depth:0 vs infinity, locked resource 423
- [TODO] WD-15: Implement MKCOL handler (201/405/409/415/403)
- [TODO] WD-15-QA: Verify success, already-exists 405, missing-parent 409, body-present 415
- [TODO] WD-16: Implement COPY handler (Destination/Overwrite headers, Depth:0/infinity, 201/204/400/412/502)
- [TODO] WD-16-QA: Verify file copy, recursive collection, Overwrite:F conflict 412, cross-server 502
- [TODO] WD-17: Implement MOVE handler (same Destination/Overwrite semantics as COPY)
- [TODO] WD-17-QA: Verify rename, cross-directory move, Overwrite conflict, error codes match RFC 4918

---

## Phase 4: Locking Protocol

- [TODO] WD-18: Implement `InMemoryLockManager` (opaquelocktoken UUIDs, expiration, getLocks path lookup)
- [TODO] WD-18-QA: Verify add/remove, expiration cleanup, path lookup, exclusive vs shared conflict
- [TODO] WD-19: Implement LOCK handler pt1 — lockinfo XML parsing + Timeout header + store lock (400/423)
- [TODO] WD-19-QA: Verify valid lockinfo parse, malformed XML 400, duplicate exclusive lock 423
- [TODO] WD-20: Implement LOCK handler pt2 — lockdiscovery response XML + Lock-Token header
- [TODO] WD-20-QA: Verify response XML structure matches RFC 4918 §15, Lock-Token header format correct
- [TODO] WD-21: Implement UNLOCK handler (204/400/409/404)
- [TODO] WD-21-QA: Verify successful unlock, missing token 400, wrong token 409, missing resource 404
- [TODO] WD-22: Implement If: header precondition handling (PreconditionError, 412/423, all write handlers)
- [TODO] WD-22-QA: Verify valid token passes, wrong token 412, locked resource no token 423, all write handlers integrated
- [TODO] WD-23: Litmus WebDAV conformance testing (standalone HTTP server wrapper, `npm run test:conformance`)
- [TODO] WD-23-QA: Verify litmus basic + locking tests pass (or failures documented with justification)

---

## Phase 5: OpenClaw Integration

- [TODO] WD-24: Implement HTTP adapter layer (`parseOpenClawRequest` / `sendHandlerResult`)
- [TODO] WD-24-QA: Verify adapter unit tests pass with mockApi; no WebDAV logic in adapter file
- [TODO] WD-25: Implement config adapter (`pluginConfig` → `WebDavConfig` with validation)
- [TODO] WD-25-QA: Verify defaults correct, invalid config throws descriptive error, unit tests pass
- [TODO] WD-26: Implement route registration adapter (dispatch, readOnly enforcement, maxUploadSizeMb)
- [TODO] WD-26-QA: Verify mockApi.registerHttpRoute called correctly, readOnly blocks writes with 405, PUT over limit returns 413
- [TODO] WD-27: Implement plugin entry point (`src/index.ts`) and complete `openclaw.plugin.json` manifest
- [TODO] WD-27-QA: Verify plugin loads in OpenClaw without errors; configSchema validates correctly
- [TODO] WD-28: Integration smoke tests (curl commands for OPTIONS/GET/PUT/PROPFIND/DELETE/LOCK/UNLOCK)
- [TODO] WD-28-QA: Verify all smoke tests pass against local OpenClaw; readOnly config blocks writes
- [TODO] WD-29: Integration buffer — fix core layer issues discovered during OpenClaw integration
- [TODO] WD-29-QA: Verify no regressions in unit tests or litmus conformance after fixes

---

## Phase 6: Hardening & E2E Testing

- [TODO] WD-30: Path traversal hardening audit + dedicated test file + WARN logging
- [TODO] WD-30-QA: Verify all attack vectors rejected; WARN log emitted for traversal attempts
- [TODO] WD-31: Implement rate limiting (sliding-window per IP, 429/Retry-After, bulk op exemption)
- [TODO] WD-31-QA: Verify limit enforcement, Retry-After header, PROPFIND depth:infinity not false-limited
- [TODO] WD-32: E2E testing with real WebDAV clients (Cyberduck, macOS Finder, Windows Explorer, davfs2)
- [TODO] WD-32-QA: Verify all clients perform basic CRUD; Windows LOCK/UNLOCK flow verified; COMPATIBILITY.md written

---

## Phase 7: Docs & Community Release

- [TODO] WD-33: Write README and per-client setup guides (7 clients + security + troubleshooting)
- [TODO] WD-33-QA: Verify all sections present, client guides accurate, renders correctly on GitHub
- [TODO] WD-34: Write CHANGELOG, LICENSE, CONTRIBUTING, and package for clawhub
- [TODO] WD-34-QA: Verify CHANGELOG format, MIT license present, CONTRIBUTING notes standalone test execution, package.json correct, submitted to clawhub.ai

---

_68 items total (34 tasks + 34 QA checks). Full task specs in `memory/projects/webdav-plugin-plan-v2-final.md`._
