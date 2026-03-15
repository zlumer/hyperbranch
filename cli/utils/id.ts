function parseRunIdx(runIdx: string | number | undefined): number | undefined
{
	if (typeof runIdx == "number")
		return runIdx

	if (typeof runIdx == "string" && /^\d+$/.test(runIdx))
		return parseInt(runIdx, 10)

	return undefined
}
export function parseTaskOrRunId(idStr: string | undefined, runIndex?: number | string | undefined): { taskId: string, hasRunIndex: boolean, runIndex?: number } | undefined
{
	if (!idStr)
		return undefined

	runIndex = parseRunIdx(runIndex)
	const overrideRunIndex = typeof runIndex == "number"

	const branchNameMode = idStr.startsWith(`${HB_PREFIX}/`) 
	idStr = stripHbPrefix(idStr)

	// parse run branch format without "hb" prefix: "<taskId>/<runIndex>"
	const shortBranchMatch = idStr.match(/^([^/\s]+)\/(\d+)$/)
	if (shortBranchMatch)
		return { taskId: shortBranchMatch[1], hasRunIndex: true, runIndex: overrideRunIndex ? runIndex : parseInt(shortBranchMatch[2], 10) }

	// parse slug format: "hb-<taskId>-<runIndex>"
	const slugMatch = idStr.match(/^(\w+)-(\d+)$/)
	if (!branchNameMode && slugMatch)
		return { taskId: slugMatch[1], hasRunIndex: true, runIndex: overrideRunIndex ? runIndex : parseInt(slugMatch[2], 10) }

	// fallback: treat entire string as taskId
	return { taskId: idStr, hasRunIndex: overrideRunIndex, runIndex }
}

export let HB_PREFIX = "hb"

export function stripHbPrefix(id: string): string
{
	if (id.startsWith(`${HB_PREFIX}/`))
		return id.slice(HB_PREFIX.length + 1)
	if (id.startsWith(`${HB_PREFIX}-`))
		return id.slice(HB_PREFIX.length + 1)
	return id
}

export class TaskId
{
	public readonly id: string;

	constructor(taskId: string)
	{
		if (!taskId || typeof taskId !== "string" || /[\/\s]/.test(taskId))
			throw new Error(`Invalid task ID: "${taskId}". Task IDs must be non-empty strings without slashes or whitespace.`)
		
		const parsed = parseTaskOrRunId(taskId)
		if (!parsed)
			throw new Error(`Unable to parse task ID: "${taskId}"`)

		this.id = taskId;
	}

	static from(idStr: string | undefined): TaskId | undefined
	{
		if (!idStr)
			return undefined

		try
		{
			const task = new TaskId(idStr)
			return task
		}
		catch (_e)
		{
			return undefined
		}
	}

	/**
	 * Convert this task ID to the corresponding git branch name. Format: "hb/<taskId>"
	 * @returns {string} The git branch name for this task ID
	 * @example For task ID "abc", this would return "hb/abc"
	 * @see {RunId.toBranchName} for the corresponding run-level branch format
	 */
	toBranchName(): string
	{
		return `${HB_PREFIX}/${this.id}`
	}

	/**
	 * Get the prefix for run-level branches. Format: "hb/<taskId>/"
	 * This is used for matching and listing all run branches associated with this task.
	 * For example, if the task ID is "abc", all run branches would be named like "hb/abc/1", "hb/abc/2", etc.
	 * This method returns the common prefix "hb/abc/" for easy matching.
	 * @returns {string} The prefix for run-level branches
	 * @example For task ID "abc", this would return "hb/abc/"
	 */
	runBranchPrefix(): string
	{
		return `${this.toBranchName()}/`
	}

	/**
	 * Convert this task ID to a directory-friendly slug format. Format: "hb-<taskId>"
	 * This is used for git remotes, since git remote names cannot contain slashes.
	 * @returns {string} The directory slug for this task ID
	 * @example For task ID "abc", this would return "hb-abc"
	 */
	toDirectorySlug(): string
	{
		return `${HB_PREFIX}-${this.id}`
	}

	toRunId(runIdx: number): RunId
	{
		return new RunId(this, runIdx)
	}
	toString(): string
	{
		return this.id
	}
}

export class RunId
{
	public readonly task: TaskId
	public readonly idx: number;

	constructor(task: TaskId, runIdx: number)
	{
		this.task = task;
		this.idx = runIdx;
	}

	static fromString(idStr: string | undefined): RunId | undefined
	{
		return RunId.from(parseTaskOrRunId(idStr))
	}
	static from(ids: ReturnType<typeof parseTaskOrRunId>): RunId | undefined
	{
		if (!ids?.hasRunIndex || ids.runIndex === undefined)
			return undefined

		const task = new TaskId(ids.taskId)
		return new RunId(task, ids.runIndex)
	}

	/**
	 * Convert this run ID to the corresponding git branch name. Format: "hb/<taskId>/<runIndex>"
	 * @returns {string} The git branch name for this run ID
	 * @example For task ID "abc" and run index 1, this would return "hb/abc/1"
	 */
	toBranchName(): string
	{
		return `${this.task.toBranchName()}/${this.idx}`
	}

	/**
	 * Use a directory-friendly slug format for git remotes, since git remote names cannot contain slashes. Format: "hb-<taskId>-<runIdx>"
	 * @returns {string} The directory slug for this run ID
	 * @example For task ID "abc" and run index 1, this would return "hb-abc-1"
	 * @see {TaskId.toDirectorySlug} for the corresponding task-level slug
	 */
	toDirectorySlug(): string
	{
		return `${this.task.toDirectorySlug()}-${this.idx}`
	}
	toString(): string
	{
		return `${this.task.id}/${this.idx}`
	}
}
