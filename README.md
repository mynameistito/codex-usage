# @mynameistito/codex-usage

CLI for inspecting Codex usage windows and banked reset credits from `~/.codex/auth.json`.

## Usage

```sh
codex-usage
codex-usage status --json
codex-usage resets
codex-usage reset --confirm
```

`reset` is intentionally guarded. It will not call the reset redemption endpoint unless `--confirm` or `--yes` is provided.

## Development

```sh
bun install
bun run typecheck
bun test
bun run build
bun run check
```
