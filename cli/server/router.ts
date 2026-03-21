// This file is auto-generated

import { get as root__get, post as root__post } from "./routes/root.ts";
import { post as id_runs_runId_pull__post } from "./routes/{id}/runs/{runId}/pull.ts";
import { get as id_runs_runId_files__get } from "./routes/{id}/runs/{runId}/files.ts";
import { post as id_runs_runId_resume__post } from "./routes/{id}/runs/{runId}/resume.ts";
import { get as id_runs_runId_session__get } from "./routes/{id}/runs/{runId}/session.ts";
import { get as id_runs_runId_logs__get } from "./routes/{id}/runs/{runId}/logs.ts";
import { post as id_runs_runId_merge__post } from "./routes/{id}/runs/{runId}/merge.ts";
import { post as id_runs_runId_sync__post } from "./routes/{id}/runs/{runId}/sync.ts";
import { get as id_runs_runId_port__get } from "./routes/{id}/runs/{runId}/port.ts";
import { del as id_runs_runId_index__del } from "./routes/{id}/runs/{runId}/index.ts";
import { post as id_runs_runId_stop__post } from "./routes/{id}/runs/{runId}/stop.ts";
import { get as id_runs_index__get } from "./routes/{id}/runs/index.ts";
import { get as id_runs_status__get } from "./routes/{id}/runs/status.ts";
import { get as id_logs__get } from "./routes/{id}/logs.ts";
import {
  del as id_index__del,
  get as id_index__get,
  patch as id_index__patch,
} from "./routes/{id}/index.ts";
import { post as id_run__post } from "./routes/{id}/run.ts";

export const router = {
  root: {
    get: root__get.route({ path: "/", method: "GET" }),
    post: root__post.route({ path: "/", method: "POST" }),
  },
  runs: {
    pull: id_runs_runId_pull__post.route({
      path: "/{id}/runs/{runId}/pull",
      method: "POST",
    }),
    files: id_runs_runId_files__get.route({
      path: "/{id}/runs/{runId}/files",
      method: "GET",
    }),
    resume: id_runs_runId_resume__post.route({
      path: "/{id}/runs/{runId}/resume",
      method: "POST",
    }),
    session: id_runs_runId_session__get.route({
      path: "/{id}/runs/{runId}/session",
      method: "GET",
    }),
    logs: id_runs_runId_logs__get.route({
      path: "/{id}/runs/{runId}/logs",
      method: "GET",
    }),
    merge: id_runs_runId_merge__post.route({
      path: "/{id}/runs/{runId}/merge",
      method: "POST",
    }),
    sync: id_runs_runId_sync__post.route({
      path: "/{id}/runs/{runId}/sync",
      method: "POST",
    }),
    port: id_runs_runId_port__get.route({
      path: "/{id}/runs/{runId}/port",
      method: "GET",
    }),
    index: {
      del: id_runs_runId_index__del.route({
        path: "/{id}/runs/{runId}",
        method: "DELETE",
      }),
      get: id_runs_index__get.route({ path: "/{id}/runs", method: "GET" }),
    },
    stop: id_runs_runId_stop__post.route({
      path: "/{id}/runs/{runId}/stop",
      method: "POST",
    }),
    status: id_runs_status__get.route({
      path: "/{id}/runs/status",
      method: "GET",
    }),
  },
  logs: id_logs__get.route({ path: "/{id}/logs", method: "GET" }),
  index: {
    del: id_index__del.route({ path: "/{id}", method: "DELETE" }),
    get: id_index__get.route({ path: "/{id}", method: "GET" }),
    patch: id_index__patch.route({ path: "/{id}", method: "PATCH" }),
  },
  run: id_run__post.route({ path: "/{id}/run", method: "POST" }),
};
