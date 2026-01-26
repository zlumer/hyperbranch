# Hyperbranch

Stop babysitting AI and get back into flow.

No-overhead git-native markdown-native AI agent orchestrator.

## Why (problem)

Modern development with AI agents is hard to manage:
- **Collaboration is missing**: prompting is single-player, developers have to work in isolation with team members being unable to help with prompts
- **Waiting times**: long and unpredictable waiting times between the prompt and the result, leading to distractions
- **Overwhelming**: ad-hoc solutions include running 8 terminals on your screen at once, overwhelming you with internal LLM details
- **Git-fu is non-optional**: running multiple local agents in parallel requires juggling git branches and worktrees
- **Heavy process**: best practices require you to adhere to a very strict prompting protocol with each step being prompted independently -- and as always with unpredictable waiting after every step
- **Loss of task context**: your team receives a +20,710; -8,472 pull request that nobody has time to actually read, and nobody has access to the original prompts anyway, losing the important intentions behind the changed lines of code 

You need Hyperbranch if you find yourself waiting 10 minutes for an AI agent to finish its job only to discover that it misunderstood you and you need to reprompt it and wait more.

## What (features)

Hyperbranch takes care of the process, AI agents take care of the work, and you can finally focus on building what you need.

1. **Collaborate with your team** on prompts, plans, tasks using Git -- the same tool that you already use for code.
2. **Tasks as prompts**: write tasks or specs instead of prompts, refine them automatically, provide additional context for both humans and LLMs.
3. **Clear intentions**: Keep track of not only WHAT has changed (code diff), but also WHY it has changed (tasks/specs).
4. **Work in parallel** without having to manually manage git worktrees or merge branches.
5. **No overhead**: Hyperbranch itself does not require any additional work on top of what you already do with your AI agents. Use same prompts, same workflows, and save time on every step.

## Philosophy

### Minimum new abstractions and concepts

Hyperbranch embraces the existing abstractions, not substitutes them with a new concept.

- Git already has **branches**, so if we want to spin-off from the current state, we use exactly this, a branch.
- AI agents already ingest Markdown files as **prompts**, so we prepare these prompts for them.
- Humans already **collaborate** on documents describing the system and planning future work, so we let them do it.
- Users already **chat** with LLMs to clarify the spec.
- Users already nudge AI agents with **feedback**.
- AI agents already have **plan** mode so we let them plan.
- AI agents alredy have research and codebase exploration **tools**, so we let them use them as they see fit.

Using existing tools has an additional benefit of free improvements when upstream tools get new features.

### No operational overhead

Hyperbranch exists to solve problems, not create them. To reduce entropy, not increase it.

This means:
- Users should not be required to write and maintain manual config files (unless they prefer to change the default settings)
- Users should be able to use their existing skills in coding, prompt writing, agent steering in any way they prefer

### Git-native

Git is the ultimate collaboration tool: we have commits as atomic units of completed work, branches as continuous streams of commits, merges to integrate distributed efforts into a single artifact.

Hyperbranch relies on Git for all of its collaboration purposes, there is no extra sync server.

Hyperbranch relies on Git for all of its storage purposes, there is no extra file storage (in-memory cache can of course be used for perfomance improvements).

### Markdown-native

Hyperbranch uses Markdown format where possible.

Alternatives to Markdown can be more efficient:
- JSON is machine-readable and more strict (that's good) -- same for YAML, TOML etc.
- binary format e.g. Postgres/SQLite can be orders of magnitude faster, provides strict schemas and can be used to model complex relationships between entities

Acknowledging that Markdown is not nearly as efficient or extensible, its main feature is being text-only, so Hyperbranch uses it anyway:
- Markdown/text is human readable and LLM-readable
- Markdown diffs are text diffs -- straightforward to merge or review
- Markdown is basically an LLM-native format, great tooling exists

### No vendor lock-in

If at some point you want to get rid of Hyperbranch, you don't have to migrate your data at all. All your data is stored in your git repo, all your tasks are simply Markdown files.

### Dogfooding

Hyperbranch is being developed from scratch using Hyperbranch. Every line of code is written using the task system (even where manual). Bootstrapping is performed by feeding raw task files to Aider and Opencode.

