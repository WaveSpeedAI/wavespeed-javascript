# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WaveSpeed JavaScript/TypeScript SDK - Official JavaScript/TypeScript SDK for WaveSpeedAI inference platform.

## Commands

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Building
```bash
# Build the TypeScript code
npm run build

# Clean and rebuild
rm -rf dist && npm run build
```

### Development
```bash
# Install dependencies
npm install

# Run linter
npm run lint

# Format code (if configured)
npm run format
```

## Architecture

### SDK Structure (Aligned with Python SDK)

```
src/
├── index.ts              # Main entry point
├── version.ts            # Version info
├── config.ts             # Configuration (api class)
└── api/
    ├── index.ts         # Convenience functions (run, upload)
    └── client.ts        # Client class implementation
```

### Client Structure

**Primary way (recommended)**:
```typescript
import Client from 'wavespeed';
const client = new Client('your-api-key');
const result = await client.run('model-id', input);
```

**Convenience functions (Python-style)**:
```typescript
import { run, upload } from 'wavespeed';
const result = await run('model-id', input);
const url = await upload('/path/to/file');
```

### Key Classes and Interfaces

- `Client` - Main client class (formerly WaveSpeed)
- `RunOptions` - Options for run calls
- `api` - Configuration class (from config.ts)
- Convenience functions: `run()`, `upload()` use default client singleton

### Features

- **Async/Await**: Modern promise-based API
- **Sync Mode**: Single request that waits for result (`enableSyncMode`)
- **Retry Logic**: Configurable task-level and connection-level retries
- **Timeout Control**: Per-request and overall timeouts
- **File Upload**: Direct file upload to WaveSpeed storage
- **TypeScript Support**: Full type definitions included

### Configuration

Client-level configuration:
- `baseUrl` - API base URL
- `pollInterval` - Polling interval in seconds
- `timeout` - Overall timeout in seconds
- `maxRetries` - Task-level retries
- `maxConnectionRetries` - HTTP connection retries
- `retryInterval` - Base retry delay in seconds

Per-request configuration via `RunOptions`:
- `timeout` - Override timeout
- `pollInterval` - Override poll interval
- `enableSyncMode` - Use sync mode
- `maxRetries` - Override retry count

### Environment Variables

- `WAVESPEED_API_KEY` - API key
- `WAVESPEED_BASE_URL` - Base URL (default: https://api.wavespeed.ai)
- `WAVESPEED_POLL_INTERVAL` - Poll interval in seconds
- `WAVESPEED_TIMEOUT` - Timeout in seconds
- `WAVESPEED_REQUEST_TIMEOUT` - Per-request timeout (internal)

## Project Structure

```
src/
├── index.ts              # Main entry, exports everything
├── version.ts            # Version from package.json
├── config.ts             # Configuration (api class)
└── api/
    ├── index.ts         # Convenience functions + default client
    └── client.ts        # Client class implementation
tests/
├── client.test.ts        # Core client tests
├── wavespeed.test.ts     # Full test suite
dist/
├── index.js             # Compiled JavaScript
├── index.d.ts           # TypeScript definitions
├── api/
│   ├── index.js
│   ├── index.d.ts
│   ├── client.js
│   └── client.d.ts
├── config.js
├── config.d.ts
├── version.js
└── version.d.ts
```

## Testing

Tests are located in `tests/` directory and use Jest:
- Client initialization tests
- Run method tests
- Sync mode tests
- Retry logic tests
- Upload functionality tests

## Release Process

This project uses `npm version` with Git tags for versioning. See VERSIONING.md for details.

To create a release:
1. Ensure all changes are committed
2. Bump version: `npm version patch|minor|major`
3. Push changes: `git push origin main --tags`
4. GitHub Actions will automatically publish to npm

## TypeScript

This project is written in TypeScript and provides full type definitions. The TypeScript configuration is in `tsconfig.json`.

Build artifacts are in the `dist/` directory and include both JavaScript and TypeScript declaration files.
