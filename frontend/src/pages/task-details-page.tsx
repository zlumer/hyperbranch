import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTask, getRuns, type Task, type Run } from '../api/mock-service';

export function TaskDetailsPage() {
  const { taskId } = useParams();
  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (taskId) {
      Promise.all([getTask(taskId), getRuns(taskId)])
        .then(([taskData, runsData]) => {
          setTask(taskData);
          setRuns(runsData);
        })
        .catch((error) => console.error(error))
        .finally(() => setLoading(false));
    }
  }, [taskId]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!task) return <div className="p-8">Task not found</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Back to Board</Link>
        <h1 className="text-3xl font-bold mb-2">{task.title}</h1>
        <div className="flex items-center gap-2 mb-4">
          <span className={`px-2 py-1 rounded text-sm font-medium ${
            task.status === 'done' ? 'bg-green-100 text-green-800' :
            task.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {task.status}
          </span>
          <span className="text-gray-500 text-sm">ID: {task.id}</span>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
          <h2 className="text-lg font-semibold mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{task.description || 'No description provided.'}</p>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">Runs</h2>
        {runs.length === 0 ? (
          <p className="text-gray-500">No runs found for this task.</p>
        ) : (
          <div className="grid gap-4">
            {runs.map((run) => (
              <Link 
                key={run.id} 
                to={`/tasks/${taskId}/runs/${run.id}`}
                className="block bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">Run #{run.id}</div>
                    <div className="text-sm text-gray-500">{new Date(run.createdAt).toLocaleString()}</div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    run.status === 'success' ? 'bg-green-100 text-green-800' :
                    run.status === 'failed' ? 'bg-red-100 text-red-800' :
                    run.status === 'running' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {run.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
