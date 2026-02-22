import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { getRuns, getTask, getRunsStatusWebSocketUrl, launchRun, deleteRun, acceptRun, type Run, type Task } from "../api/service";

export function TaskDetailsPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
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
          setPrompt(`@.hyperbranch/tasks/task-${taskId}.md Please plan and execute this task.`);
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
            const updatedRuns = message.data.map((r: { runId: string, status: string }) => ({
              id: r.runId,
              taskId,
              status: r.status,
              createdAt: "", // Date from backend if available
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
      await launchRun(taskId, { prompt, agentMode });
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
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
            <h3 className="text-lg font-medium mb-3">Launch Configuration</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Run Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Agent Mode
              </label>
              <select
                value={agentMode}
                onChange={(e) => setAgentMode(e.target.value)}
                className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="plan">Plan</option>
                <option value="build">Build</option>
              </select>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleLaunchRun}
                disabled={isLaunching}
                className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isLaunching ? "Launching..." : "Confirm Launch"}
              </button>
            </div>
          </div>
        )}

        {runs.length === 0
          ? <p className="text-gray-500">No runs found for this task.</p>
          : (
            <div className="grid gap-4">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow flex flex-col gap-4"
                >
                  <div className="flex justify-between items-center cursor-pointer" onClick={() => navigate(`/tasks/${taskId}/runs/${run.id}`)}>
                    <div>
                      <div className="font-medium text-blue-600 hover:underline">Run #{run.id}</div>
                      <div className="text-sm text-gray-500">
                        {run.createdAt
                          ? new Date(run.createdAt).toLocaleString()
                          : "Date unknown"}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        run.status === "success"
                          ? "bg-green-100 text-green-800"
                          : run.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : run.status === "running"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 border-t pt-3">
                    {deletingRunId === run.id ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-red-600 font-medium">Are you sure?</span>
                        <button onClick={() => handleDeleteRun(run.id)} className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                        <button onClick={() => setDeletingRunId(null)} className="px-2 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
                      </div>
                    ) : acceptingRunId === run.id ? (
                      <div className="flex items-center gap-2 text-sm">
                        <select
                          value={mergeStrategy}
                          onChange={(e) => setMergeStrategy(e.target.value as any)}
                          className="border border-gray-300 rounded px-2 py-1"
                        >
                          <option value="squash">Squash</option>
                          <option value="merge">Merge</option>
                          <option value="rebase">Rebase</option>
                        </select>
                        <button onClick={() => handleAcceptRun(run.id)} className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">Confirm Accept</button>
                        <button onClick={() => setAcceptingRunId(null)} className="px-2 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setAcceptingRunId(run.id)}
                          className="text-sm text-green-600 hover:text-green-800 font-medium"
                        >
                          Accept Run
                        </button>
                        <button
                          onClick={() => setDeletingRunId(run.id)}
                          className="text-sm text-red-600 hover:text-red-800 font-medium ml-auto"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
