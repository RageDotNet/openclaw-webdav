# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-04-02

### Added

- GitHub Actions: **`release.yml`** creates a GitHub Release and `v*` tag when `package.json` version changes on `main`; **`publish.yml`** publishes to npm on tag push (npm **Trusted Publishing** / OIDC — no `NPM_TOKEN` in secrets when configured on npmjs.com).

### Changed

- npm package name **`@ragenet/openclaw-webdav`** with `publishConfig.access: public` and a **`files`** whitelist for the published tarball.
- Documentation and metadata use the canonical repo **https://github.com/RageDotNet/openclaw-webdav** (replacing incorrect `openclaw-community` links).

## [0.1.2] - 2026-04-02

### Changed

- Refactor only (no protocol changes): shared helpers `formatWebDavEtag`, `removeRecursive`, and `parseWebDavDestination` for COPY/MOVE, PROPFIND, preconditions, and GET headers.
- `openclaw.plugin.json` version aligned with the npm package.
- ESLint uses `tsconfig.eslint.json` (covers `src` and `test`) and ignores `dist/`.
- Declared **Node.js ≥ 22** in `package.json` `engines` (matches OpenClaw).

### Fixed

- GitHub Actions: run CI on Node 22 only; Vitest resolves `openclaw/plugin-sdk/browser-support` via the package `exports` subpath (no `.js` suffix).
- Route adapter tests: mock request emits body/`end` after stream listeners are registered so handlers are not blocked by a slow OpenClaw dynamic import.

### Removed

- Unused code and types (e.g. `DEPTH_LIMIT_SENTINEL`, unused `ParsedLockInfo` fields, placeholder test file).

## [0.1.1] - 2026-03-30

### Added

- Gateway-aligned HTTP auth for WebDAV: **Basic** (password = gateway token or password; username ignored) and **Bearer**; resolves auth via OpenClaw when available with env/config fallback.
- **GET on collections** returns a UTF-8 plain-text directory listing (one name per line; directories end with `/`).
- Configurable **`httpMountPath`** for the plugin HTTP route; registration uses **`replaceExisting`** so the plugin can take over its prefix.

### Fixed

- Plugin load, route registration, and install scan behavior with OpenClaw.

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

[0.1.3]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.3
[0.1.2]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.2
[0.1.1]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.1
[0.1.0]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.0
