---
task-id: 69t-vjx-3j9
status: todo
---

# Basic CLI scaffolding

To build Hyperbranch we need a way to complete tasks.

To complete tasks, we need a way to create tasks.

Goal #1: create a simple CLI script that will perform the following actions:
1. Create task.
2. Run task and mark completed.

We don't have worktrees and containers just yet, so focus on local development using containerised agents (Opencode, Aider).

## 1. Create task

### Task ID

Task ID is a combination of the current timestamp in ms + some randomness (~3 bits of randomness by appending a 0-9 random suffix).
This level of randomness is definitely not enough to guarantee uniqueness of IDs, although it still reduces the duplicate chance to ~10% for two tasks created in the same millisecond, letting the calling code retry the duplicates. Throughput is theoretically limited to 10 000 tasks per second, but the system is not designed for such load anyway. The only reason why the randomness exists at all is just to spice things up a bit. If we get to a point where 10 000 parallel agents are the norm, we will have to change task IDs to a proper UUIDv7. The only realistic scenario where duplicates can happen is if task IDs are generated in a loop while migrating tasks from some other system.

```typescript
// generate 9 chars dashed
(Date.now()*10 + Math.floor(Math.random() * 10)).toString(36).padStart(9, '0').replace(/.{3}(?!$)/g, '$&-')

// parse 9 chars dashed
new Date(parseInt('01i-qre-70w'.replaceAll('-', ''), 36) / 10)


// pretty 9 chars dashed
function generateTaskId(now = Date.now(), rnd = Math.random())
{
	const RANDOMNESS = 10
	const LEN = 9
	rnd = Math.floor(rnd * RANDOMNESS)
	let numId = now * RANDOMNESS + rnd
	let base36 = numId.toString(36)
	let padded = base36.padStart(LEN, '0')
	let formatted = padded.replace(/.{3}(?!$)/g, '$&-')
	return formatted
}
```

### Directory structure

Task files are created inside the `.hyperbranch/tasks` directory.
We don't have support for cascading directories just yet, so it's always in repository root.

### File format

YAML frontmatter at the top, then Markdown (user input verbatim).

### Properties

We start with just the minimum:

1. Task ID (generated)

2. Status (default is `todo`, other possible are `in_progress|review|done|cancelled`)
- `todo` -- manual user status where no automation occurs
- `in_progress` -- that the agents are currently working on this task (or should work but are not yet working due to queue/limits/dependencies)
- `review` -- waiting for the user to either accept or reject the work
- `done` -- work accepted and branch merged
- `cancelled` -- work not accepted, branch not merged or merged partially, this task is considered cancelled for the purposes of agents learning

3. Dependencies (default empty)
List of tasks that should be completed before this one can be even started.
Main purpose is for manual dependency tracking between tasks, e.g. "redesign DashboardScreen with Tailwind" may be connected to "install Tailwind".
Can also be used to convert a task to "Epic" -- large-scale project with many subtasks.

4. Parent task ID (default empty)
Converts this task to a subtask.
Works as a dependency -- blocks parent task from being worked on by agents until child tasks are complete.
The difference with dependencies is strictly cosmetic.

5. Contents (user input)
The actual markdown contents of the file.

Additional properties will be added later, including automation-related properties.

## 2. Run task

### Purpose

Running tasks is a way of making _experiments_ -- each task is not just something that you need to be done in the current codebase, it's a glimpse to the possible future, one branch at a time. The agents build this future, and the user decides whether it is desirable to make this future reality.

In more clear words, every task run is first and foremost a git branch with some changes in it. Changes can be as small as a single line change inside the task description itself or as big as an entire new project.

Examples of changes:
- small: task description has been changed -- an agent has asked a question and the user resolved it
- small: spec added to the task -- an agent has read the task and created a spec to later implement it
- medium: feature has been implemented by the agent
- large: an epic task with 20 subtasks has been completed by a mix of agents and humans

The task run is a change -- but it's not merged yet. Again, this is only one possible future. The user can run multiple parallel runs of the same task if they want to have more options to choose from. They can introduce slight changes to the wording and run different experiments with different tools/frameworks.

Examples of parallel task runs:
- run 10 parallel agents to implement a hotfix to a critical bug in prod, then choose the cleanest solution or the fastest fix
- run redesign of the website with 3 different styling frameworks and later choose which one looks better
- compare 40 multiple frontend state management libraries and compare the developer experience (don't do that, just use [tesm](https://github.com/zlumer/tesm))
- tell one agent to one-shot and the other to do a step-by-step approach and compare which one works better

As seen from the examples above, not every task run will end with a merge. However, it's not just runs that are cancelled, but also tasks themselves.

Example of tasks that could be cancelled _after_ they were implemented:
- task was deemed unnecessary by the team
- current implementation of the task uncovered a better way to implement it
- agents fail to perform this task so another approach has been chosen
- tried rewriting from Rust to Go but then understood that one of them is a strictly inferior language

Summarising:
1. Task run is a **change**.
2. Task can be run **multiple times** in parallel or sequentially.
3. Task run does **not** necessarily get **merged** into a base branch.

### Spec

