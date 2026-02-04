// --- Types ---
export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "cancelled";
export interface TaskFrontmatter
{
	id: string;
	status: TaskStatus;
	parent: string | null;
	dependencies: string[];
	[key: string]: unknown;
}
export interface TaskFile
{
	id: string;
	path: string;
	frontmatter: TaskFrontmatter;
	body: string;
}
