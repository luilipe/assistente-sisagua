import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(testDir, "..");
const playwrightPath = process.env.SISAGUA_PLAYWRIGHT_PATH || path.join(
  os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright", "index.mjs"
);
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const chromePath = process.env.SISAGUA_CHROME_PATH
  || path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe");
const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ["--no-sandbox", "--disable-gpu"] });

try {
  const page = await browser.newPage();
  const parameterBlock = (id, name, status, values) => `
    <h3 class="ui-accordion-header" id="${id}-header">${name} - VMP 10 µg/L - Status: ${status}</h3>
    <div class="ui-accordion-content">
      <h4 class="ui-accordion-header">Ponto de captação — Saída do Poço</h4>
      <div class="ui-accordion-content">
        <input id="${id}-dataColeta_input" value="${values.coleta}">
        <input id="${id}-dataAnalise_input" value="${values.analise}">
        <input id="${id}-campoResultado" value="${values.resultado}">
        <button type="button">VALIDAR</button>
      </div>
    </div>`;
  await page.setContent(`<!doctype html><html lang="pt-BR"><body>
    <div class="ui-dialog">
      <h2>AGROTOXICOS</h2>
      ${parameterBlock("diuron", "Diuron", "S", { coleta: "05/06/2026", analise: "12/06/2026", resultado: "999" })}
      ${parameterBlock("metolacloro", "Metolacloro", "N", { coleta: "", analise: "", resultado: "" })}
      <button id="save-category" type="button">SALVAR</button>
    </div>
  </body></html>`);
  await page.evaluate(() => {
    const storageData = {};
    globalThis.chrome = {
      runtime: { getManifest: () => ({ version: "2.0.4" }) },
      storage: { local: {
        async get(key) { return { [key]: storageData[key] }; },
        async set(values) { Object.assign(storageData, values); },
      } },
    };
    globalThis.__mutations = { input: 0, validate: 0, save: 0 };
    document.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => { globalThis.__mutations.input += 1; });
      input.addEventListener("change", () => { globalThis.__mutations.input += 1; });
    });
    document.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      if (button.textContent === "VALIDAR") globalThis.__mutations.validate += 1;
      if (button.textContent === "SALVAR") globalThis.__mutations.save += 1;
    }));
    const makeParameter = (nome, valor) => ({
      nome, nomeLegal: nome, categoria: "AGROTOXICOS",
      coleta: "05/06/2026", analise: "12/06/2026", valor,
      resultadoOriginal: `< ${valor} μg/L`, unidade: "ug/L", unidadeOriginal: "μg/L",
      parametroOriginal: nome, amostra: "90022-1/2026.0", arquivoOrigem: "fixture-sanitizada.txt",
      fonteId: "PRT888_ANEXO9", avaliacaoLegal: "CONFORME", decisaoLancamento: "LANCAR",
    });
    globalThis.SISAGUA_BATCHES = [{
      schemaVersion: 2, id: "IMPORT-existing-status-AGROTOXICOS", importGroupId: "IMPORT-existing-status",
      baseId: "PRT888_LOCAL_2026-07-13_v2", tipo: "SEMESTRAL", ponto: "CAPTACAO_POCO",
      categoria: "AGROTOXICOS", dialogText: "AGROTOXICOS", titulo: "Agrotóxicos — captação",
      cliente: "Cliente sanitizado", amostra: "90022-1/2026.0", arquivoOrigem: "fixture-sanitizada.txt",
      dataColeta: "05/06/2026", pontoIdentificacao: "Saída do Poço",
      parametros: [makeParameter("Diuron", "0,01"), makeParameter("Metolacloro", "0,02")],
      revisoes: [],
    }];
  });

  for (const file of ["legal-data.js", "core.js", "parser.js", "parser-secure.js", "header-contract.js", "content.js"]) {
    await page.addScriptTag({ path: path.join(extensionDir, file) });
  }
  await page.locator("#sisagua-auto-start").click();
  await page.locator("#sisagua-auto-preflight-check").check();
  await page.locator("#sisagua-auto-preflight-confirm").click();
  await page.locator("#sisagua-auto-log").filter({ hasText: "Status S existente diverge do lote" })
    .waitFor({ state: "visible", timeout: 10000 });

  const result = await page.evaluate(() => ({
    mutations: globalThis.__mutations,
    metolacloro: document.querySelector("#metolacloro-campoResultado").value,
    log: document.querySelector("#sisagua-auto-log").textContent,
  }));
  if (result.mutations.input || result.mutations.validate || result.mutations.save || result.metolacloro) {
    throw new Error(`Divergência em Status S permitiu alterações: ${JSON.stringify(result)}.`);
  }
  if (!result.log.includes("Valor quantificado '999' diverge do lote '0,01'")) {
    throw new Error(`Divergência de valor não foi descrita: ${result.log}.`);
  }

  process.stdout.write("content-existing-status-audit: divergência bloqueada antes de novas alterações ok");
} finally {
  await browser.close();
}
