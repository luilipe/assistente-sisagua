import { parser } from "./load-parser.mjs";

function parseCopper(qualifier) {
  const report = [
    "Cliente: Cliente de teste CNPJ/CPF: 00.000.000/0001-00",
    "NÂº Amostra: 99999-1/2026.0 - POÇO ARTESIANO",
    "Data Coleta: 05/06/2026",
    `Cobre ${qualifier} 0,005 mg/L`,
    "17/06/2026"
  ].join("\n");

  const batches = parser.parseReport(report, { arquivoOrigem: "numeric.pdf" }).batches;
  return {
    parameter: batches
      .flatMap((batch) => batch.parametros)
      .find((item) => item.nome === "Cobre"),
    review: batches
      .flatMap((batch) => batch.revisoes)
      .find((item) => item.nome === "Cobre"),
  };
}

const { parameter: copper } = parseCopper("<");

if (!copper) {
  throw new Error("O parser não extraiu o Cobre do laudo de teste.");
}
if (copper.valor !== "0,005") {
  throw new Error(`Valor quantificado incorreto: '${copper.valor}'.`);
}
if (copper.qualificador !== "<") {
  throw new Error(`Qualificador original incorreto: '${copper.qualificador}'.`);
}
if (copper.resultadoOriginal !== "< 0,005 mg/L") {
  throw new Error(`Resultado original incorreto: '${copper.resultadoOriginal}'.`);
}

const { parameter: copperGreater, review: copperGreaterReview } = parseCopper(">");
if (copperGreater) {
  throw new Error("Resultado inconclusivo com '>' foi liberado para preenchimento automático.");
}
if (
  !copperGreaterReview
  || copperGreaterReview.resultado !== "> 0,005 mg/L"
  || !copperGreaterReview.motivo.includes("INCONCLUSIVO_LQ")
) {
  throw new Error(
    `O resultado original com > não foi preservado/bloqueado: '${copperGreaterReview?.resultado}'.`
  );
}

process.stdout.write("parser-numeric: ok");
