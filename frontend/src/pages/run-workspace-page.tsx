import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getRun, type Run } from "../api/service";
import { FileBrowser } from "../features/workspace/file-browser";
import { CodeViewer } from "../features/workspace/code-viewer";
import { LogViewer } from "../features/workspace/log-viewer";

export function RunWorkspacePage() {
  const { taskId, runId } = useParams();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"files" | "logs">("files");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (taskId && runId) {
      getRun(taskId, runId)
        .then((data) => setRun(data))
        .catch((error) => console.error(error))
        .finally(() => setLoading(false));
    }
  }, [taskId, runId]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!run || !taskId) return <div className="p-8">Run not found</div>;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar / Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Link
            to={`/tasks/${taskId}`}
            className="text-sm text-blue-600 hover:underline mb-2 block"
          >
            &larr; Back to Task
          </Link>
          <h1 className="font-bold truncate">Run #{run.id}</h1>
          <div className="text-xs text-gray-500">Status: {run.status}</div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 py-2 text-sm font-medium ${
              activeTab === "files"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("files")}
          >
            Files
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium ${
              activeTab === "logs"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("logs")}
          >
            Logs
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "files"
            ? (
              <FileBrowser
                taskId={taskId}
                runId={run.id}
                onSelectFile={setSelectedFile}
                selectedFile={selectedFile}
              />
            )
            : (
              <div className="p-4 text-sm text-gray-500">
                Logs are shown in the main panel when selected.
              </div>
            )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 className="font-semibold">Workspace</h2>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm">
              Rerun
            </button>
            <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">
              Save
            </button>
          </div>
        </div>

        {/* Workspace Content */}
        <div className="flex-1 overflow-hidden bg-white">
          {activeTab === "logs"
            ? <LogViewer taskId={taskId} runId={run.id} />
            : <CodeViewer taskId={taskId} runId={run.id} path={selectedFile} />}
        </div>
      </div>
    </div>
  );
}
