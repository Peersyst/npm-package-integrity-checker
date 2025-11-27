# Package Integrity Check

A tool to verify that published npm packages haven't been compromised by comparing them against their source code.

## How It Works

This tool helps you verify that the code published to npm matches what you'd get by building the source code yourself. It does this by:

1. **Version Check** — Ensures the source code version matches the installed package version
2. **Build** — Builds the package from source using the specified build script
3. **Checksum Generation** — Creates SHA256 checksums of both the built output and the installed package
4. **Comparison** — Compares checksums to detect any differences
5. **Cleanup** — Removes generated build artifacts

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Add packages to verify

Add the npm packages you want to verify to `package.json` dependencies:

```json
{
    "dependencies": {
        "@example/package": "1.0.0"
    }
}
```

### 3. Copy source code

Clone or copy the package's source code into the `packages/` directory. Make sure you have the exact source code that corresponds to the published version.

```
packages/
└── example-package/
    ├── package.json
    ├── src/
    └── ...
```

### 4. Configure `config.json`

Create entries in `config.json` for each package you want to verify:

```json
{
    "@example/package": {
        "path": "packages/example-package",
        "dist": "dist",
        "buildScript": "pnpm run build"
    }
}
```

#### Configuration Options

| Field         | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| `path`        | Path to the source code directory (relative to project root) |
| `dist`        | Path to the build output folder (relative to `path`)         |
| `buildScript` | Command to build the package                                 |

#### Example

```json
{
    "@swisstype/essential": {
        "path": "packages/swisstype/packages/essential",
        "dist": "dist",
        "buildScript": "pnpm run build"
    },
    "@swisstype/string": {
        "path": "packages/swisstype/packages/string",
        "dist": "dist",
        "buildScript": "pnpm run build"
    }
}
```

## Usage

Run the integrity check:

```bash
pnpm run check
```

Or directly with Node:

```bash
node index.js
```

## Output

The tool provides detailed output for each package:

```
============================================================
📦 Checking: @example/package
============================================================
  [1/5] Checking version match...
  ✅ Version match: 1.0.0
  [2/5] Building package...
  ✅ Build completed successfully
  [3/5] Generating checksums...
     Source dist checksum: abc123...
     Installed checksum:   abc123...
  [4/5] Comparing checksums...
  ✅ All checksums match! Package integrity verified ✓
  [5/5] Cleaning generated files...
  ✅ Cleanup completed
```

### Exit Codes

| Code | Meaning                             |
| ---- | ----------------------------------- |
| `0`  | All packages passed integrity check |
| `1`  | One or more packages failed         |

## Troubleshooting

### Version Mismatch

If you see a version mismatch error, ensure your source code matches the exact version installed:

```
❌ Version mismatch! Source: 1.0.0, Installed: 1.0.1
⚠️  Please update the source code to version 1.0.1
```

**Solution:** Check out the correct git tag/commit for the installed version.

### Checksum Mismatch

If checksums don't match:

1. Verify you have the correct source code version
2. Check if the build process is deterministic
3. Compare the differing files manually to investigate

### Build Failed

If the build fails:

1. Ensure all build dependencies are installed
2. Check that the `buildScript` is correct
3. Try running the build manually in the package directory

## Project Structure

```
package-integrity-check/
├── index.js          # Main integrity check script
├── config.json       # Package configuration
├── package.json      # Project dependencies (includes packages to verify)
├── node_modules/     # Installed packages (from npm)
└── packages/         # Source code of packages to verify
    └── {package}/
        ├── package.json
        └── ...
```

## License

ISC
