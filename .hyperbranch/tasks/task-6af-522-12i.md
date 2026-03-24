---
id: 6af-522-12i
status: done
parent: null
dependencies: []
---
# cli: hb init

we need a `hb init` command in the cli that will set up the current project for the user.

checks:
C-1. if `.hyperbranch` directory exists, warn the user and ask if should proceed
C-2. if pwd is not in git, warn the user and exit with error
C-3. if pwd is not in git root, warn the user and explain that we will proceed with the root directory (subdirectories are not supported yet, but will be some time in the future)

steps:
S-1: ask the user their Google Gemini key (show url `https://aistudio.google.com/app/apikey`)
S-2: when they provide the key, check that it works using a short fetch for the cheapest google model `gemini-3.1-flash-lite-preview` (prompt "what is the first name of John Smith? REPLY WITH ONLY THE FIRST NAME, NOTHING ELSE" and check that the response contains "john" case-insensitive)
S-3: create the `.hyperbranch/tasks` and `.hyperbranch/.runs` directories (mkdir -p)
S-4: create the `.hyperbranch/.gitignore` file (contents below)
S-5: create the `.hyperbranch/.env.run` file (contents below)
S-6: run `hb create` to create a test task (text below)
S-7: print info on how to start hyperbranch server (`hb web`)

---

S-4 `.hyperbranch/.gitignore` contents:
```
.env
.env.*
.runs
.current-run
```

---

S-5 `.hyperbranch/.env.run` contents:
```
GOOGLE_GENERATIVE_AI_API_KEY=<user-provided GEMINI_KEY>
GEMINI_API_KEY=<user-provided GEMINI_KEY>
AIDER_MODEL="gemini/gemini-3.1-pro-preview"
AIDER_WEAK_MODEL="gemini/gemini-3-flash-preview"
```

---

S-6 task text:
```
explore the current codebase with a subagent and find out how tasks are tracked (beans, backlog.md, todo list, todo comments)
read https://github.com/zlumer/hyperbranch and learn how to use `hb` cli
move all existing tasks that are not yet marked as done to the `hb` task tracking
```