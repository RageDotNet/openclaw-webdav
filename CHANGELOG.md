# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-29

### Added

- Full RFC 4918 WebDAV implementation (DAV level 1 and 2)
- HTTP methods: OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, COPY, MOVE, PROPFIND, LOCK, UNLOCK
- `InMemoryLockManager` with exclusive/shared locks, expiration, and `opaquelocktoken` UUIDs
- `If:` header precondition handling with ETag validation, `DAV:no-lock` support, and OR/AND semantics
- `NodeFsStorageAdapter` for disk-based storage
- `MemoryStorageAdapter` for in-memory testing
- Path validation with traversal protection (null bytes, encoded separators, Windows reserved names, Unicode NFC normalization)
- WARN logging for traversal attempts with source IP
- HTTP adapter layer (`parseOpenClawRequest` / `sendHandlerResult`)
- Config adapter with validation (`parsePluginConfig`)
- Route registration adapter with readOnly enforcement and upload size limits
- Sliding-window per-IP rate limiter (100 req/10s default, bulk operation exemption)
- Plugin entry point (`definePluginEntry`) and `openclaw.plugin.json` manifest
- Conformance test server and `litmus` integration
- Integration smoke tests (`test/integration/smoke.md`)
- Compatibility documentation (`COMPATIBILITY.md`)

### Conformance Results

- `basic`: 16/16 (100%)
- `copymove`: 13/13 (100%)
- `locks`: 38/41 (92.7%) — 3 failures due to PROPPATCH stub (known limitation)
- `props`: 11/14 (78.6%) — 3 failures due to PROPPATCH stub (known limitation)

### Known Limitations

- PROPPATCH is not implemented (returns 405). Affects Windows Explorer custom properties and macOS Finder metadata. Basic CRUD operations are unaffected.
- Lock state is in-memory and lost on server restart.
- Shared lock semantics are accepted but not fully distinguished from exclusive locks.

[0.1.0]: https://github.com/openclaw-community/openclaw-webdav/releases/tag/v0.1.0
