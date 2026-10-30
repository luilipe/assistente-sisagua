import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(testDir, "..");
const playwrightPath = process.env.SISAGUA_PLAYWRIGHT_PATH || path.join(
  os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright", "index.mjs"
);
if (!fs.existsSync(playwrightPath)) throw new Error("Playwright não encontrado.");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const chromePath = process.env.SISAGUA_CHROME_PATH
  || path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe");
const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ["--no-sandbox", "--disable-gpu"] });

try {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html lang='pt-BR'><body></body></html>");
  await page.evaluate(() => {
    const makeParameter = (nome, nomeLegal, categoria) => ({
      nome, nomeLegal, categoria,
      coleta: "05/06/2026", analise: "12/06/2026", valor: "0,01",
      resultadoOriginal: "< 0,01 μg/L", unidade: "ug/L", unidadeOriginal: "μg/L",
      parametroOriginal: nome, amostra: "90021-1/2026.0", arquivoOrigem: "fixture-sanitizada.txt",
      fonteId: "PRT888_ANEXO9", avaliacaoLegal: categoria === "OUTROS" ? "INFORMATIVO" : "CONFORME",
      decisaoLancamento: "LANCAR", statusSisagua: "SALVO_AUDITADO",
    });
    const batches = [
      {
        schemaVersion: 2, id: "IMPORT-migration-AGROTOXICOS", importGroupId: "IMPORT-migration",
        baseId: "PRT888_LOCAL_2026-07-13_v2", tipo: "SEMESTRAL", ponto: "CAPTACAO_POCO",
        categoria: "AGROTOXICOS", dialogText: "AGROTOXICOS", titulo: "Agrotóxicos — captação",
        cliente: "Cliente sanitizado", amostra: "90021-1/2026.0", arquivoOrigem: "fixture-sanitizada.txt",
        dataColeta: "05/06/2026", pontoIdentificacao: "Saída do Poço",
        parametros: [makeParameter("Clordano Total", "Clordano", "AGROTOXICOS")],
        revisoes: [], _mappedInfo: [{ sisagua: "Clordano Total", original: "Clordano (Trans)" }],
      },
      {
        schemaVersion: 2, id: "IMPORT-migration-OUTROS", importGroupId: "IMPORT-migration",
        baseId: "PRT888_LOCAL_2026-07-13_v2", tipo: "SEMESTRAL", ponto: "CAPTACAO_POCO",
        categoria: "OUTROS", dialogText: "OUTROS", titulo: "Outros — captação",
        cliente: "Cliente sanitizado", amostra: "90021-1/2026.0", arquivoOrigem: "fixture-sanitizada.txt",
        dataColeta: "05/06/2026", pontoIdentificacao: "Saída do Poço",
        parametros: [makeParameter("Nitrogênio Amoniacal", "Nitrogenio Amoniacal Total", "OUTROS")],
        revisoes: [], _mappedInfo: [{ sisagua: "Nitrogênio Amoniacal", original: "Nitrogênio Amoniacal" }],
      },
    ];
    globalThis.__storageData = {
      sisaguaImportedBatchesV2: {
        schemaVersion: 2,
        baseId: "PRT888_LOCAL_2026-07-13_v2",
        savedAt: "2026-08-01T00:00:00.000Z",
        batches,
      },
    };
    globalThis.__setCalls = 0;
    globalThis.chrome = {
      runtime: { getManifest: () => ({ version: "2.0.4" }) },
      storage: { local: {
        async get(key) { return { [key]: globalThis.__storageData[key] }; },
        async set(values) { globalThis.__setCalls += 1; Object.assign(globalThis.__storageData, values); },
      } },
    };
  });

  for (const file of ["legal-data.js", "core.js", "parser.js", "parser-secure.js", "header-contract.js", "content.js"]) {
    await page.addScriptTag({ path: path.join(extensionDir, file) });
  }
  await page.locator("#sisagua-auto-log").filter({ hasText: "nomes antigos migrados" })
    .waitFor({ state: "visible", timeout: 10000 });

  const first = await page.evaluate(() => ({
    payload: structuredClone(globalThis.__storageData.sisaguaImportedBatchesV2),
    setCalls: globalThis.__setCalls,
  }));
  const [agro, outros] = first.payload.batches;
  if (agro.parametros[0].nome !== "Clordano" || outros.parametros[0].nome !== "Nitrogênio Amoniacal Total") {
    throw new Error(`Nomes não migrados: ${JSON.stringify(first.payload.batches)}.`);
  }
  if (agro.parametros[0].statusSisagua !== "SALVO_AUDITADO" || outros.parametros[0].statusSisagua !== "SALVO_AUDITADO") {
    throw new Error("A migração apagou o estado de auditoria.");
  }
  if (agro.auditTrail?.length !== 1 || outros.auditTrail?.length !== 1 || first.payload.schemaVersion !== 2) {
    throw new Error(`Trilha/schema da migração incorretos: ${JSON.stringify(first.payload)}.`);
  }

  await page.evaluate(() => document.querySelector("#sisagua-auto-panel").remove());
  await page.addScriptTag({ path: path.join(extensionDir, "content.js") });
  await page.locator("#sisagua-auto-panel").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(100);
  const second = await page.evaluate(() => ({
    payload: structuredClone(globalThis.__storageData.sisaguaImportedBatchesV2),
    setCalls: globalThis.__setCalls,
  }));
  if (second.setCalls !== first.setCalls || second.payload.batches.some((batch) => batch.auditTrail?.length !== 1)) {
    throw new Error(`Migração não idempotente: ${JSON.stringify({ first: first.setCalls, second: second.setCalls })}.`);
  }

  process.stdout.write("content-storage-migration: idempotente e preserva auditoria ok");
} finally {
  await browser.close();
}
