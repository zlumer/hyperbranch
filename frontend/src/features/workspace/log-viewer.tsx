import { useState, useEffect, useRef } from 'react';
import { getLogs, type LogEntry } from '../../api/mock-service';

interface LogViewerProps {
  runId: string;
}

export function LogViewer({ runId }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial fetch
    getLogs(runId).then(setLogs);

    // Poll for updates (simulated live logs)
    const interval = setInterval(() => {
      getLogs(runId).then((newLogs) => {
        // In a real app we'd probably append only new logs, 
        // but here we just replace for simplicity as the mock returns all logs
        setLogs(newLogs);
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [runId]);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="bg-gray-900 text-gray-300 font-mono text-sm h-full overflow-auto p-4">
      {logs.map((log, index) => (
        <div key={index} className="mb-1 break-words">
          <span className="text-gray-500 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
          <span className={
            log.level === 'error' ? 'text-red-400' :
            log.level === 'warn' ? 'text-yellow-400' :
            'text-green-400'
          }>
            {log.message}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
