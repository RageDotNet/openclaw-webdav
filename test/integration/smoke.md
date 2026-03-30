# WebDAV Plugin — Integration Smoke Tests

These tests validate the plugin running inside a real OpenClaw instance.

## Prerequisites

1. OpenClaw installed and running (default port: 18789)
2. `openclaw-webdav` plugin installed and enabled in OpenClaw
3. A valid OpenClaw gateway token (set `OPENCLAW_TOKEN` env var)

```bash
export BASE_URL="http://localhost:18789/webdav"
export TOKEN="your-gateway-token-here"
export AUTH="-H \"Authorization: Bearer $TOKEN\""
```

Alternatively, run against the conformance server (no auth required):

```bash
# Start the conformance server
pnpm run test:conformance &
export BASE_URL="http://127.0.0.1:8765"
export AUTH=""
```

---

## Smoke Tests

### 1. OPTIONS — Verify DAV compliance headers

```bash
curl -s -X OPTIONS "$BASE_URL/" $AUTH -v 2>&1 | grep -E "< HTTP|< DAV|< Allow"
```

**Expected**: HTTP 200, `DAV: 1, 2`, `Allow:` header listing all methods.

---

### 2. MKCOL — Create a test collection

```bash
curl -s -X MKCOL "$BASE_URL/smoke-test/" $AUTH -w "%{http_code}\n" -o /dev/null
```

**Expected**: `201`

---

### 3. PUT — Upload a file

```bash
echo "Hello, WebDAV!" | curl -s -X PUT "$BASE_URL/smoke-test/hello.txt" $AUTH \
  -H "Content-Type: text/plain" \
  --data-binary @- \
  -w "%{http_code}\n" -o /dev/null
```

**Expected**: `201`

---

### 4. GET — Download the file

```bash
curl -s "$BASE_URL/smoke-test/hello.txt" $AUTH
```

**Expected**: `Hello, WebDAV!`

---

### 5. HEAD — Check file metadata

```bash
curl -s -X HEAD "$BASE_URL/smoke-test/hello.txt" $AUTH -v 2>&1 | \
  grep -E "< HTTP|< Content-Length|< Content-Type|< ETag|< Last-Modified"
```

**Expected**: HTTP 200, `Content-Length: 15`, `Content-Type: text/plain`, `ETag` and `Last-Modified` headers present.

---

### 6. PROPFIND Depth:0 — Get file properties

```bash
curl -s -X PROPFIND "$BASE_URL/smoke-test/hello.txt" $AUTH \
  -H "Depth: 0" \
  -H "Content-Type: application/xml" \
  --data '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>'
```

**Expected**: HTTP 207 multi-status XML with `getcontentlength`, `getlastmodified`, `getetag`, `resourcetype`.

---

### 7. PROPFIND Depth:1 — List collection contents

```bash
curl -s -X PROPFIND "$BASE_URL/smoke-test/" $AUTH \
  -H "Depth: 1" \
  -H "Content-Type: application/xml" \
  --data '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>'
```

**Expected**: HTTP 207 with entries for `smoke-test/` and `smoke-test/hello.txt`.

---

### 8. LOCK — Acquire exclusive lock

```bash
LOCK_RESPONSE=$(curl -s -X LOCK "$BASE_URL/smoke-test/hello.txt" $AUTH \
  -H "Content-Type: application/xml" \
  -H "Depth: 0" \
  -H "Timeout: Second-3600" \
  --data '<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:exclusive/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
  <D:owner><D:href>smoke-test</D:href></D:owner>
</D:lockinfo>')
echo "$LOCK_RESPONSE"
LOCK_TOKEN=$(echo "$LOCK_RESPONSE" | grep -o 'opaquelocktoken:[^<]*')
echo "Lock token: $LOCK_TOKEN"
```

**Expected**: HTTP 200, XML with `lockdiscovery`, `Lock-Token` response header.

---

### 9. PUT with lock token — Write while locked (owner)

```bash
echo "Updated content" | curl -s -X PUT "$BASE_URL/smoke-test/hello.txt" $AUTH \
  -H "Content-Type: text/plain" \
  -H "If: (<$LOCK_TOKEN>)" \
  --data-binary @- \
  -w "%{http_code}\n" -o /dev/null
```

**Expected**: `204`

---

### 10. PUT without lock token — Should fail (423 Locked)

```bash
echo "Unauthorized write" | curl -s -X PUT "$BASE_URL/smoke-test/hello.txt" $AUTH \
  -H "Content-Type: text/plain" \
  --data-binary @- \
  -w "%{http_code}\n" -o /dev/null
```

**Expected**: `423`

---

### 11. UNLOCK — Release lock

```bash
curl -s -X UNLOCK "$BASE_URL/smoke-test/hello.txt" $AUTH \
  -H "Lock-Token: <$LOCK_TOKEN>" \
  -w "%{http_code}\n" -o /dev/null
```

**Expected**: `204`

---

### 12. COPY — Copy file

```bash
curl -s -X COPY "$BASE_URL/smoke-test/hello.txt" $AUTH \
  -H "Destination: $BASE_URL/smoke-test/hello-copy.txt" \
  -w "%{http_code}\n" -o /dev/null
```

**Expected**: `201`

---

### 13. MOVE — Rename file

```bash
curl -s -X MOVE "$BASE_URL/smoke-test/hello-copy.txt" $AUTH \
  -H "Destination: $BASE_URL/smoke-test/hello-renamed.txt" \
  -w "%{http_code}\n" -o /dev/null
```

**Expected**: `201`

---

### 14. DELETE — Remove files and collection

```bash
curl -s -X DELETE "$BASE_URL/smoke-test/hello.txt" $AUTH -w "%{http_code}\n" -o /dev/null
curl -s -X DELETE "$BASE_URL/smoke-test/hello-renamed.txt" $AUTH -w "%{http_code}\n" -o /dev/null
curl -s -X DELETE "$BASE_URL/smoke-test/" $AUTH -w "%{http_code}\n" -o /dev/null
```

**Expected**: `204`, `204`, `204`

---

## Read-Only Mode Verification

Configure the plugin with `readOnly: true`, then verify write methods return 405:

```bash
# These should all return 405
curl -s -X PUT "$BASE_URL/test.txt" $AUTH --data "hello" -w "%{http_code}\n" -o /dev/null
curl -s -X DELETE "$BASE_URL/test.txt" $AUTH -w "%{http_code}\n" -o /dev/null
curl -s -X MKCOL "$BASE_URL/newdir/" $AUTH -w "%{http_code}\n" -o /dev/null
curl -s -X LOCK "$BASE_URL/test.txt" $AUTH -w "%{http_code}\n" -o /dev/null

# These should still work (read-only)
curl -s -X OPTIONS "$BASE_URL/" $AUTH -w "%{http_code}\n" -o /dev/null  # 200
curl -s -X GET "$BASE_URL/" $AUTH -w "%{http_code}\n" -o /dev/null       # 200 or 404
```

---

## Upload Size Limit Verification

Configure the plugin with `maxUploadSizeMb: 1`, then verify large uploads return 413:

```bash
# Generate a 2MB file and upload it
dd if=/dev/urandom bs=1M count=2 2>/dev/null | \
  curl -s -X PUT "$BASE_URL/large-file.bin" $AUTH \
    -H "Content-Length: 2097152" \
    --data-binary @- \
    -w "%{http_code}\n" -o /dev/null
```

**Expected**: `413`
