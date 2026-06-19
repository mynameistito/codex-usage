# @mynameistito/codex-usage

CLI for inspecting Codex usage windows and banked reset credits from `~/.codex/auth.json`.

## Usage

```sh
codex-usage
codex-usage status --json
codex-usage resets
codex-usage reset --confirm
```

`reset` is intentionally guarded. It will not call the reset redemption endpoint unless `--confirm`, `-y`, or `--yes` is provided.

## Development

```sh
bun install
bun run typecheck
bun test
bun run build
bun run check
```

## Native TypeScript Preview

The package exposes the TypeScript source for runtimes that support native TypeScript loading:

```ts
import { normalizeUsagePayload } from "@mynameistito/codex-usage/native-preview";
```

The published CLI still uses `dist/cli.js` for normal Node/npm compatibility.

## Release Flow

```sh
bun run changeset
bun run version-packages
```
