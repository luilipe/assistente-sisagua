import { parser } from "./load-parser.mjs";

const report = [
  "Data de Publicação: 13/07/2026 08:36",
  "Cliente: RFG COMÉRCIO, TRANSPORTES E SERVIÇOS LTDA CNPJ/CPF: 49.319.411/0015-39",
  "Nº Amostra: 11181-1/2026.0 - Ponto de Consumo",
  "Tipo de Amostra: Água Tratada",
  "Data Coleta: 15/06/2026 10:20 Data Recebimento: 15/06/2026 17:54",
  "Turbidez < 1,50 NTU Máx 5 NTU 1,50 0,45 0,06",
  "17/06/2026",
  "Análises Terceirizadas",
  "SUPREMA ANALÍTICA - (não usar) CR 1546",
  "Radioatividade Alfa Total < 0,14 Bq/L - 0,10 - 6,34 ISO 11704 - 2018 30/06/2026",
  "Radioatividade Beta Total < 0,16 Bq/L - 0,10 - 6,74 ISO 11704 - 2018 30/06/2026",
  "Especificações"
].join("\n");

const result = parser.parseReport(report, { arquivoOrigem: "radioactivity.pdf" });
const batch = result.batches.find((item) => item.categoria === "RADIOATIVIDADE");

if (!batch) {
  throw new Error("O parser não criou o lote de Radioatividade.");
}
if (batch.ponto !== "CONSUMO") {
  throw new Error(`Ponto incorreto para Radioatividade: '${batch.ponto}'.`);
}
if (!batch.requiresConfirmation) {
  throw new Error("O lote de Radioatividade deixou de exigir revisão prévia.");
}

const expected = [
  {
    nome: "Atividade alfa total",
    valor: "0,14",
    resultadoOriginal: "< 0,14 Bq/L",
    qualificador: "<",
    unidade: "Bq/L",
    analise: "30/06/2026",
    regra: "Nível de triagem: 0,5 Bq/L",
    fonteId: "PRT888_ART37"
  },
  {
    nome: "Atividade beta total",
    valor: "0,16",
    resultadoOriginal: "< 0,16 Bq/L",
    qualificador: "<",
    unidade: "Bq/L",
    analise: "30/06/2026",
    regra: "Nível de triagem: 1 Bq/L",
    fonteId: "PRT888_ART37"
  }
];

if (batch.parametros.length !== expected.length) {
  throw new Error(
    `Esperadas duas radioatividades, recebidas ${batch.parametros.length}: ` +
    JSON.stringify(batch.parametros)
  );
}

expected.forEach((expectedParameter) => {
  const actual = batch.parametros.find((parameter) => parameter.nome === expectedParameter.nome);
  if (!actual) {
    throw new Error(`Parâmetro ausente: '${expectedParameter.nome}'.`);
  }
  Object.entries(expectedParameter).forEach(([key, value]) => {
    if (actual[key] !== value) {
      throw new Error(
        `${expectedParameter.nome}: '${key}' esperado '${value}', recebido '${actual[key]}'.`
      );
    }
  });
});

const unmappedRadioactivity = result.unmapped.filter((item) =>
  /radioatividade/i.test(item.originalName)
);
if (unmappedRadioactivity.length > 0) {
  throw new Error(
    `Radioatividade permaneceu não mapeada: ${JSON.stringify(unmappedRadioactivity)}.`
  );
}

process.stdout.write("parser-radioactivity-total: ok");
