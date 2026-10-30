import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(testDir, "..");
const playwrightPath = process.env.SISAGUA_PLAYWRIGHT_PATH || path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
  "playwright",
  "index.mjs"
);
if (!fs.existsSync(playwrightPath)) {
  throw new Error("Playwright não encontrado. Defina SISAGUA_PLAYWRIGHT_PATH.");
}
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const chromePath = process.env.SISAGUA_CHROME_PATH
  || path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe");
if (!fs.existsSync(chromePath)) {
  throw new Error("Chrome não encontrado. Defina SISAGUA_CHROME_PATH.");
}
const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.setContent(`
    <!doctype html>
    <html lang="pt-BR">
      <body>
        <div id="sac-block-label">Monitoramento da qualidade da água da SAC</div>
        <table>
          <tr id="radioactivity-row">
            <td>Radioatividade</td>
            <td><button id="alter-category" title="Alterar" type="button">Alterar</button></td>
          </tr>
        </table>
        <div class="ui-dialog" id="category-dialog">
          <h2>RADIOATIVIDADE</h2>
          <h3 class="ui-accordion-header" id="alpha-header">Atividade alfa total - VMP 0,5 Bq/L - Status: N</h3>
          <div class="ui-accordion-content" id="alpha-content">
            <div class="point-fields" id="treatment-fields">
              <label>Saída do tratamento</label>
              <input id="treatment-dataColeta_input" type="text">
              <input id="treatment-dataAnalise_input" type="text">
              <input id="treatment-campoResultado" type="text">
            </div>
            <div class="point-fields" id="consumption-fields">
              <label>Ponto de consumo</label>
              <input id="consumption-dataColeta_input" type="text">
              <input id="consumption-dataAnalise_input" type="text">
              <input id="consumption-campoResultado" type="text">
            </div>
            <button id="validate-alpha" type="button">VALIDAR</button>
          </div>
          <button id="save-category" type="button">SALVAR</button>
        </div>
        <div id="messages"></div>
        <div id="ui-datepicker-div" style="display:none">
          <span class="ui-datepicker-month">junho</span>
          <span class="ui-datepicker-year">2026</span>
          <table><tbody><tr><td><a href="#">5</a></td></tr></tbody></table>
        </div>
      </body>
    </html>
  `);

  await page.evaluate(() => {
    const storageData = {};
    globalThis.chrome = {
      storage: {
        local: {
          async get(key) {
            return { [key]: storageData[key] };
          },
          async set(values) {
            Object.assign(storageData, values);
          },
        },
      },
    };
    globalThis.__storageData = storageData;
    globalThis.SISAGUA_BATCHES = [{
      schemaVersion: 2,
      id: "IMPORT-radioactivity-RADIOATIVIDADE",
      importGroupId: "IMPORT-radioactivity",
      baseId: "PRT888_LOCAL_2026-07-13_v2",
      tipo: "SEMESTRAL",
      ponto: "CONSUMO",
      categoria: "RADIOATIVIDADE",
      dialogText: "RADIOATIVIDADE",
      titulo: "Radioatividade — consumo",
      cliente: "Cliente de teste",
      amostra: "90002-1/2026.0",
      arquivoOrigem: "TEXTO_COLADO — amostra 90002-1/2026.0",
      tipoOrigem: "TEXTO_COLADO",
      dataColeta: "05/06/2026",
      competencia: "1º semestre de 2026",
      pontoIdentificacao: "Torneira do refeitório",
      pontoDescricao: "consumo",
      requiresConfirmation: true,
      confirmationReason: "Confirme o contexto e a regra de nível de triagem.",
      parametros: [{
        nome: "Atividade alfa total",
        nomeLegal: "Atividade alfa total",
        categoria: "RADIOATIVIDADE",
        coleta: "05/06/2026",
        analise: "05/06/2026",
        valor: "0,15",
        resultadoOriginal: "< 0,15 Bq/L",
        qualificador: "<",
        unidade: "Bq/L",
        unidadeOriginal: "Bq/L",
        parametroOriginal: "Radioatividade Alfa Total",
        amostra: "90002-1/2026.0",
        arquivoOrigem: "TEXTO_COLADO — amostra 90002-1/2026.0",
        tipoOrigem: "TEXTO_COLADO",
        fonteId: "PRT888_ANEXO9",
        avaliacaoLegal: "NIVEL_TRIAGEM",
        decisaoLancamento: "CONFIRMACAO_PREVIA",
      }],
      revisoes: [],
    }];

    let activeDateInput = null;
    const picker = document.querySelector("#ui-datepicker-div");
    document.querySelectorAll('[id$="dataColeta_input"], [id$="dataAnalise_input"]').forEach((input) => {
      input.addEventListener("click", () => {
        activeDateInput = input;
        picker.style.display = "block";
      });
    });
    picker.querySelector("a").addEventListener("click", (event) => {
      event.preventDefault();
      activeDateInput.value = "05/06/2026";
      picker.style.display = "none";
    });
    document.querySelector("#validate-alpha").addEventListener("click", () => {
      document.querySelector("#alpha-header").textContent = "Atividade alfa total - VMP 0,5 Bq/L - Status: S";
    });
    document.querySelector("#save-category").addEventListener("click", () => {
      setTimeout(() => {
        const message = document.createElement("div");
        message.className = "ui-growl-message";
        message.textContent = "Registro alterado com sucesso";
        document.querySelector("#messages").appendChild(message);
        document.querySelector("#category-dialog").style.display = "none";
      }, 25);
    });
    document.querySelector("#alter-category").addEventListener("click", () => {
      document.querySelector("#category-dialog").style.display = "block";
    });
  });

  for (const file of ["legal-data.js", "core.js", "parser.js", "parser-secure.js", "header-contract.js", "content.js"]) {
    await page.addScriptTag({ path: path.join(extensionDir, file) });
  }

  const startButton = page.locator("#sisagua-auto-start");
  await startButton.waitFor({ state: "visible" });
  if (await startButton.isDisabled()) {
    const log = await page.locator("#sisagua-auto-log").textContent();
    throw new Error(`Botão de início desabilitado: ${log}`);
  }
  await startButton.click();
  await page.locator("#sisagua-auto-preflight").waitFor({ state: "visible" });
  await page.locator("#sisagua-auto-preflight-check").check();
  await page.locator("#sisagua-auto-preflight-confirm").click();
  await page.locator("#sisagua-auto-status-text").filter({
    hasText: "Categoria salva, reaberta e auditada",
  }).waitFor({ state: "visible", timeout: 30000 });

  const result = await page.evaluate(() => ({
    dialogVisible: getComputedStyle(document.querySelector("#category-dialog")).display !== "none",
    treatmentCollection: document.querySelector("#treatment-dataColeta_input").value,
    treatmentAnalysis: document.querySelector("#treatment-dataAnalise_input").value,
    treatmentResult: document.querySelector("#treatment-campoResultado").value,
    consumptionCollection: document.querySelector("#consumption-dataColeta_input").value,
    consumptionAnalysis: document.querySelector("#consumption-dataAnalise_input").value,
    consumptionResult: document.querySelector("#consumption-campoResultado").value,
    status: document.querySelector("#alpha-header").textContent,
    audit: globalThis.__storageData.sisaguaImportedBatchesV2?.batches?.[0]?.auditTrail?.[0],
  }));

  if (!result.dialogVisible) throw new Error("Radioatividade não foi reaberta após salvar.");
  if (result.treatmentCollection || result.treatmentAnalysis || result.treatmentResult) {
    throw new Error(`Campos de saída do tratamento foram alterados: ${JSON.stringify(result)}.`);
  }
  if (
    result.consumptionCollection !== "05/06/2026"
    || result.consumptionAnalysis !== "05/06/2026"
    || result.consumptionResult !== "0,15"
  ) {
    throw new Error(`Campos de consumo incorretos: ${JSON.stringify(result)}.`);
  }
  if (!/Status:\s*S/.test(result.status)) {
    throw new Error(`Status da radioatividade não foi validado: '${result.status}'.`);
  }
  if (result.audit?.officialMessage !== "Registro alterado com sucesso") {
    throw new Error(`Salvamento da radioatividade não foi auditado: ${JSON.stringify(result.audit)}.`);
  }

  process.stdout.write("content-radioactivity: ok");
} finally {
  await browser.close();
}
