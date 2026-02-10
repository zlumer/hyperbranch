import { useEffect, useRef, useState } from "react";
import { getLogsWebSocketUrl } from "../../api/service";

interface LogViewerProps {
  taskId: string;
  runId: string;
}

export function LogViewer({ taskId, runId }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clear logs when runId changes
    setLogs([]);

    const url = getLogsWebSocketUrl(taskId, runId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.data) {
          setLogs((prev) => [...prev, msg.data]);
        } else if (msg.error) {
          console.error("Log error:", msg.error);
          setLogs((prev) => [...prev, `[Error] ${msg.error}`]);
        }
      } catch (e) {
        console.error("Failed to parse log", event.data, e);
      }
    };

    return () => {
      ws.close();
    };
  }, [taskId, runId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="h-full bg-black text-gray-200 font-mono text-sm p-4 overflow-auto">
      {logs.map((log, i) => (
        <div key={i} className="whitespace-pre-wrap break-all">
          {log}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
