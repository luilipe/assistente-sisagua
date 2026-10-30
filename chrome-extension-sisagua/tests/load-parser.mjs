import fs from "node:fs";
import vm from "node:vm";

for (const relativePath of [
  "../legal-data.js",
  "../core.js",
  "../parser.js",
  "../parser-secure.js",
]) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  vm.runInThisContext(fs.readFileSync(sourceUrl, "utf8"), { filename: sourceUrl.pathname });
}

export const parser = globalThis.SISAGUA_PARSER;
export const core = globalThis.SISAGUA_CORE;
export const legalBase = globalThis.SISAGUA_LEGAL_BASE;
