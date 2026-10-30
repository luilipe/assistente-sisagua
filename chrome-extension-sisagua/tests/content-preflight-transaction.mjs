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
  const presentNames = [
    "Diuron", "Metolacloro", "Molinato", "Lindano (gama HCH)", "2,4 D",
    "Profenofós", "Simazina", "Tebuconazol", "Terbufós", "Trifluralina",
  ];
  await page.setContent(`
    <!doctype html><html lang="pt-BR"><body>
      <div class="ui-dialog" id="category-dialog">
        <h2>AGROTOXICOS</h2>
        ${presentNames.map((name, index) => `
          <h3 class="ui-accordion-header" id="header-${index}">${name} - VMP 1 µg/L - Status: N</h3>
          <div class="ui-accordion-content"><input class="data-field"><button type="button">VALIDAR</button></div>
        `).join("")}
        <button id="save-category" type="button">SALVAR</button>
      </div>
    </body></html>
  `);

  await page.evaluate((names) => {
    const storageData = {};
    globalThis.chrome = {
      runtime: { getManifest: () => ({ version: "2.0.4" }) },
      storage: { local: {
        async get(key) { return { [key]: storageData[key] }; },
        async set(values) { Object.assign(storageData, values); },
      } },
    };
    globalThis.__mutations = { input: 0, validate: 0, save: 0 };
    document.querySelectorAll(".data-field").forEach((input) => {
      input.addEventListener("input", () => { globalThis.__mutations.input += 1; });
      input.addEventListener("change", () => { globalThis.__mutations.input += 1; });
    });
    document.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.textContent === "VALIDAR") globalThis.__mutations.validate += 1;
        if (button.textContent === "SALVAR") globalThis.__mutations.save += 1;
      });
    });
    const allNames = [...names, "Clordano"];
    globalThis.SISAGUA_BATCHES = [{
      schemaVersion: 2,
      id: "IMPORT-preflight-AGROTOXICOS",
      importGroupId: "IMPORT-preflight",
      baseId: "PRT888_LOCAL_2026-07-13_v2",
      tipo: "SEMESTRAL",
      ponto: "CAPTACAO_POCO",
      categoria: "AGROTOXICOS",
      dialogText: "AGROTOXICOS",
      titulo: "Agrotóxicos — captação",
      cliente: "Cliente sanitizado",
      amostra: "90020-1/2026.0",
      arquivoOrigem: "fixture-sanitizada.txt",
      dataColeta: "05/06/2026",
      pontoIdentificacao: "Saída do Poço",
      parametros: allNames.map((nome) => ({
        nome,
        nomeLegal: nome === "Clordano" ? "Clordano" : nome,
        categoria: "AGROTOXICOS",
        coleta: "05/06/2026",
        analise: "12/06/2026",
        valor: "0,01",
        resultadoOriginal: "< 0,01 μg/L",
        unidade: "ug/L",
        unidadeOriginal: "μg/L",
        parametroOriginal: nome,
        amostra: "90020-1/2026.0",
        arquivoOrigem: "fixture-sanitizada.txt",
        fonteId: "PRT888_ANEXO9",
        avaliacaoLegal: "CONFORME",
        decisaoLancamento: "LANCAR",
      })),
      revisoes: [],
    }];
  }, presentNames);

  for (const file of ["legal-data.js", "core.js", "parser.js", "parser-secure.js", "header-contract.js", "content.js"]) {
    await page.addScriptTag({ path: path.join(extensionDir, file) });
  }

  await page.locator("#sisagua-auto-start").click();
  await page.locator("#sisagua-auto-preflight").waitFor({ state: "visible" });
  await page.locator("#sisagua-auto-preflight-check").check();
  await page.locator("#sisagua-auto-preflight-confirm").click();
  await page.locator("#sisagua-auto-log").filter({ hasText: "Nenhum campo foi alterado" })
    .waitFor({ state: "visible", timeout: 10000 });

  const result = await page.evaluate(() => ({
    mutations: globalThis.__mutations,
    values: [...document.querySelectorAll(".data-field")].map((input) => input.value),
    log: document.querySelector("#sisagua-auto-log").textContent,
  }));
  if (result.mutations.input || result.mutations.validate || result.mutations.save) {
    throw new Error(`Preflight permitiu mutação parcial: ${JSON.stringify(result.mutations)}.`);
  }
  if (result.values.some(Boolean)) throw new Error(`Campos foram preenchidos antes do preflight: ${JSON.stringify(result.values)}.`);
  if (!result.log.includes("Clordano") || !result.log.includes("não encontrado")) {
    throw new Error(`Erro descritivo de Clordano ausente: ${result.log}.`);
  }

  process.stdout.write("content-preflight-transaction: sem gravação parcial ok");
} finally {
  await browser.close();
}
