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
        <table>
          <tr id="category-row">
            <td>Substâncias Inorgânicas — Monitoramento no ponto de captação — Saída do Poço</td>
            <td><button id="alter-category" title="Alterar" type="button">Alterar</button></td>
          </tr>
        </table>
        <div class="ui-dialog" id="category-dialog">
          <h2>SUBSTANCIAS INORGANICAS</h2>
          <h3 class="ui-accordion-header" id="copper-header">Cobre - VMP 2 mg/L - Status: N</h3>
          <div class="ui-accordion-content" id="copper-content">
            <h4 class="ui-accordion-header">Ponto de captação — Saída do Poço</h4>
            <div class="ui-accordion-content">
              <input id="test-dataColeta_input" type="text">
              <input id="test-dataAnalise_input" type="text">
              <input id="test-campoResultado" type="text">
              <button id="validate-copper" type="button">VALIDAR</button>
            </div>
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
      id: "IMPORT-transaction-INORGANICOS",
      importGroupId: "IMPORT-transaction",
      baseId: "PRT888_LOCAL_2026-07-13_v2",
      tipo: "SEMESTRAL",
      ponto: "CAPTACAO_POCO",
      categoria: "INORGANICOS",
      dialogText: "SUBSTANCIAS INORGANICAS",
      titulo: "Inorgânicos — captação",
      cliente: "Cliente de teste",
      amostra: "90001-1/2026.0",
      arquivoOrigem: "fixture.pdf",
      dataColeta: "05/06/2026",
      pontoIdentificacao: "Saída do Poço",
      parametros: [{
        nome: "Cobre",
        nomeLegal: "Cobre",
        categoria: "INORGANICOS",
        coleta: "05/06/2026",
        analise: "05/06/2026",
        valor: "0,005",
        resultadoOriginal: "< 0,005 mg/L",
        qualificador: "<",
        unidade: "mg/L",
        unidadeOriginal: "mg/L",
        parametroOriginal: "Cobre",
        amostra: "90001-1/2026.0",
        arquivoOrigem: "fixture.pdf",
        fonteId: "PRT888_ANEXO9",
        avaliacaoLegal: "CONFORME",
        decisaoLancamento: "LANCAR",
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
    document.querySelector("#validate-copper").addEventListener("click", () => {
      document.querySelector("#copper-header").textContent = "Cobre - VMP 2 mg/L - Status: S";
    });
    document.querySelector("#save-category").addEventListener("click", () => {
      setTimeout(() => {
        const message = document.createElement("div");
        message.className = "ui-messages-info-summary";
        message.textContent = "Registro alterado com sucesso.";
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
  const preflightText = await page.locator("#sisagua-auto-preflight").textContent();
  if (!preflightText.includes("Cliente de teste") || !preflightText.includes("90001-1/2026.0")) {
    throw new Error(`Contexto obrigatório ausente na revisão prévia: ${preflightText}.`);
  }
  await page.locator("#sisagua-auto-preflight-check").check();
  await page.locator("#sisagua-auto-preflight-confirm").click();
  await page.locator("#sisagua-auto-status-text").filter({
    hasText: "Categoria salva, reaberta e auditada",
  }).waitFor({ state: "visible", timeout: 30000 });

  const result = await page.evaluate(() => {
    const stored = globalThis.__storageData.sisaguaImportedBatchesV2;
    return {
      dialogVisible: getComputedStyle(document.querySelector("#category-dialog")).display !== "none",
      fieldValue: document.querySelector("#test-campoResultado").value,
      status: document.querySelector("#copper-header").textContent,
      audit: stored?.batches?.[0]?.auditTrail?.[0],
      parameterStatus: stored?.batches?.[0]?.parametros?.[0]?.statusSisagua,
    };
  });

  if (!result.dialogVisible) throw new Error("Categoria não foi reaberta após salvar.");
  if (result.fieldValue !== "0,005") throw new Error(`Valor preenchido incorreto: '${result.fieldValue}'.`);
  if (!/Status:\s*S/.test(result.status)) throw new Error(`Status não validado: '${result.status}'.`);
  if (result.audit?.officialMessage !== "Registro alterado com sucesso") {
    throw new Error(`Mensagem oficial não entrou na trilha: ${JSON.stringify(result.audit)}.`);
  }
  if (result.parameterStatus !== "SALVO_AUDITADO") {
    throw new Error(`Registro canônico não foi atualizado: '${result.parameterStatus}'.`);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#sisagua-auto-export").click();
  const download = await downloadPromise;
  if (!/^sisagua-registro-canonico-.*\.json$/.test(download.suggestedFilename())) {
    throw new Error(`Nome inesperado do registro canônico: ${download.suggestedFilename()}.`);
  }
  const downloadPath = await download.path();
  const exported = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
  if (
    exported.baseId !== "PRT888_LOCAL_2026-07-13_v2"
    || exported.resumo?.itensSalvosAuditados !== 1
    || exported.grupos?.[0]?.categorias?.[0]?.parametros?.[0]?.statusSisagua !== "SALVO_AUDITADO"
  ) {
    throw new Error(`Registro canônico exportado incompleto: ${JSON.stringify(exported.resumo)}.`);
  }

  process.stdout.write("content-transaction: ok");
} finally {
  await browser.close();
}
