import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function getAddedColorLiterals() {
  try {
    const diff = execFileSync(
      "git",
      ["diff", "--no-ext-diff", "--unified=0", "--", "src"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    const matches = [];
    const lines = diff.split(/\r?\n/);
    let currentFile = "";

    for (const line of lines) {
      if (line.startsWith("+++ b/")) {
        currentFile = line.slice(7);
        continue;
      }

      if (!line.startsWith("+")) continue;
      if (line.startsWith("+++")) continue;

      const fileIsAllowed = /\.(ts|tsx|js|jsx)$/.test(currentFile) && !currentFile.endsWith("/app/globals.css");
      if (!fileIsAllowed) continue;

      const content = line.slice(1);
      const colorPattern = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^\)]*\)|hsla?\([^\)]*\)/g;
      const hits = [...content.matchAll(colorPattern)];

      if (hits.length > 0) {
        matches.push({ file: currentFile, line: content.trim(), value: hits[0][0] });
      }
    }

    return matches;
  } catch {
    return [];
  }
}

const offenders = getAddedColorLiterals();

if (offenders.length > 0) {
  console.error("Hard-coded color literals are not allowed in new or changed source code:");
  for (const { file, line, value } of offenders) {
    console.error(`- ${file}: ${value} :: ${line}`);
  }
  process.exit(1);
}

console.log("No new hard-coded color literals detected in the source diff.");
