import { BoardColumnTypeSchema, useBoardContext } from "../../context/board-context";
import { type BoardData, type BoardItem, type BoardProps, Kanban } from "react-kanban-kit";
import { TaskCard } from "./TaskCard";
import { useMemo, useState } from "react";
import { type Task } from "../../api/service";
import { TaskCreateModal } from "./TaskCreateModal";

// Redefine locally since it's not exported from main entry
type CardRenderProps = {
  data: BoardItem;
  column: BoardItem;
  index: number;
  isDraggable: boolean;
};

const transformToBoardData = (tasks: Task[], columns: string[]): BoardData => {
  const data: any = {
    root: {
      id: "root",
      title: "Board",
      parentId: null,
      children: columns,
      totalChildrenCount: columns.length,
      type: "board",
    },
  };

  columns.forEach((colId) => {
    const colTasks = tasks.filter((t) => t.status === colId).sort((a, b) =>
      a.order - b.order
    );
    // Add column node
    data[colId] = {
      id: colId,
      title: colId,
      parentId: "root",
      children: colTasks.map((t) => t.id),
      totalChildrenCount: colTasks.length,
      totalItems: colTasks.length,
      type: "column",
    };

    // Add task nodes
    colTasks.forEach((task) => {
      data[task.id] = {
        id: task.id,
        title: task.title,
        parentId: colId,
        children: [],
        totalChildrenCount: 0,
        type: "task",
        // We attach our full task object to 'content' so we can render it later
        content: task,
      };
    });
  });

  return data;
};

export function Board() {
  const { tasks, columns, isLoading, moveTask, addTask } = useBoardContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalColumnId, setModalColumnId] = useState<string>("");

  const boardData = useMemo(() => transformToBoardData(tasks, columns), [
    tasks,
    columns,
  ]);

  const configMap: BoardProps["configMap"] = {
    column: {
      render: ({ data }: CardRenderProps) => (
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg uppercase text-gray-700">
            {data.title}
          </h2>
          <span className="bg-gray-200 text-gray-600 text-sm px-2 py-1 rounded-full">
            {data.totalItems || data.totalChildrenCount}
          </span>
        </div>
      ),
      isDraggable: false,
    },
    task: {
      render: ({ data }: CardRenderProps) => <TaskCard task={data.content} />,
      isDraggable: true,
    },
  };

  const handleCardMove = async (
    { cardId, toColumnId, position }: {
      cardId: string;
      toColumnId: string;
      position: number;
    },
  ) => {
	const parsedToColumnId = BoardColumnTypeSchema.parse(toColumnId)
    if (columns.includes(parsedToColumnId)) {
      await moveTask(cardId, parsedToColumnId, position);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xl text-gray-500 animate-pulse">
          Loading board...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto relative">
      <Kanban
        dataSource={boardData}
        configMap={configMap}
        onCardMove={handleCardMove}
        columnWrapperClassName={() => ""}
        columnHeaderClassName={() => "px-4 pt-4"}
        columnListContentClassName={() => "flex-1 space-y-3 min-h-[100px] mb-1"}
		columnClassName={() => "px-1"}
		columnStyle={() => ({ padding: "4px" })}
		cardWrapperClassName=""
        renderColumnFooter={(col: BoardItem) => (
          <div className="px-4 pb-4 mt-2">
            <button
              onClick={() => {
                setModalColumnId(col.id as string);
                setIsModalOpen(true);
              }}
              className="w-full py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md border border-dashed border-gray-300 transition-colors"
            >
              + Create Task
            </button>
          </div>
        )}
      />
      
      <TaskCreateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        defaultStatus={modalColumnId}
        onSubmit={(title, description) => {
          addTask({
            title,
            description,
            status: modalColumnId,
          });
        }}
      />
    </div>
  );
}
