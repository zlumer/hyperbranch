import { useEffect, useState } from "react";
import { getFileContent } from "../../api/service";

interface CodeViewerProps {
  taskId: string;
  runId: string;
  path: string | null;
}

export function CodeViewer({ taskId, runId, path }: CodeViewerProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setContent("");
      return;
    }

    setLoading(true);
    setError(null);
    getFileContent(taskId, runId, path)
      .then(setContent)
      .catch((err) => {
        console.error("Failed to load file content:", err);
        setError("Failed to load file content");
      })
      .finally(() => setLoading(false));
  }, [taskId, runId, path]);

  if (!path) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Select a file to view content
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-500">{error}</div>;
  }

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="p-3 border-b border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 flex items-center">
        <span>{path}</span>
      </div>
      <div className="flex text-sm font-mono overflow-auto relative">
        <div className="bg-gray-50 border-r border-gray-200 py-4 px-2 text-right text-gray-400 select-none min-w-[3rem]">
          {content.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <pre className="p-4 m-0 overflow-auto whitespace-pre tab-4">
          <code>{content}</code>
        </pre>
      </div>
    </div>
  );
}
