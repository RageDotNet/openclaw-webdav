# WebDAV Plugin Feasibility Report
_Researched: 2026-03-28 by Nemotron (or-nemotron-super)_

## Summary

**Verdict: Feasible as a pure plugin — no core changes required.**

---

## Architecture Findings

**Plugin System**
OpenClaw uses a modular plugin architecture where plugins are defined via `openclaw.plugin.json` and can register:
- HTTP routes via `api.registerHttpRoute({ path, auth, match, handler })`
- Agent tools, channels, model providers, speech/TTS, and background services
- Lifecycle hooks and exclusive slots (memory, context engine)

**Web Endpoint**
The Gateway service exposes everything on a single multiplexed port (default 18789):
- WebSocket RPC, HTTP APIs, and Control UI
- OpenAI-compatible endpoints (`/v1/models`, `/v1/chat/completions`, `/v1/embeddings`, `/v1/responses`)
- Tool invocation endpoint (`/tools/invoke`)
- Admin Control UI at `/` by default
- Plugin HTTP routes can be mounted under arbitrary paths with configurable auth (`"gateway"`, `"none"`, etc.)

**File System Access**
Plugins can access the workspace via `api.runtime.workspaceDir` and standard Node.js `fs`/`path` modules. Existing plugins (diffs, nostr) demonstrate this pattern.

---

## WebDAV Feasibility

A WebDAV plugin could:
1. Register HTTP routes for `/webdav/*`
2. Handle WebDAV-specific HTTP methods: `PROPFIND`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `DELETE`, `LOCK`, `UNLOCK`
3. Map operations to the OpenClaw workspace filesystem
4. Reuse existing Gateway authentication mechanisms

**No core modifications required.**

---

## Estimated Complexity: Moderate to High

Primary challenges:
- Implementing WebDAV protocol (XML-based multi-status responses, property handling)
- Handling locking mechanisms (optional but required for some clients like Windows Explorer)
- Mapping WebDAV paths to OpenClaw workspace structure
- Correct HTTP status codes and WebDAV-specific headers
- Depth-infinity processing for collections

**Dependencies:**
- XML parser: `@xmldom/xmldom` or similar lightweight library
- Otherwise standard Node.js — no heavy dependencies needed

---

## Recommended Implementation Path

### Phase 1 — Skeleton + Read-Only
- Create plugin skeleton with `openclaw.plugin.json`
- Register HTTP route for `/webdav/*` with `auth: "gateway"`
- Implement `PROPFIND` and `GET`/`HEAD` handlers
- Map to workspace files using `api.runtime.workspaceDir`

### Phase 2 — Full Read-Write
- Add `MKCOL` (create folder), `DELETE`, `MOVE`, `COPY`
- Implement property handling: `DAV: getcontentlength`, `getlastmodified`, `resourcetype`, etc.

### Phase 3 — Locking & Hardening
- Add `LOCK`/`UNLOCK` support (needed for Windows Explorer, some editors)
- URL encoding edge cases and path traversal hardening
- Test with: Cyberduck, macOS Finder, Windows Explorer, `davfs2`

---

## Integration Considerations
- Determine workspace mapping scope (root vs subdirectory)
- Consider a scoped "WebDAV view" of specific workspace areas for safety
- Evaluate performance for large directory listings
