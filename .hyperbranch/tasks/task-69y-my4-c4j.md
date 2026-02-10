---
id: 69y-my4-c4j
status: todo
parent: null
dependencies: []
---
# Implement ORPC Integration

## Plan

- [ ] Add dependencies to `cli/deno.json`
  - `orpc`
  - `@orpc/server`
  - `@orpc/client`
  - `zod`
  - `orpc-file-based-router`
- [ ] Create `cli/scripts/gen-router.ts` for router generation
- [ ] Add `gen-rpc` task to `cli/deno.json`
- [ ] Create RPC Procedures in `cli/server/rpc/tasks/`
  - [ ] `list.ts`
  - [ ] `create.ts`
  - [ ] `[id]/get.ts`
  - [ ] `[id]/update.ts`
  - [ ] `[id]/remove.ts`
  - [ ] `[id]/run.ts`
  - [ ] `[id]/stop.ts`
- [ ] Update `cli/server/main.ts` to mount RPC handler at `/rpc`
- [ ] Create `cli/examples/client.ts` for verification


