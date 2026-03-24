import { generateRouter } from "orpc-file-based-router"
import { join } from "node:path"
import * as fs from "node:fs/promises"

const __dirname = import.meta.dirname
const routesDir = join(__dirname, "routes")
const outputFile = join(__dirname, "router.ts")

console.log(`Generating router from ${routesDir} to ${outputFile}...`)

await generateRouter(routesDir, outputFile, {
  importExtension: ".ts",
})

// Fix paths in generated router
const content = await fs.readFile(outputFile, "utf-8")
let fixedContent = content.replace(/path: '\/root'/g, "path: '/'")
fixedContent = fixedContent.replace(/path: ''/g, "path: '/'") // just in case
await fs.writeFile(outputFile, fixedContent, "utf-8")

console.log("Router generated successfully.")
