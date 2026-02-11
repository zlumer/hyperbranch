import { type Task } from "../../api/service";
import { cn } from "../../lib/utils";
import { useNavigate } from "react-router-dom";

interface TaskCardProps {
  task: Task;
  className?: string;
  isDragging?: boolean;
}

export function TaskCard({ task, className, isDragging }: TaskCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    // Only navigate if we're not dragging
    // react-kanban-kit might handle drag state differently, but for now we rely on the prop
    if (!isDragging) {
      navigate(`/tasks/${task.id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "bg-white p-2 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border border-gray-200",
        className,
      )}
    >
      <div className="text-xs text-gray-500 font-mono">#{task.id}</div>
      <h3 className="font-normal text-sm text-gray-900 truncate" title={task.title}>{task.title}</h3>
    </div>
  );
}
