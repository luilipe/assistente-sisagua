import { parser } from "./load-parser.mjs";

function parseAmmonia(pointText, includePageMarker = true) {
  const header = `Nº\u00a0Amostra:\u00a011505-1/2026.0\u00a0-\u00a0${pointText}\u00a0(Semestral)`;
  const report = [
    "Cliente: Cliente de teste CNPJ/CPF: 00.000.000/0001-00",
    header,
    "Tipo\u00a0de\u00a0Amostra:\u00a0Água\u00a0Tratada",
    "Data\u00a0Coleta:\u00a018/06/2026\u00a016:54",
    "Ferro <0,030\u00a0mg/L",
    "19/06/2026",
    "Especificações",
    "Rodapé da primeira seção",
    ...(includePageMarker ? ["===== PÁGINA 5 ====="] : []),
    "Data de Publicação: 27/07/2026 10:49",
    header,
    "Data\u00a0Coleta:\u00a018/06/2026\u00a016:54",
    "Nitrogênio\u00a0Amoniacal <0,300\u00a0mg/L",
    "20/06/2026"
  ].join("\n");

  return parser.parseReport(report, { arquivoOrigem: "ammonia-context.pdf" });
}

// O texto copiado do laudo real pode omitir o marcador visual de página.
const treated = parseAmmonia("Saída\u00a0do\u00a0Tratamento", false);
if (treated.header.ponto !== "Saída\u00a0do\u00a0Tratamento") {
  throw new Error(`Ponto de saída não reconhecido: '${treated.header.ponto}'.`);
}
const treatedBatch = treated.batches.find((batch) => batch.categoria === "ORGANOLEPTICOS");
const treatedAmmonia = treatedBatch?.parametros.find(
  (parameter) => parameter.nome === "Amônia (como N)"
);
if (!treatedBatch || treatedBatch.ponto !== "SAIDA_TRATAMENTO" || !treatedAmmonia) {
  throw new Error("Nitrogênio Amoniacal da saída não foi mapeado para Amônia (como N).");
}
if (treatedAmmonia.valor !== "0,300") {
  throw new Error(`Valor de Amônia incorreto: '${treatedAmmonia.valor}'.`);
}

const capture = parseAmmonia("Saída\u00a0do\u00a0Poço");
const captureBatch = capture.batches.find((batch) => batch.categoria === "OUTROS");
const captureAmmonia = captureBatch?.parametros.find(
  (parameter) => parameter.nome === "Nitrogênio Amoniacal Total"
);
if (!captureBatch || captureBatch.ponto !== "CAPTACAO_POCO" || !captureAmmonia) {
  throw new Error("Nitrogênio Amoniacal da captação deixou de mapear para Nitrogênio Amoniacal Total em Outros.");
}
if (captureAmmonia.fonteId !== "PRT888_NAO_LISTADO" || captureAmmonia.avaliacaoLegal !== "INFORMATIVO") {
  throw new Error("Nitrogênio Amoniacal da captação foi confundido com o VMP de Amônia (como N).");
}

process.stdout.write("parser-ammonia-context: ok");
