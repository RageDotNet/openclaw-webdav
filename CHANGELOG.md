# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.9] - 2026-04-03

### Added

- **Plugin config `logging`:** when `true`, emit the same per-request `info` lines as `DEBUG_WEBDAV=1` on the gateway (either enables logging). Documented in README and `openclaw.plugin.json`.

## [0.1.8] - 2026-04-03

### Fixed

- **CI / npm publish:** stop using `npm install -g npm@^11.5.1` on GitHub Actions (could leave a broken global npm with `MODULE_NOT_FOUND: promise-retry`). Publish with `npx npm@11.12.1 publish --provenance` instead.

## [0.1.7] - 2026-04-02

### Added

- **Conformance:** run litmus against a remote WebDAV URL with optional Basic auth via `WEBDAV_CONFORMANCE_URL`, `WEBDAV_CONFORMANCE_PASSWORD`, and optional `WEBDAV_CONFORMANCE_USER` (see `.conformance/run-litmus.ts`).
- **GET (collections):** HTML directory index with clickable links for browsers; `routePrefix` is applied so links match the gateway mount (e.g. `/webdav/...`).

### Fixed

- **PROPFIND:** `D:href` values include the HTTP mount prefix so clients (e.g. Windows Explorer) see directory contents instead of an empty folder.
- **Conformance server:** correct `../src/` imports from `.conformance/server.ts` so the standalone litmus server starts from the package root.

### Changed

- Shared `normalizeRoutePrefix` in `src/core/util/routePrefix.ts` (used by PROPFIND and HTML listings).

## [0.1.6] - 2026-04-02

### Fixed

- **publish-npm:** drop pinned pnpm `version` in `release.yml` so `pnpm/action-setup` uses `packageManager` from `package.json` only (avoids `ERR_PNPM_BAD_PM_VERSION`).

## [0.1.5] - 2026-04-02

_No code changes — release-only to retry npm publish after Trusted Publishing workflow was updated to `release.yml` on npmjs.com._

## [0.1.4] - 2026-04-02

### Fixed

- **npm publish in CI:** Tags created by `gh release create` with the default `GITHUB_TOKEN` do not trigger separate `on: push: tags` workflows ([GitHub docs](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow)). Publishing now runs in **`release.yml`** immediately after a release is created. Configure npm **Trusted Publishing** with workflow filename **`release.yml`** (remove/replace any `publish.yml` entry).

## [0.1.3] - 2026-04-02

### Added

- GitHub Actions: **`release.yml`** creates a GitHub Release and version tag when `package.json` changes on `main`; **`publish.yml`** intended to publish to npm on tag push (see v0.1.4 — tag events from `GITHUB_TOKEN` do not start new workflows).

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

[0.1.9]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.9
[0.1.8]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.8
[0.1.7]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.7
[0.1.6]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.6
[0.1.5]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.5
[0.1.4]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.4
[0.1.3]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.3
[0.1.2]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.2
[0.1.1]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.1
[0.1.0]: https://github.com/RageDotNet/openclaw-webdav/releases/tag/v0.1.0
