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

### Client Structure

Entry point: `new WaveSpeed(apiKey?: string, options?: {...})`

The SDK provides a simple client for running models:

```typescript
const client = new WaveSpeed('your-api-key');
const prediction = await client.run('model-id', input);
```

### Key Classes and Interfaces

- `WaveSpeed` - Main client class
- `Prediction` - Prediction object with status and outputs
- `RunOptions` - Options for run calls
- `UploadFileResp` - Upload response interface

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
├── index.ts          # Main SDK implementation
tests/
├── index.test.ts     # Test suite
dist/
├── index.js          # Compiled JavaScript
├── index.d.ts        # TypeScript definitions
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
