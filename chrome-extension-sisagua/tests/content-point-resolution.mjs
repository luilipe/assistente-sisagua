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

function pointMarkup({ duplicateLabels, multiplePoints }) {
  const point = (number) => `
    <h4 class="ui-accordion-header" id="point-${number}-header">
      ${duplicateLabels && number === 1 ? "<strong>" : ""}
      Ponto de captação — Saída do Poço — POÇO ARTESIANO - Ponto ${number}
      ${duplicateLabels && number === 1 ? "</strong>" : ""}
    </h4>
    <div class="ui-accordion-content" id="point-${number}-scope">
      ${duplicateLabels && number === 1 ? "<label>Ponto de captação — POÇO ARTESIANO - Ponto 1</label>" : ""}
      <input id="point-${number}-dataColeta_input" type="text">
      <input id="point-${number}-dataAnalise_input" type="text">
      <input id="point-${number}-campoResultado" type="text">
      <button id="validate-point-${number}" type="button">VALIDAR</button>
    </div>`;
  return point(1) + (multiplePoints ? point(2) : "");
}

async function runScenario({ name, pointIdentity, duplicateLabels = false, multiplePoints = false, expectError = false }) {
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <!doctype html>
      <html lang="pt-BR">
        <body>
          <table>
            <tr id="category-row">
              <td>Agrotóxicos — Monitoramento no ponto de captação — ${pointIdentity}</td>
              <td><button id="alter-category" title="Alterar" type="button">Alterar</button></td>
            </tr>
          </table>
          <div class="ui-dialog" id="category-dialog">
            <h2>AGROTOXICOS</h2>
            <h3 class="ui-accordion-header" id="diuron-header">Diuron - VMP 20 µg/L - Status: N</h3>
            <div class="ui-accordion-content" id="diuron-content">
              ${pointMarkup({ duplicateLabels, multiplePoints })}
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

    await page.evaluate(({ pointIdentity }) => {
      const storageData = {};
      globalThis.chrome = {
        runtime: { getManifest: () => ({ version: "2.0.2" }) },
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
      globalThis.__validateCount = 0;
      globalThis.__saveCount = 0;
      globalThis.SISAGUA_BATCHES = [{
        schemaVersion: 2,
        id: `IMPORT-point-resolution-${pointIdentity}-AGROTOXICOS`,
        importGroupId: `IMPORT-point-resolution-${pointIdentity}`,
        baseId: "PRT888_LOCAL_2026-07-13_v2",
        tipo: "SEMESTRAL",
        ponto: "CAPTACAO_POCO",
        categoria: "AGROTOXICOS",
        dialogText: "AGROTOXICOS",
        titulo: "Agrotóxicos — captação",
        cliente: "Cliente de teste",
        amostra: "90003-1/2026.0",
        arquivoOrigem: "fixture.pdf",
        dataColeta: "05/06/2026",
        pontoIdentificacao: pointIdentity,
        parametros: [{
          nome: "Diuron",
          nomeLegal: "Diuron",
          categoria: "AGROTOXICOS",
          coleta: "05/06/2026",
          analise: "05/06/2026",
          valor: "10",
          resultadoOriginal: "< 10 µg/L",
          qualificador: "<",
          unidade: "µg/L",
          unidadeOriginal: "µg/L",
          parametroOriginal: "Diuron",
          amostra: "90003-1/2026.0",
          arquivoOrigem: "fixture.pdf",
          fonteId: "PRT888_ANEXO10",
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
      document.querySelectorAll('[id^="validate-point-"]').forEach((button) => {
        button.addEventListener("click", () => {
          globalThis.__validateCount += 1;
          document.querySelector("#diuron-header").textContent = "Diuron - VMP 20 µg/L - Status: S";
        });
      });
      document.querySelector("#save-category").addEventListener("click", () => {
        globalThis.__saveCount += 1;
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
    }, { pointIdentity });

    for (const file of ["legal-data.js", "core.js", "parser.js", "parser-secure.js", "header-contract.js", "content.js"]) {
      await page.addScriptTag({ path: path.join(extensionDir, file) });
    }

    const startButton = page.locator("#sisagua-auto-start");
    await startButton.waitFor({ state: "visible" });
    if (await startButton.isDisabled()) {
      throw new Error(`${name}: botão de início desabilitado.`);
    }
    await startButton.click();
    await page.locator("#sisagua-auto-preflight").waitFor({ state: "visible" });
    await page.locator("#sisagua-auto-preflight-check").check();
    await page.locator("#sisagua-auto-preflight-confirm").click();

    if (expectError) {
      await page.locator("#sisagua-auto-status-text").filter({ hasText: "Parado por erro" })
        .waitFor({ state: "visible", timeout: 10000 });
    } else {
      await page.locator("#sisagua-auto-status-text").filter({ hasText: "Categoria salva, reaberta e auditada" })
        .waitFor({ state: "visible", timeout: 30000 });
    }

    const result = await page.evaluate(() => ({
      point1: {
        coleta: document.querySelector("#point-1-dataColeta_input").value,
        analise: document.querySelector("#point-1-dataAnalise_input").value,
        resultado: document.querySelector("#point-1-campoResultado").value,
      },
      point2: document.querySelector("#point-2-campoResultado") ? {
        coleta: document.querySelector("#point-2-dataColeta_input").value,
        analise: document.querySelector("#point-2-dataAnalise_input").value,
        resultado: document.querySelector("#point-2-campoResultado").value,
      } : null,
      status: document.querySelector("#diuron-header").textContent,
      log: document.querySelector("#sisagua-auto-log").textContent,
      validateCount: globalThis.__validateCount,
      saveCount: globalThis.__saveCount,
    }));

    if (expectError) {
      if (result.point1.coleta || result.point1.analise || result.point1.resultado) {
        throw new Error(`${name}: o primeiro ponto foi alterado apesar da ambiguidade.`);
      }
      if (result.point2?.coleta || result.point2?.analise || result.point2?.resultado) {
        throw new Error(`${name}: o segundo ponto foi alterado apesar da ambiguidade.`);
      }
      if (result.validateCount !== 0 || result.saveCount !== 0 || !/Status:\s*N/.test(result.status)) {
        throw new Error(`${name}: houve validação ou salvamento indevido.`);
      }
      if (!result.log.includes("2 conjuntos distintos de campos")) {
        throw new Error(`${name}: diagnóstico de ambiguidade ausente no log.`);
      }
      return;
    }

    if (result.point1.coleta !== "05/06/2026" || result.point1.analise !== "05/06/2026" || result.point1.resultado !== "10") {
      throw new Error(`${name}: o ponto correto não foi preenchido.`);
    }
    if (result.point2 && (result.point2.coleta || result.point2.analise || result.point2.resultado)) {
      throw new Error(`${name}: o ponto não selecionado foi alterado.`);
    }
    if (result.validateCount !== 1 || result.saveCount !== 1 || !/Status:\s*S/.test(result.status)) {
      throw new Error(`${name}: transação não foi concluída uma única vez.`);
    }
    if (duplicateLabels && !result.log.includes("rótulos equivalentes")) {
      throw new Error(`${name}: deduplicação visual não foi registrada.`);
    }
  } finally {
    await page.close();
  }
}

try {
  await runScenario({
    name: "rótulos duplicados no mesmo ponto",
    pointIdentity: "POÇO ARTESIANO - Ponto 1",
    duplicateLabels: true,
  });
  await runScenario({
    name: "seleção exata entre dois pontos",
    pointIdentity: "POÇO ARTESIANO - Ponto 1",
    multiplePoints: true,
  });
  await runScenario({
    name: "ambiguidade real entre dois pontos",
    pointIdentity: "Saída do Poço",
    multiplePoints: true,
    expectError: true,
  });
  process.stdout.write("content-point-resolution: ok");
} finally {
  await browser.close();
}
