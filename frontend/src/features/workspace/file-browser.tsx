import { useState, useEffect } from 'react';
import { getFiles, type FileNode } from '../../api/mock-service';
import { Folder, FileText, ChevronRight, ChevronDown } from 'lucide-react';

interface FileBrowserProps {
  runId: string;
  onSelectFile: (path: string) => void;
  selectedFile: string | null;
}

interface FileTreeNodeProps {
  node: FileNode;
  level: number;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}

const FileTreeNode = ({ node, level, onSelect, selectedPath }: FileTreeNodeProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected = node.path === selectedPath;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'directory') {
      setIsOpen(!isOpen);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div style={{ paddingLeft: `${level * 12}px` }}>
      <div
        className={`flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 ${
          isSelected ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
        }`}
        onClick={handleToggle}
      >
        <span className="mr-1 text-gray-400 w-4 flex justify-center">
          {node.type === 'directory' && (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          )}
        </span>
        <span className="mr-2 text-blue-500">
          {node.type === 'directory' ? <Folder size={16} /> : <FileText size={16} className="text-gray-500" />}
        </span>
        <span className="text-sm truncate select-none">{node.name}</span>
      </div>
      {node.type === 'directory' && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function FileBrowser({ runId, onSelectFile, selectedFile }: FileBrowserProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getFiles(runId)
      .then(setFiles)
      .catch((err) => console.error('Failed to load files:', err))
      .finally(() => setLoading(false));
  }, [runId]);

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
          />
        ))}
      </div>
    </div>
  );
}
