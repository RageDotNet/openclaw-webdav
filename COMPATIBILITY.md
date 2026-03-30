# WebDAV Client Compatibility

This document describes compatibility with common WebDAV clients and any known quirks.

## Authentication

Use **HTTP Basic** with **any username**; set the **password** to the **gateway token** (token
mode) or **gateway password** (password mode). **`Authorization: Bearer`** with the same secret
also works (e.g. for `curl`).

## Test Matrix

| Operation | Cyberduck | macOS Finder | Windows Explorer | davfs2 | curl |
|-----------|-----------|--------------|-----------------|--------|------|
| List directory (PROPFIND) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Upload file (PUT) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Download file (GET) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rename file (MOVE) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Delete file (DELETE) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create folder (MKCOL) | ✓ | ✓ | ✓ | ✓ | ✓ |
| LOCK/UNLOCK | ✓ | ✓ | ✓ | ✓ | ✓ |
| Copy file (COPY) | ✓ | ✓ | ✓ | ✓ | ✓ |

> **Note**: The above matrix reflects expected behavior based on RFC 4918 conformance testing
> (litmus: basic 100%, copymove 100%, locks 92.7%). Real-client E2E testing requires a live
> OpenClaw installation and is deferred to community contributors.

---

## Client-Specific Notes

### Cyberduck

- Fully supports WebDAV (DAV level 1 and 2)
- Uses PROPFIND for directory listing
- Supports LOCK/UNLOCK for file editing
- Connection URL: `http://localhost:18789/webdav/`
- **Known quirk**: Cyberduck may send `Depth: 1` on PROPFIND for collections even when
  only listing the root; this is handled correctly.

### macOS Finder

- Connect via Finder → Go → Connect to Server → `http://localhost:18789/webdav/`
- Supports LOCK/UNLOCK (used when editing files in-place)
- **Known quirk**: macOS Finder sends a `Translate: f` header on some requests (Microsoft
  FrontPage extension); this header is ignored by our implementation.
- **Known quirk**: Finder may send `PROPFIND` with a custom namespace for `.DS_Store`
  metadata; these properties are silently ignored (PROPPATCH returns 405).

### Windows Explorer (Map Network Drive)

- Map via `\\localhost@18789\webdav` or `http://localhost:18789/webdav/`
- Requires LOCK/UNLOCK support for write operations (implemented)
- **Known quirk**: Windows Explorer uses the `If:` header with both lock token and ETag
  conditions (e.g., `If: (<opaquelocktoken:...> ["etag"])`). Our implementation validates
  both conditions correctly.
- **Known quirk**: Windows sends `PROPPATCH` to set custom properties (e.g., Win32 file
  attributes). Our PROPPATCH returns 405 (not implemented). This may cause warnings in
  Windows Explorer but does not prevent basic CRUD operations.
- **Known quirk**: Windows Explorer requires the server to return `MS-Author-Via: DAV`
  in OPTIONS responses. This is implemented.

### davfs2 (Linux)

- Mount via: `mount -t davfs http://localhost:18789/webdav/ /mnt/webdav`
- Requires `/etc/davfs2/davfs2.conf` or `/etc/davfs2/secrets` for credentials
- **Known quirk**: davfs2 uses a local cache and may not reflect server-side changes
  immediately. Use `umount` and remount to force a refresh.
- **Known quirk**: davfs2 sends `Depth: infinity` on some PROPFIND requests; this is
  handled with a safety limit (returns 403 for depth > 20 levels).

---

## Known Limitations

### PROPPATCH (WD-PROPPATCH-STUB)

PROPPATCH is not implemented (returns 405). This affects:
- Windows Explorer custom property storage
- macOS Finder `.DS_Store` metadata
- Some WebDAV clients that use PROPPATCH for extended attributes

**Impact**: Clients that require PROPPATCH for basic operation will fail. Clients that
use PROPPATCH only for optional metadata (Windows Explorer, macOS Finder) will show
warnings but continue to function for basic CRUD.

**Workaround**: None in v0.1. PROPPATCH implementation is planned for v0.2.

### Lock Scope (Shared Locks)

Shared locks (`<D:shared/>`) are accepted but behave identically to exclusive locks in
terms of conflict detection. Multiple shared locks on the same resource are allowed per
RFC 4918, but the implementation does not distinguish between shared and exclusive lock
semantics for conflict resolution.

### Lock Persistence

Locks are stored in memory and are lost on server restart. This is by design for v0.1.
Persistent lock storage is planned for v0.2.

### Rate Limiting

The default rate limit is 100 requests per 10 seconds per IP. This may be too low for
some WebDAV clients that make many small requests (e.g., davfs2 with a large directory
tree). Adjust `rateLimitPerIp.max` and `rateLimitPerIp.windowSeconds` in the plugin
configuration.

PROPFIND depth:infinity, COPY, and MOVE are exempt from per-request rate limiting
(counted as a single request).

---

## Conformance Test Results

Tested with `litmus` 0.13 against the conformance server:

| Suite | Tests | Passed | Failed | Pass Rate |
|-------|-------|--------|--------|-----------|
| basic | 16 | 16 | 0 | 100% |
| copymove | 13 | 13 | 0 | 100% |
| props | 14 | 11 | 3 | 78.6% |
| locks | 41 | 38 | 3 | 92.7% |

**props failures**: All 3 failures are due to PROPPATCH not being implemented (405).
This is a known limitation documented above.

**locks failures**: All 3 failures are `owner_modify` tests that attempt PROPPATCH on
a locked resource. Same root cause as props failures.
