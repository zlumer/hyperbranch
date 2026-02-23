import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getRuns, getTask, getRunsStatusWebSocketUrl, launchRun, deleteRun, acceptRun, type Run, type Task } from "../api/service";
import { RunLaunchConfig } from "../components/RunLaunchConfig";
import { RunListItem } from "../components/RunListItem";

export function TaskDetailsPage() {
  const { taskId } = useParams();
  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  const [showConfig, setShowConfig] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [agentMode, setAgentMode] = useState("plan");
  const [isLaunching, setIsLaunching] = useState(false);

  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [acceptingRunId, setAcceptingRunId] = useState<string | null>(null);
  const [mergeStrategy, setMergeStrategy] = useState<"merge" | "squash" | "rebase">("squash");

  useEffect(() => {
    if (taskId) {
      Promise.all([getTask(taskId), getRuns(taskId)])
        .then(([taskData, runsData]) => {
          setTask(taskData);
          setRuns(runsData);
          setPrompt(`@.hyperbranch/tasks/task-${taskId}.md Plan this task. Ask me questions to better understand the task and clear up assumptions and remove ambiguities. Continue asking questions (using "ask question" tool) until 100% certain in the task and plan.`);
          setAgentMode(taskData.status === "build" ? "build" : "plan");
        })
        .catch((error) => console.error(error))
        .finally(() => setLoading(false));

      const ws = new WebSocket(getRunsStatusWebSocketUrl(taskId));
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "runs_update" && Array.isArray(message.data)) {
            // Map backend run objects to frontend Run interface
            const updatedRuns = message.data.map((r: { runId: string, status: string, createdAt?: string }) => ({
              id: r.runId.split("/").pop() || r.runId,
              taskId,
              status: r.status,
              createdAt: r.createdAt || "",
            }));
            setRuns(updatedRuns);
          }
        } catch (err) {
          console.error("WebSocket message parse error", err);
        }
      };

      return () => {
        ws.close();
      };
    }
  }, [taskId]);

  const handleLaunchRun = async () => {
    if (!taskId) return;
    setIsLaunching(true);
    try {
      await launchRun(taskId, { prompt, agentMode, commit: true });
      setShowConfig(false);
      const updatedRuns = await getRuns(taskId);
      setRuns(updatedRuns);
    } catch (err) {
      console.error("Failed to launch run", err);
      alert("Failed to launch run. Check console for details.");
    } finally {
      setIsLaunching(false);
    }
  };

  const handleDeleteRun = async (runId: string) => {
    if (!taskId) return;
    try {
      await deleteRun(taskId, runId);
      setRuns(runs.filter(r => r.id !== runId));
    } catch (err) {
      console.error("Failed to delete run", err);
      alert("Failed to delete run.");
    } finally {
      setDeletingRunId(null);
    }
  };

  const handleAcceptRun = async (runId: string) => {
    if (!taskId) return;
    try {
      await acceptRun(taskId, runId, mergeStrategy);
      const updatedRuns = await getRuns(taskId);
      setRuns(updatedRuns);
    } catch (err) {
      console.error("Failed to accept run", err);
      alert("Failed to accept run.");
    } finally {
      setAcceptingRunId(null);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!task) return <div className="p-8">Task not found</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          to="/"
          className="text-blue-600 hover:underline mb-4 inline-block"
        >
          &larr; Back to Board
        </Link>
        <h1 className="text-3xl font-bold mb-2">{task.title}</h1>
        <div className="flex items-center gap-2 mb-4">
          <span
            className={`px-2 py-1 rounded text-sm font-medium ${
              task.status === "done"
                ? "bg-green-100 text-green-800"
                : ["plan", "build", "review"].includes(task.status)
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {task.status}
          </span>
          <span className="text-gray-500 text-sm">ID: {task.id}</span>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
          <h2 className="text-lg font-semibold mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">
            {task.description || "No description provided."}
          </p>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Runs</h2>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition-colors"
          >
            Launch Run
          </button>
        </div>

        {showConfig && (
          <RunLaunchConfig
            prompt={prompt}
            setPrompt={setPrompt}
            agentMode={agentMode}
            setAgentMode={setAgentMode}
            isLaunching={isLaunching}
            onLaunch={handleLaunchRun}
          />
        )}

        {runs.length === 0
          ? <p className="text-gray-500">No runs found for this task.</p>
          : (
            <div className="grid gap-4">
              {runs.map((run) => (
                <RunListItem
                  key={run.id}
                  taskId={taskId || ""}
                  run={run}
                  deletingRunId={deletingRunId}
                  setDeletingRunId={setDeletingRunId}
                  acceptingRunId={acceptingRunId}
                  setAcceptingRunId={setAcceptingRunId}
                  mergeStrategy={mergeStrategy}
                  setMergeStrategy={setMergeStrategy}
                  onDelete={handleDeleteRun}
                  onAccept={handleAcceptRun}
                />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
