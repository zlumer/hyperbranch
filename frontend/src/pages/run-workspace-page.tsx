import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { getRun, getRunSession, acceptRun, pullRun, type Run } from "../api/service";

export function RunWorkspacePage() {
  const { taskId, runId } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [port, setPort] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<"merge" | "squash" | "rebase">("squash");
  const [pullStrategy, setPullStrategy] = useState<"merge" | "rebase">("rebase");

  useEffect(() => {
    if (taskId && runId) {
      Promise.all([
        getRun(taskId, runId).catch(err => {
          console.error(err);
          return null;
        }),
        getRunSession(taskId, runId).catch(err => {
          console.error("Failed to get session", err);
          return null;
        })
      ])
        .then(([runData, sessionData]) => {
          if (runData) setRun(runData);
          if (sessionData) {
            setPort(sessionData.port);
            setSessionId(sessionData.sessionId);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [taskId, runId]);

  const handleAcceptRun = async () => {
    if (!taskId || !runId) return;
    try {
      await acceptRun(taskId, runId, mergeStrategy);
      navigate(`/tasks/${taskId}`);
    } catch (err) {
      console.error("Failed to accept run", err);
      alert("Failed to accept run.");
    } finally {
      setAccepting(false);
    }
  };

  const handlePullRun = async () => {
    if (!taskId || !runId) return;
    try {
      await pullRun(taskId, runId, pullStrategy);
      setPulling(false);
      // Reload run data to get updated drift
      const runData = await getRun(taskId, runId);
      setRun(runData);
    } catch (err) {
      console.error("Failed to pull run", err);
      alert("Failed to pull run.");
    }
  };

  if (loading) return <div className="p-8">Loading workspace...</div>;
  if (!run || !taskId) return <div className="p-8">Run not found</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            to={`/tasks/${taskId}`}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            &larr; Back
          </Link>
          <div className="h-4 w-px bg-gray-300"></div>
          <div className="text-sm font-semibold text-gray-700">Run #{run.id}</div>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            run.status === "completed" ? "bg-green-100 text-green-800" :
            run.status === "failed" ? "bg-red-100 text-red-800" :
            run.status === "working" || run.status === "starting" ? "bg-yellow-100 text-yellow-800" :
            run.status === "paused" ? "bg-orange-100 text-orange-800" :
            run.status === "stopped" ? "bg-gray-200 text-gray-800" :
            "bg-gray-100 text-gray-800"
          }`}>
            {run.status}
          </span>
          {run.drift && (
            <span className="text-sm text-gray-500 font-medium">
              ({run.drift.behind}↓ {run.drift.ahead}↑)
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          {run.drift && run.drift.behind > 0 && (
            pulling ? (
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded border border-blue-200 mr-2">
                <span className="text-blue-600 font-medium">Pull:</span>
                <select
                  value={pullStrategy}
                  onChange={(e) => setPullStrategy(e.target.value as any)}
                  className="border border-blue-300 rounded px-2 py-1 bg-white text-sm"
                >
                  <option value="merge">Merge</option>
                  <option value="rebase">Rebase</option>
                </select>
                <button 
                  onClick={handlePullRun} 
                  className="px-3 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 ml-1"
                >
                  Confirm
                </button>
                <button 
                  onClick={() => setPulling(false)} 
                  className="px-3 py-1 bg-white text-gray-700 border border-gray-300 rounded font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPulling(true)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-sm transition-colors mr-2 flex items-center gap-1"
              >
                <span>Pull</span>
                <span className="bg-blue-700 px-1.5 py-0.5 rounded-full text-xs">{run.drift.behind}↓</span>
              </button>
            )
          )}
          {accepting ? (
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded border border-gray-200">
              <span className="text-gray-600 font-medium">Strategy:</span>
              <select
                value={mergeStrategy}
                onChange={(e) => setMergeStrategy(e.target.value as any)}
                className="border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="squash">Squash</option>
                <option value="merge">Merge</option>
                <option value="rebase">Rebase</option>
              </select>
              <button 
                onClick={handleAcceptRun} 
                className="px-3 py-1 bg-green-600 text-white rounded font-medium hover:bg-green-700 ml-1"
              >
                Confirm
              </button>
              <button 
                onClick={() => setAccepting(false)} 
                className="px-3 py-1 bg-white text-gray-700 border border-gray-300 rounded font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAccepting(true)}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-medium shadow-sm transition-colors"
            >
              Accept Run
            </button>
          )}
        </div>
      </div>

      {/* Fullscreen Iframe */}
      <div className="flex-1 bg-white relative">
        {port ? (
          <iframe
            src={sessionId ? `http://localhost:${port}/?session=${sessionId}` : `http://localhost:${port}`}
            className="absolute inset-0 w-full h-full border-0"
            title="Workspace"
            sandbox="allow-same-origin allow-scripts allow-forms"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 flex-col gap-2">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <p>Workspace port not available</p>
          </div>
        )}
      </div>
    </div>
  );
}
