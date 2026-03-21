import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { getRun, getRunSession, acceptRun, syncRun, type Run, getRunPort, getRunsStatusWebSocketUrl } from "../api/service";

export function RunWorkspacePage() {
  const { taskId, runId } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [port, setPort] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<"merge" | "squash" | "rebase">("squash");

  useEffect(() => {
    if (taskId && runId) {
      Promise.all([
        getRun(taskId, runId).catch(err => {
          console.error(err);
          return null;
        }),
		getRunPort(taskId, runId).catch(err => {
		  console.error("Failed to get run port", err);
		  return null;
		}),
        getRunSession(taskId, runId).catch(err => {
          console.error("Failed to get session", err);
          return null;
        })
      ])
        .then(([runData, portData, sessionData]) => {
          if (runData) setRun(runData);
          if (portData) setPort(portData);
          if (sessionData) setSessionId(sessionData.sessionId);
        })
        .finally(() => setLoading(false));

      // Setup WebSocket for real-time drift updates
      const wsUrl = getRunsStatusWebSocketUrl(taskId);
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const updatedRuns: Run[] = JSON.parse(event.data);
          const updatedRun = updatedRuns.find(r => String(r.id) === String(runId));
          if (updatedRun) {
            setRun(updatedRun);
          }
        } catch (err) {
          console.error("Failed to parse websocket message", err);
        }
      };

      return () => {
        ws.close();
      };
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

  const handleSyncRun = async () => {
    if (!taskId || !runId) return;
    setSyncing(true);
    try {
      await syncRun(taskId, runId);
      // We don't need to unset syncing immediately, it should just show a spinner
      // or we can wait a bit for ws to update it or rely on the user seeing progress
      setTimeout(() => {
         setSyncing(false);
      }, 2000); // Temporary fake delay for UX, websocket should update actual drift later
    } catch (err) {
      console.error("Failed to sync run", err);
      alert("Failed to update branch.");
      setSyncing(false);
    }
  };

  if (loading) return <div className="p-8">Loading workspace...</div>;
  if (!run || !taskId) return <div className="p-8">Run not found</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm flex flex-col">
        {run.drift && run.drift.behind > 0 && run.drift.isFfAble === false && (
          <div className="bg-yellow-50 px-4 py-2 border-b border-yellow-200 text-yellow-800 text-sm flex items-center justify-center gap-2">
            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span>Branch has diverged. Updating will use Smart Merge.</span>
          </div>
        )}
        <div className="px-4 py-2 flex justify-between items-center">
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
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 font-medium group relative">
                  ({run.drift.behind}↓ {run.drift.ahead}↑)
                  {run.drift.behind > 0 && (
                    <div className="absolute top-full mt-1 hidden group-hover:block bg-white border border-gray-200 shadow-lg rounded p-2 text-xs text-gray-700 z-10 w-48">
                      {run.drift.behind} new commits from base branch.
                    </div>
                  )}
                </span>
                {run.drift.behind > 0 && (
                  <button
                    onClick={handleSyncRun}
                    disabled={syncing}
                    className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded text-xs font-medium shadow-sm transition-colors flex items-center gap-1 ml-2 disabled:opacity-50"
                  >
                    {syncing ? (
                      <svg className="animate-spin h-3 w-3 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    )}
                    <span>Update Branch</span>
                  </button>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-sm">
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
