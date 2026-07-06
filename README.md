# @mynameistito/codex-usage

CLI for inspecting Codex usage windows and banked reset credits from `~/.codex/auth.json`.

## Usage

```sh
codex-usage
codex-usage status --json
codex-usage resets
codex-usage reset --confirm
```

`reset` is intentionally guarded. It will not call the reset redemption endpoint unless `--confirm`, `-y`, or `--yes` is provided. Calling applications should require the same kind of explicit user confirmation before using programmatic reset redemption.

## Library usage

```ts
import { Effect } from "effect";
import {
  createCodexClient,
  formatUsage,
  readCodexAuth,
} from "@mynameistito/codex-usage";

const program = Effect.gen(function* () {
  const tokens = yield* readCodexAuth();
  const usage = yield* createCodexClient(tokens).fetchUsage();

  return formatUsage(usage);
});

const output = await Effect.runPromise(program);
process.stdout.write(output);
```

## Development

```sh
bun install
bun run typecheck
bun test
bun run build
bun run check
```
