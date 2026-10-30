import { core, legalBase } from "./load-parser.mjs";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(core.classifyPoint("Saída do Tratamento") === "SAIDA_TRATAMENTO", "Saída não classificada.");
expect(core.classifyPoint("Torneira Refeitório") === "CONSUMO", "Consumo não classificado.");
expect(core.classifyPoint("Saída do Poço") === "CAPTACAO_POCO", "Poço não classificado.");
expect(core.classifyPoint("Local sem identificação") === "INDEFINIDO", "Ponto desconhecido foi presumido.");
expect(!core.isCategoryPointAllowed("OUTROS", "CONSUMO"), "Outros foi aceito no consumo.");
expect(core.isCategoryPointAllowed("ORGANOLEPTICOS", "CONSUMO"), "Organolépticos foi rejeitado no consumo.");
expect(core.isApplicationAllowed("agua tratada", "SAIDA_TRATAMENTO"), "Água tratada foi rejeitada na saída.");
expect(!core.isApplicationAllowed("agua distribuida", "SAIDA_TRATAMENTO"), "Água distribuída foi aplicada na saída.");
expect(core.isApplicationAllowed("sistema de distribuicao e ponto de consumo", "CONSUMO"), "Distribuição foi rejeitada no consumo.");
expect(core.normalizeUnit("µg/L") === "ug/L", "Unidade µg/L não foi normalizada.");
expect(core.convertUnit(300, "µg/L", "mg/L")?.numeric === 0.3, "Conversão µg/L para mg/L falhou.");

const copper = {
  nome: "Cobre",
  nomeLegal: "Cobre",
  categoria: "INORGANICOS",
  valor: "9,999",
  resultadoOriginal: "9,999 mg/L",
  unidade: "mg/L",
};
const evaluation = core.evaluateLegal(copper, "CAPTACAO_POCO", legalBase);
expect(evaluation.status === "EXCEDE_VMP", `Cobre acima do VMP não alertou: ${evaluation.status}.`);
expect(evaluation.decision === "CONFIRMACAO_PREVIA", "Ultrapassagem não exigiu confirmação.");

const uncertain = core.evaluateLegal(
  { ...copper, valor: "< 99", resultadoOriginal: "< 99 mg/L" },
  "CAPTACAO_POCO",
  legalBase
);
expect(uncertain.status === "INCONCLUSIVO_LQ", `LQ superior ao VMP não foi bloqueado: ${uncertain.status}.`);

const splitQualifier = core.evaluateLegal(
  {
    nome: "1,4-Diclorobenzeno",
    categoria: "ORGANOLEPTICOS",
    valor: "0,001",
    qualificador: "<",
    resultadoOriginal: "< 0,001 mg/L",
    unidade: "mg/L",
  },
  "CONSUMO",
  legalBase
);
expect(
  splitQualifier.status === "INCONCLUSIVO_LQ",
  `Qualificador separado do valor não foi considerado: ${splitQualifier.status}.`
);

const firstId = core.makeStorageId(["Cliente A", "1/2026", "Poço 1"]);
const secondId = core.makeStorageId(["Cliente B", "1/2026", "Poço 1"]);
expect(firstId !== secondId, "IDs de clientes diferentes colidiram.");

const firstSample = {
  id: "IMPORT-A-OUTROS",
  importGroupId: "IMPORT-A",
  baseId: legalBase.baseId,
  tipo: "SEMESTRAL",
  categoria: "OUTROS",
  ponto: "CAPTACAO_POCO",
  cliente: "Cliente A",
  pontoIdentificacao: "Poço 1",
  amostra: "A/2026",
  parametros: [],
  revisoes: [{ nome: "Item pendente", motivo: "Aguardando consolidação.", informational: true }],
};
const secondSample = {
  ...firstSample,
  id: "IMPORT-B-OUTROS",
  importGroupId: "IMPORT-B",
  amostra: "B/2026",
};
const conflictErrors = core.validateBatch(firstSample, [firstSample, secondSample], legalBase);
expect(
  conflictErrors.some((message) => message.includes("mais de uma amostra")),
  "Amostras diferentes para o mesmo destino não foram bloqueadas."
);

process.stdout.write("core-validation: ok");
