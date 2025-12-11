# Versioning with npm version + Git Tags

This project uses `npm version` with Git tags for version management, similar to Python's setuptools_scm approach.

## How it works

- Version numbers are manually managed using `npm version` commands
- Versions are based on Git tags (e.g., `v1.0.0`)
- No automatic version bumping based on commits
- Releases are triggered by creating and pushing Git tags

## Version Format

- **Semantic versioning**: `MAJOR.MINOR.PATCH` (e.g., `1.0.0`)
- **Git tags**: `vMAJOR.MINOR.PATCH` (e.g., `v1.0.0`)

## Creating a Release

### 1. Development Phase
Developers work normally, committing changes to the repository.

### 2. Version Bump (Manual)
When ready to release, use `npm version` to bump the version:

```bash
# Patch version (1.0.0 → 1.0.1)
npm version patch

# Minor version (1.0.0 → 1.1.0)
npm version minor

# Major version (1.0.0 → 2.0.0)
npm version major

# Specific version
npm version 1.2.3
```

### 3. What npm version does
- Updates `package.json` version field
- Creates a Git commit with the version change
- Creates a Git tag (e.g., `v1.0.0`)
- Pushes both commit and tag to remote

### 4. Automated Release
GitHub Actions detects the new tag and automatically:
- Builds the project
- Runs tests
- Publishes to npm
- Creates a GitHub release

## Release Workflow

```bash
# 1. Ensure all changes are committed
git add .
git commit -m "feat: add new feature"

# 2. Bump version (this creates commit + tag)
npm version patch  # or minor/major

# 3. Push changes and tag
git push origin main
git push origin --tags

# 4. GitHub Actions automatically publishes
```

## Version Types

| Command | When to use | Example |
|---------|-------------|---------|
| `npm version patch` | Bug fixes, small changes | `1.0.0` → `1.0.1` |
| `npm version minor` | New features, backwards compatible | `1.0.0` → `1.1.0` |
| `npm version major` | Breaking changes | `1.0.0` → `2.0.0` |

## Checking Current Version

```bash
# From package.json
npm version

# Or check npm registry
npm view wavespeed version

# Check latest Git tag
git describe --tags --abbrev=0
```

## GitHub Actions Workflow

The release process is automated when tags are pushed:

```yaml
name: Release
on:
  push:
    tags:
      - 'v*.*.*'
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish
      - run: Create GitHub release
```

## Pre-release Versions

For beta/rc versions:

```bash
npm version 1.0.0-beta.1
npm version 1.0.0-rc.1
```

## Best Practices

### When to Release
- **Patch releases**: Bug fixes, documentation updates, small improvements
- **Minor releases**: New features that are backwards compatible
- **Major releases**: Breaking changes, API modifications

### Commit Messages
While not strictly enforced, descriptive commit messages are recommended:

```bash
feat: add support for custom timeout options
fix: resolve issue with prediction polling
docs: update API reference documentation
refactor: simplify error handling logic
```

### Version Planning
- Plan version bumps during development
- Test thoroughly before releasing
- Consider deprecation warnings for breaking changes

## Troubleshooting

### Common Issues

1. **Tag already exists**: Delete the tag and try again
   ```bash
   git tag -d v1.0.0
   git push origin :refs/tags/v1.0.0
   ```

2. **Version not updated**: Check if package.json was modified correctly

3. **Publish fails**: Verify NPM_TOKEN permissions and package name uniqueness

### Manual Publish (If needed)

```bash
# Build and test locally
npm run build
npm test

# Publish manually
npm publish
```

## Comparison with Python setuptools_scm

| Aspect | npm version + Git tags | setuptools_scm |
|--------|----------------------|----------------|
| Version source | package.json | Git tags + commit count |
| Version format | 1.2.3 | 1.2.3.dev4+g1234567 |
| Trigger | Manual npm version | Manual git tag |
| Automation | GitHub Actions on tag | Build-time version detection |
| Development versions | Not supported | Automatic dev versions |

This approach provides similar manual control as Python's setuptools_scm while leveraging npm's built-in versioning tools.
