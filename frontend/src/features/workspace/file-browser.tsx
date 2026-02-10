import { useEffect, useState } from "react";
import { type FileNode, getFiles } from "../../api/service";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Loader2,
} from "lucide-react";

interface FileBrowserProps {
  taskId: string;
  runId: string;
  onSelectFile: (path: string) => void;
  selectedFile: string | null;
}

interface FileTreeNodeProps {
  node: FileNode;
  level: number;
  onSelect: (path: string) => void;
  selectedPath: string | null;
  onExpand: (node: FileNode) => Promise<void>;
}

const FileTreeNode = (
  { node, level, onSelect, selectedPath, onExpand }: FileTreeNodeProps,
) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isSelected = node.path === selectedPath;

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === "directory") {
      if (!isOpen && !node.children) {
        setLoading(true);
        try {
          await onExpand(node);
        } catch (e) {
          console.error("Failed to expand", e);
        } finally {
          setLoading(false);
        }
      }
      setIsOpen(!isOpen);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div style={{ paddingLeft: `${level * 12}px` }}>
      <div
        className={`flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 ${
          isSelected ? "bg-blue-100 text-blue-700" : "text-gray-700"
        }`}
        onClick={handleToggle}
      >
        <span className="mr-1 text-gray-400 w-4 flex justify-center">
          {node.type === "directory"
            ? (
              loading
                ? <Loader2 size={14} className="animate-spin" />
                : (isOpen
                  ? <ChevronDown size={14} />
                  : <ChevronRight size={14} />)
            )
            : <span className="w-4" />}
        </span>
        <span className="mr-2 text-blue-500">
          {node.type === "directory"
            ? <Folder size={16} />
            : <FileText size={16} className="text-gray-500" />}
        </span>
        <span className="text-sm truncate select-none">{node.name}</span>
      </div>
      {node.type === "directory" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
              onExpand={onExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function FileBrowser(
  { taskId, runId, onSelectFile, selectedFile }: FileBrowserProps,
) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getFiles(taskId, runId, "")
      .then(setFiles)
      .catch((err) => console.error("Failed to load files:", err))
      .finally(() => setLoading(false));
  }, [taskId, runId]);

  const handleExpand = async (node: FileNode) => {
    // Fetch children
    const children = await getFiles(taskId, runId, node.path);

    // Update state recursively
    const updateNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.map((n) => {
        if (n.path === node.path) {
          return { ...n, children };
        }
        if (n.children) {
          return { ...n, children: updateNodes(n.children) };
        }
        return n;
      });
    };

    setFiles((prev) => updateNodes(prev));
  };

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Loading files...</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 border-r border-gray-200">
      <div className="p-3 font-semibold text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-100">
        Explorer
      </div>
      <div className="p-2">
        {files.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            level={0}
            onSelect={onSelectFile}
            selectedPath={selectedFile}
            onExpand={handleExpand}
          />
        ))}
      </div>
    </div>
  );
}
