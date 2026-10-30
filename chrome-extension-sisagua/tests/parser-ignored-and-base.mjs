import { parser } from "./load-parser.mjs";

const report = [
  "Cliente: Cliente de teste CNPJ/CPF: 00.000.000/0001-00",
  "Nº Amostra: 11180-1/2026.0 - Saída do Tratamento",
  "Data Coleta: 15/06/2026 09:50",
  "Condutividade Elétrica a 25ºC 225 μS/cm",
  "15/06/2026",
  "Ferro <0,1 mg/L",
  "16/06/2026",
  "Clorito <0,1 mg/L",
  "19/06/2026",
  "Clorato 0,479 mg/L",
  "20/06/2026",
  "Bromato <0,008 mg/L",
  "21/06/2026"
].join("\n");

const result = parser.parseReport(report, { arquivoOrigem: "ignored-and-base.pdf" });
if (result.unmapped.length !== 0) {
  throw new Error(`Há parâmetros incorretamente não mapeados: ${JSON.stringify(result.unmapped)}.`);
}
const ignoredNames = result.ignored.map((item) => item.originalName).sort();
if (ignoredNames.join("|") !== "Bromato|Clorato|Clorito|Condutividade Elétrica") {
  throw new Error(`Exclusões conhecidas incorretas: ${ignoredNames.join("|")}.`);
}
if (result.batches.some((batch) => batch.categoria === "OUTROS")) {
  throw new Error("A Condutividade da saída gerou indevidamente um lote Outros.");
}
if (
  result.batches.length === 0 ||
  result.batches.some((batch) => batch.baseId !== parser.LEGAL_BASE_ID)
) {
  throw new Error("Os lotes importados não receberam o base_id legal único.");
}

process.stdout.write("parser-ignored-and-base: ok");
