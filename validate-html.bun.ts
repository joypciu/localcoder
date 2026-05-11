import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const htmlPath = resolve("sdks/vscode/media/chat.html");

if (!existsSync(htmlPath)) {
  console.error("✗ chat.html not found");
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf-8");

// Basic checks
const checks = [
  { name: "DOCTYPE", test: html.includes("<!DOCTYPE html>") },
  { name: "HTML tag", test: html.includes("<html") && html.includes("</html>") },
  { name: "Head section", test: html.includes("<head>") && html.includes("</head>") },
  { name: "Body section", test: html.includes("<body>") && html.includes("</body>") },
  { name: "Styles", test: html.includes("<style>") && html.includes("</style>") },
  { name: "Inlined script", test: html.includes("<script>") && html.includes("</script>") },
  { name: "Required elements", 
    test: html.includes('id="hdr"') && html.includes('id="msgs"') && html.includes('id="inp"') && html.includes('id="snd"') 
  },
  { name: "Marked.js CDN", test: html.includes("marked") },
  { name: "Highlight.js CDN", test: html.includes("highlight") },
];

let passed = 0;
for (const check of checks) {
  if (check.test) {
    console.log(`✓ ${check.name}`);
    passed++;
  } else {
    console.error(`✗ ${check.name}`);
  }
}

// Check required functions in inline script
const scriptMatch = html.match(/<script>[\s\S]*?<\/script>/);
if (scriptMatch) {
  const script = scriptMatch[0];
  const requiredFunctions = [
    "renderMarkdown",
    "renderToolCall",
    "formatToolOutput",
    "toggleTool",
    "copyCode",
    "addSys",
    "addUser",
    "addAsst",
    "renderTurn",
    "toggleThinking",
  ];
  
  for (const fn of requiredFunctions) {
    if (script.includes(`function ${fn}`) || script.includes(`const ${fn}`) || script.includes(`var ${fn}`)) {
      console.log(`✓ Function: ${fn}`);
      passed++;
    } else {
      console.error(`✗ Missing function: ${fn}`);
    }
  }
  
  // Check for tool-specific formatting
  if (script.includes("tool-read")) console.log("✓ Tool-specific styling (read)");
  if (script.includes("tool-shell")) console.log("✓ Tool-specific styling (shell)");
  if (script.includes("tool-edit")) console.log("✓ Tool-specific styling (edit)");
}

console.log(`\n${passed}/${checks.length + (scriptMatch ? requiredFunctions.length : 0)} checks passed`);

if (passed < checks.length + (scriptMatch ? requiredFunctions.length : 0)) {
  process.exit(1);
}

console.log("✓ All validations passed");
