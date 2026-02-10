---
id: 69y-my4-c4j
status: todo
parent: null
dependencies: []
---
# Implement ORPC Integration

## Plan

- [ ] Add dependencies to `cli/deno.json` (prefer JSR where available)
  - `@orpc/server`
  - `@orpc/client`
  - `zod`
  - `orpc-file-based-router`
- [ ] Create `cli/scripts/gen-router.ts` for router generation
- [ ] Add `gen-rpc` task to `cli/deno.json`
- [ ] Create RPC Procedures in `cli/server/rpc/tasks/` reusing logic from `cli/services/tasks.ts` and `cli/services/runs.ts`
  - [ ] `list.ts`
  - [ ] `create.ts`
  - [ ] `[id]/get.ts`
  - [ ] `[id]/update.ts`
  - [ ] `[id]/remove.ts`
  - [ ] `[id]/run.ts`
  - [ ] `[id]/stop.ts`
- [ ] Update `cli/server/main.ts`
  - [ ] Mount RPC handler at `/rpc`
  - [ ] Remove existing REST routes (`cli/server/routes/tasks.ts`)
  - [ ] Keep WebSocket route for logs (`/:id/logs`)
- [ ] Create `cli/examples/client.ts` for verification
  - [ ] Test all RPC methods
