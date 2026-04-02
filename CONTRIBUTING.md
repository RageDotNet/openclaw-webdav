# Contributing to OpenClaw WebDAV Plugin

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/RageDotNet/openclaw-webdav
cd openclaw-webdav
pnpm install
```

## Running Tests

**The full test suite runs with zero OpenClaw installation required.** All unit tests use
in-memory adapters and mock objects.

```bash
# Run all unit tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run a specific test file
pnpm test -- test/core/pathValidation.spec.ts
```

### Conformance Tests

WebDAV conformance tests use `litmus`. Install it first:

```bash
# Ubuntu/Debian
sudo apt install litmus

# macOS
brew install litmus
```

Then run:
```bash
pnpm run test:conformance
```

This starts a standalone HTTP server and runs the `litmus` test suite against it.
No OpenClaw installation is needed.

## Project Structure

```
src/
  adapter/          # OpenClaw integration layer
    config.ts       # Plugin config parsing and validation
    http.ts         # Request/response translation
    rateLimiter.ts  # Per-IP sliding-window rate limiter
    routes.ts       # Route registration and dispatch
  core/
    locks/
      lockManager.ts  # In-memory lock manager
    protocol/         # WebDAV method handlers
      options.handler.ts
      get.handler.ts
      head.handler.ts
      propfind.handler.ts
      put.handler.ts
      delete.handler.ts
      mkcol.handler.ts
      copy.handler.ts
      move.handler.ts
      lock.handler.ts
      unlock.handler.ts
      preconditions.ts  # If: header evaluation
    storage/
      memoryAdapter.ts    # In-memory storage (testing)
      nodeFsAdapter.ts    # Disk-based storage
      pathValidation.ts   # Security-critical path validation
    util/
      errorXml.ts   # RFC 4918 error XML builder
  index.ts          # Plugin entry point
  types.ts          # Core TypeScript interfaces
test/
  adapter/          # Adapter layer tests
  conformance/      # litmus conformance server
  core/             # Core handler tests
  helpers/          # Test utilities (mockApi, httpHarness)
  integration/      # Smoke test documentation
```

## Coding Conventions

- TypeScript strict mode
- ESLint + Prettier (run `pnpm run lint` and `pnpm run format`)
- No comments that just narrate what the code does
- All new features require unit tests
- Handler tests use `MemoryStorageAdapter` (no filesystem I/O)

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes with tests
4. Ensure all tests pass: `pnpm test`
5. Ensure linting passes: `pnpm run lint`
6. Submit a pull request with a clear description

## Reporting Issues

Please include:
- OpenClaw version
- Plugin version
- WebDAV client and version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (enable with `DEBUG_WEBDAV=1`)
