/**
 * Version information for WaveSpeed SDK.
 * This file provides version information from package.json.
 */

// For CommonJS build, we'll read version at runtime
let _version = '0.0.0';

try {
  // Try to read from package.json
  const fs = require('fs');
  const path = require('path');
  const packagePath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packagePath)) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    _version = packageJson.version;
  }
} catch (err) {
  // Fallback to default version if package.json cannot be read
  _version = '0.1.0';
}

export const version = _version;
export default version;
