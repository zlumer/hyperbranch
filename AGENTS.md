# AGENTS.md

## Code style
- TypeScript strict mode
- no semicolons
- Use functional patterns where possible:
Whenever possible, create 100% pure functions (no side effects, no state, no global access).
Separate side-effecting code into small, well-defined utility functions that can be mocked in tests.
Use TypeScript interfaces/types to define data structures clearly.

Try to follow functional programming principles without going crazy. Be pragmatic. Prefer immutability where it makes sense.

## Project structure

```bash
# CLI entrypoint
./cli/hb.ts <command> <args>
```

```bash
# running tests
cd cli
deno test -A
```
