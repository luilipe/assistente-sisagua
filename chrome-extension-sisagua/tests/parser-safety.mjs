import { parser } from "./load-parser.mjs";

function report(point, body, sample = "90001-1/2026.0", collection = "05/06/2026") {
  return [
    "Cliente: Cliente de teste CNPJ/CPF: 00.000.000/0001-00",
    `Nº Amostra: ${sample} - ${point}`,
    `Data Coleta: ${collection}`,
    ...body,
  ].join("\n");
}

function expectThrows(label, text, pattern) {
  try {
    parser.parseReport(text, { arquivoOrigem: `${label}.pdf` });
  } catch (error) {
    if (pattern.test(error.message)) return;
    throw new Error(`${label}: erro inesperado: ${error.message}`);
  }
  throw new Error(`${label}: o parser não bloqueou a entrada.`);
}

expectThrows(
  "unknown-point",
  report("LOCAL SEM IDENTIFICAÇÃO", ["Cobre 0,005 mg/L", "17/06/2026"]),
  /não pôde ser classificado/i
);

expectThrows(
  "missing-client",
  report("Saída do Poço", ["Cobre 0,005 mg/L", "17/06/2026"]).split("\n").slice(1).join("\n"),
  /cabeçalho incompleto.*Cliente/i
);

const automaticOrigin = parser.parseReport(
  report("Saída do Poço", ["Cobre 0,005 mg/L", "17/06/2026"])
);
if (
  automaticOrigin.header.tipoOrigem !== "TEXTO_COLADO"
  || automaticOrigin.header.arquivoOrigem !== "TEXTO_COLADO — amostra 90001-1/2026.0"
  || automaticOrigin.batches[0]?.tipoOrigem !== "TEXTO_COLADO"
  || automaticOrigin.batches[0]?.parametros[0]?.tipoOrigem !== "TEXTO_COLADO"
) {
  throw new Error(`automatic-source: origem automática inválida: ${JSON.stringify(automaticOrigin.header)}.`);
}

expectThrows(
  "mixed-samples",
  report("Saída do Tratamento", [
    "Ferro 0,01 mg/L",
    "17/06/2026",
    "Nº Amostra: 90002-1/2026.0 - Torneira Refeitório",
    "Data Coleta: 06/06/2026",
    "Radioatividade Alfa Total 0,02 Bq/L",
    "18/06/2026",
  ]),
  /amostras, pontos, coletas ou clientes diferentes/i
);

const conflict = parser.parseReport(report("Saída do Poço", [
  "Cobre 0,005 mg/L",
  "17/06/2026",
  "Cobre 9,999 mg/L",
  "18/06/2026",
]), { arquivoOrigem: "duplicate.pdf" });
const conflictBatch = conflict.batches.find((batch) => batch.categoria === "INORGANICOS");
if (conflictBatch?.parametros.some((parameter) => parameter.nome === "Cobre")) {
  throw new Error("Duplicidade conflitante permaneceu no preenchimento automático.");
}
if (!conflictBatch?.revisoes.some((review) => /Duplicidade conflitante/.test(review.motivo))) {
  throw new Error("Duplicidade conflitante não virou pendência nominal.");
}

const missingUnit = parser.parseReport(report("Saída do Poço", [
  "Cobre 123",
  "17/06/2026",
]), { arquivoOrigem: "missing-unit.pdf" });
const missingUnitBatch = missingUnit.batches.find((batch) => batch.categoria === "INORGANICOS");
if (missingUnitBatch?.parametros.length !== 0 || !missingUnitBatch?.revisoes[0]?.informational) {
  throw new Error("Valor sem unidade não foi bloqueado como pendência informativa.");
}

const sameBlock = parser.parseReport(report("Saída do Tratamento", [
  "Clorito 0,1 mg/L     Ferro\u00a0\u00a00,02 mg/L",
  "17/06/2026",
]), { arquivoOrigem: "same-block.pdf" });
if (!sameBlock.ignored.some((item) => item.originalName === "Clorito")) {
  throw new Error("Parâmetro ignorado do mesmo bloco não foi preservado.");
}
if (!sameBlock.batches.some((batch) => batch.parametros.some((parameter) => parameter.nome === "Ferro"))) {
  throw new Error("Parâmetro válido do mesmo bloco foi descartado.");
}

const consumption = parser.parseReport(report("Torneira Refeitório", [
  "Ferro 0,02 mg/L",
  "17/06/2026",
]), { arquivoOrigem: "consumption.pdf" });
if (!consumption.batches.some((batch) => batch.categoria === "ORGANOLEPTICOS")) {
  throw new Error("Organolépticos de consumo foram descartados.");
}

const exceed = parser.parseReport(report("Saída do Poço", [
  "Cobre 9,999 mg/L",
  "17/06/2026",
]), { arquivoOrigem: "exceed.pdf" });
const exceedBatch = exceed.batches.find((batch) => batch.categoria === "INORGANICOS");
if (exceedBatch?.parametros.some((parameter) => parameter.nome === "Cobre")) {
  throw new Error("Resultado acima do VMP entrou no preenchimento automático.");
}
if (!exceedBatch?.revisoes.some((review) => /EXCEDE_VMP/.test(review.motivo))) {
  throw new Error("Resultado acima do VMP não gerou revisão prévia.");
}

const wrongApplication = parser.parseReport(report("Saída do Poço", [
  "Turbidez 1,0 NTU",
  "17/06/2026",
]), { arquivoOrigem: "wrong-application.pdf" });
const applicationBatch = wrongApplication.batches.find((batch) => batch.categoria === "OUTROS");
if (
  applicationBatch?.parametros.some((parameter) => parameter.nome === "Turbidez")
  || !applicationBatch?.revisoes.some((review) => /PENDENTE_APLICACAO/.test(review.motivo))
) {
  throw new Error("Aplicação legal incompatível com o ponto não foi bloqueada.");
}

process.stdout.write("parser-safety: ok");
