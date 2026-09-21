---
"@mynameistito/codex-usage": major
---

Upgrade the package from Effect 3.22.x to Effect 4.0.0-rc.117.

This is a breaking change for consumers of the library API: install and use Effect 4 when running `createCodexClient`, `readCodexAuth`, or other Effect-returning functions. CLI behavior is unchanged; the schema decoding and failure handling now use the Effect 4 APIs.
