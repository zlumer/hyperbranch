export interface RunContext {
  taskId: string;
  runIndex: number;
  branchName: string;
  worktreePath: string;
  dockerProjectName: string;
  paths: {
    runDir: string;
    composeFile: string;
    envFile: string;
    entrypoint: string;
    dockerfile: string;
  };
}
