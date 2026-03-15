import { generateRouter } from "orpc-file-based-router"
import { join, fromFileUrl, dirname } from "@std/path"

const __dirname = dirname(fromFileUrl(import.meta.url))
const routesDir = join(__dirname, "routes")
const outputFile = join(__dirname, "router.ts")

console.log(`Generating router from ${routesDir} to ${outputFile}...`)

await generateRouter(routesDir, outputFile, {
  importExtension: ".ts",
})

// Fix paths in generated router
const content = await Deno.readTextFile(outputFile)
let fixedContent = content.replace(/path: '\/root'/g, "path: '/'")
fixedContent = fixedContent.replace(/path: ''/g, "path: '/'") // just in case
await Deno.writeTextFile(outputFile, fixedContent)

console.log("Router generated successfully.")
