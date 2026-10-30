import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legalBase } from "./load-parser.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..", "..");
const metaText = fs.readFileSync(path.join(root, "referencias", "limites_legais_sisagua.meta"), "utf8");
const csvText = fs.readFileSync(path.join(root, "referencias", "limites_legais_sisagua.csv"), "utf8");
const meta = Object.fromEntries(
  metaText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    })
);
const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
const columns = lines.shift().split(";");
const rows = lines.map((line) => (
  Object.fromEntries(columns.map((column, index) => [column, line.split(";")[index].trim()]))
));

if (legalBase.baseId !== meta.base_id || legalBase.status !== meta.status) {
  throw new Error("Metadado legal incorporado à extensão está desatualizado.");
}
if (JSON.stringify(legalBase.rows) !== JSON.stringify(rows)) {
  throw new Error("legal-data.js diverge do CSV legal. Execute a geração antes de distribuir a extensão.");
}

process.stdout.write("legal-data-consistency: ok");
