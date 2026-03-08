import { useNavigate } from "react-router-dom";
import type { Run } from "../api/service";

export interface RunListItemProps {
  taskId: string;
  run: Run;
  deletingRunId: string | null;
  setDeletingRunId: (id: string | null) => void;
  acceptingRunId: string | null;
  setAcceptingRunId: (id: string | null) => void;
  mergeStrategy: "merge" | "squash" | "rebase";
  setMergeStrategy: (strategy: "merge" | "squash" | "rebase") => void;
  onDelete: (id: string) => void;
  onAccept: (id: string) => void;
  onResume: (id: string) => void;
  onStop: (id: string) => void;
}

export function RunListItem({
  taskId,
  run,
  deletingRunId,
  setDeletingRunId,
  acceptingRunId,
  setAcceptingRunId,
  mergeStrategy,
  setMergeStrategy,
  onDelete,
  onAccept,
  onResume,
  onStop,
}: RunListItemProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow flex flex-col gap-4">
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
            run.status === "completed"
              ? "bg-green-100 text-green-800"
              : run.status === "failed"
              ? "bg-red-100 text-red-800"
              : run.status === "working" || run.status === "starting"
              ? "bg-yellow-100 text-yellow-800"
              : run.status === "paused"
              ? "bg-orange-100 text-orange-800"
              : run.status === "stopped"
              ? "bg-gray-200 text-gray-800"
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
            <button onClick={(e) => { e.stopPropagation(); onDelete(run.id); }} className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
            <button onClick={(e) => { e.stopPropagation(); setDeletingRunId(null); }} className="px-2 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
          </div>
        ) : acceptingRunId === run.id ? (
          <div className="flex items-center gap-2 text-sm">
            <select
              value={mergeStrategy}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setMergeStrategy(e.target.value as "merge" | "squash" | "rebase")}
              className="border border-gray-300 rounded px-2 py-1"
            >
              <option value="squash">Squash</option>
              <option value="merge">Merge</option>
              <option value="rebase">Rebase</option>
            </select>
            <button onClick={(e) => { e.stopPropagation(); onAccept(run.id); }} className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">Confirm Accept</button>
            <button onClick={(e) => { e.stopPropagation(); setAcceptingRunId(null); }} className="px-2 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
          </div>
        ) : (
          <>
            {(run.status === "working" || run.status === "starting") && (
              <button
                onClick={(e) => { e.stopPropagation(); onStop(run.id); }}
                className="text-sm text-yellow-600 hover:text-yellow-800 font-medium"
              >
                Stop Run
              </button>
            )}
            {(run.status === "stopped" || run.status === "paused" || run.status === "failed" || run.status === "completed") && (
              <button
                onClick={(e) => { e.stopPropagation(); onResume(run.id); }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Resume Run
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setAcceptingRunId(run.id); }}
              className="text-sm text-green-600 hover:text-green-800 font-medium ml-4"
            >
              Accept Run
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeletingRunId(run.id); }}
              className="text-sm text-red-600 hover:text-red-800 font-medium ml-auto"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
