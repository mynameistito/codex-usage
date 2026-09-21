# @mynameistito/codex-usage

## 2.0.0

### Major Changes

- d976d9e: Upgrade the package from Effect 3.22.x to Effect 4.0.0-rc.117.

  This is a breaking change for consumers of the library API: install and use Effect 4 when running `createCodexClient`, `readCodexAuth`, or other Effect-returning functions. CLI behavior is unchanged; the schema decoding and failure handling now use the Effect 4 APIs.

## 1.1.5

### Patch Changes

- bf16ce6: Publish versioned Changesets release commits after the release pull request is merged.
- eb2f17e: Allow the built CLI integration test enough time to complete its build on CI runners.

## 1.1.4

### Patch Changes

- 167049d: bump pkgs
- 35fdf24: update ultracite plugins

## 1.1.3

### Patch Changes

- ca1317c: Fix npm release staging with trusted publishing by skipping the unsupported staged-package listing request.

## 1.1.2

### Patch Changes

- b5099d5: Refresh development dependencies and stabilize CLI integration tests.

## 1.1.1

### Patch Changes

- af13706: Harden release workflow orchestration

## 1.1.0

### Minor Changes

- 213ff30: - Change `createCodexClient` to return an `Effect` and report base URL validation failures as `CodexConfigError`.
  - Export `CodexClient` and `CodexConfigError` from the package root for library consumers.
  - Move Codex API response parsing to Effect Schema and keep parse failures in the typed error channel.
  - Wrap auth access tokens with Effect `Redacted` and only unwrap them when creating HTTP authorization headers.
  - Reorganize source modules into `src/codex` for API/auth/client concerns and `src/usage` for normalization and formatting.
  - Keep CLI base URL validation failures classified as usage errors with exit code 2.
  - Print the package name plus actual package version in human-readable usage output.
  - Add a `dev` script for running the TypeScript CLI directly during local development.
  - Add packaged CLI smoke coverage so the built `dist/cli.js` path used by `npx` and `bunx` keeps printing the published package version.
  - Tighten TypeScript configuration and keep Knip aware of Ultracite's indirect ESLint plugin dependencies.

## 1.0.3

### Patch Changes

- bc421fd: # Redeem the soonest-expiring available reset credit from the CLI

## 1.0.2

### Patch Changes

- ff7538a: Harden custom base URL validation and avoid printing raw HTTP error bodies.

## 1.0.1

### Patch Changes

- 36321be: Export public error classes and types from the package root.
- a2ce47b: Validate reset credit entries before returning them from the client.
- 0f2be10: Validate consume reset response codes before returning reset credit results.

## 1.0.0

### Major Changes

- 25804e2: Add the initial Codex usage CLI with status, reset-credit listing, and confirmed reset redemption.
