import { exists } from "@std/fs"
import { join } from "@std/path"
import { create as createTask } from "../services/tasks.ts"

const GITIGNORE_CONTENTS = `.env
.env.*
.runs
.current-run
`

const ENV_RUN_CONTENTS = (apiKey: string) => `GOOGLE_GENERATIVE_AI_API_KEY=${apiKey}
GEMINI_API_KEY=${apiKey}
AIDER_MODEL="gemini/gemini-3.1-pro-preview"
AIDER_WEAK_MODEL="gemini/gemini-3-flash-preview"
`

const TASK_TEXT = `explore the current codebase with a subagent and find out how tasks are tracked (beans, backlog.md, todo list, todo comments)
read https://github.com/zlumer/hyperbranch and learn how to use \`hb\` cli
move all existing tasks that are not yet marked as done to the \`hb\` task tracking`

async function isGitCmd(): Promise<boolean> {
  try {
    const isGitCmd = new Deno.Command("git", { args: ["rev-parse", "--is-inside-work-tree"] })
    const isGitRes = await isGitCmd.output()
    return isGitRes.success
  } catch {
    return false
  }
}

async function getRootGitDir(): Promise<string> {
  const rootCmd = new Deno.Command("git", { args: ["rev-parse", "--show-toplevel"] })
  const rootRes = await rootCmd.output()
  if (rootRes.success) {
    return new TextDecoder().decode(rootRes.stdout).trim()
  }
  return ""
}

async function validateGoogleApiKey(apiKey: string): Promise<"valid" | "invalid" | "unknown"> {
  let retries = 3
  while (retries > 0) {
    try {
      const model = "gemini-3.1-flash-lite-preview"
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "what is the first name of John Smith? REPLY WITH ONLY THE FIRST NAME, NOTHING ELSE" }] }]
        })
      })

      if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          return "invalid"
        }
        retries--
        if (retries === 0) return "unknown"
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
      
      if (!text.toLowerCase().includes("john")) {
        console.warn(`Warning: Unexpected response from Gemini API: ${text}`)
        return "valid" // still valid structurally even if it didn't return what we wanted
      }
      
      return "valid"
    } catch (e) {
      retries--
      if (retries === 0) return "unknown"
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  return "unknown"
}

export async function initCommand() {
  // C-2. if pwd is not in git, warn the user and exit with error
  if (!(await isGitCmd())) {
    console.error("Error: Git is not installed or the current directory is not a git repository.")
    Deno.exit(1)
  }

  // C-3. if pwd is not in git root, warn the user and explain that we will proceed with the root directory
  const gitRoot = await getRootGitDir()
  if (gitRoot && gitRoot !== Deno.cwd()) {
    console.warn(`Warning: The current directory is not the git root. Proceeding with the root directory: ${gitRoot}`)
    Deno.chdir(gitRoot)
  }

  // C-1. if .hyperbranch directory exists, warn the user and ask if should proceed
  const hyperbranchDir = join(Deno.cwd(), ".hyperbranch")
  if (await exists(hyperbranchDir)) {
    const shouldProceed = confirm(".hyperbranch directory already exists. Do you want to proceed and potentially overwrite files?")
    if (!shouldProceed) {
      console.log("Aborting init.")
      Deno.exit(0)
    }
  }

  // S-1: ask the user their Google Gemini key
  console.log("Please provide your Google Gemini API key.")
  console.log("You can get one here: https://aistudio.google.com/app/apikey")
  let apiKey = ""
  while (true) {
    apiKey = prompt("GEMINI_KEY:") || ""
    if (!apiKey.trim()) {
      console.error("API key is required.")
      continue
    }

    // S-2: check that it works using a short fetch
    console.log("Validating API key...")
    const validationResult = await validateGoogleApiKey(apiKey)
    
    if (validationResult === "invalid") {
      console.error("Error: Invalid API key.")
      console.log("Please check your API key and try again.")
      continue
    } else if (validationResult === "unknown") {
      console.error("Failed to connect to the Gemini API or received unexpected error.")
      const proceed = confirm("Could not validate API key. Proceed anyway?")
      if (!proceed) continue
    } else {
      console.log("API key validated successfully.")
    }
    break
  }

  // S-3: create the .hyperbranch/tasks and .hyperbranch/.runs directories
  await Deno.mkdir(join(hyperbranchDir, "tasks"), { recursive: true })
  await Deno.mkdir(join(hyperbranchDir, ".runs"), { recursive: true })

  // S-4: create the .hyperbranch/.gitignore file
  await Deno.writeTextFile(join(hyperbranchDir, ".gitignore"), GITIGNORE_CONTENTS)

  // S-5: create the .hyperbranch/.env.run file
  await Deno.writeTextFile(join(hyperbranchDir, ".env.run"), ENV_RUN_CONTENTS(apiKey))

  // S-6: run 'hb create' to create a test task
  console.log("Creating test task...")
  
  // Using the Tasks service directly to allow setting description easily
  try {
    const task = await createTask("Initial hyperbranch setup", undefined, TASK_TEXT, "todo")
    console.log(`Test task created: ${task.id}`)
  } catch (e) {
    console.error("Failed to create test task:", e)
  }

  // S-7: print info on how to start hyperbranch server (hb web)
  console.log("\\nSuccess! Hyperbranch is initialized.")
  console.log("To view your tasks, start the web interface:")
  console.log("  hb web")
}
