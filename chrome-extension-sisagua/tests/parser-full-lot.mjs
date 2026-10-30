import { parser } from "./load-parser.mjs";
import { expected } from "./fixtures/semestral-header-contract.mjs";

const originalName = new Map(Object.entries({
  "Condutividade Elétrica": "Condutividade Elétrica a 25ºC",
  "Nitrogênio Amoniacal Total": "Nitrogênio Amoniacal",
  "Nitrato (como N)": "Nitrato",
  "Nitrito (como N)": "Nitrito",
  "Mercúrio Total": "Mercúrio",
  "Benzo[a]pireno": "Benzo(a)pireno",
  "Di (2-etilhexil) ftalato": "Di(2-etilhexil)ftalato",
  "1,2 Dicloroetano": "1,2-Dicloroetano",
  "Lindano (gama HCH)": "Lindano (gama-HCH)",
  "2,4 D": "2,4-D",
  "Clordano": "Clordano (Trans)",
  "Malationa": "Malation",
  "Clorpirifós + clorpirifós-oxon": "Clorpirifós + oxon",
  "DDT + DDD + DDE": "p,p'-DDT + p,p'-DDE + p,p'-DDD",
  "Tiodicarbe": "Tiodicarb",
  "Dimetoato + ometoato": "Dimetoato + Ometoato",
  "Propargito": "Propargite",
  "Aldicarbe + Aldicarbesulfona + Aldicarbesulfóxido": "Aldicarb + Sulfona + Sulfóxido",
  "Sulfeto de hidrogênio": "Sulfeto (H2S não dissociado)",
  "Amônia (como N)": "Nitrogênio Amoniacal",
  "Ácidos Haloacéticos Total": "Ácidos Haloacéticos Total",
  "Cloraminas Total": "Cloraminas",
  "2, 4, 6 Triclorofenol": "2,4,6-Triclorofenol",
  "2, 4 Diclorofenol": "2,4-Diclorofenol",
  "Trihalometanos Total": "Trihalometanos Totais (THM)",
  "Atividade alfa total": "Radioatividade alfa global",
  "Atividade beta total": "Radioatividade beta global",
}));

function resultFor(name, category) {
  if (name === "Condutividade Elétrica") return "200 μS/cm";
  if (name === "pH") return "7,02";
  if (name === "Cor Verdadeira") return "< 5,0 CU";
  if (name === "Fósforo Total") return "0,051 mg/L";
  if (name === "Nitrogênio Amoniacal Total" || name === "Amônia (como N)") return "< 0,300 mg/L";
  if (name === "Turbidez") return "< 1,50 NTU";
  if (name === "Gosto e Odor") return "Ausência";
  if (name === "1,2-Diclorobenzeno") return "< 0,5000 mg/L";
  if (name === "1,4-Diclorobenzeno") return "< 0,1 mg/L";
  if (name === "Monoclorobenzeno") return "< 1 mg/L";
  if (name === "Trihalometanos Total") return "< 20 mg/L";
  if (name === "2, 4, 6 Triclorofenol") return "< 0,003333 μg/L";
  if (category === "RADIOATIVIDADE") return "< 0,1 Bq/L";
  if (category === "AGROTOXICOS" || category === "ORGANICOS") return "< 0,000001 μg/L";
  return "< 0,000001 mg/L";
}

function report({ sample, point, categories, ignored }) {
  const lines = [
    "Cliente: Cliente Sanitizado CNPJ/CPF: 00.000.000/0001-00",
    `Nº Amostra: ${sample} - ${point}`,
    "Data Coleta: 05/06/2026 09:00",
  ];
  for (const category of categories) {
    for (const name of expected[category]) {
      lines.push(`${originalName.get(name) || name} ${resultFor(name, category)}`);
      lines.push("12/06/2026");
    }
  }
  for (const line of ignored) {
    lines.push(line, "12/06/2026");
  }
  return lines.join("\n");
}

const reports = [
  report({
    sample: "90010-1/2026.0",
    point: "Saída do Poço",
    categories: ["OUTROS", "INORGANICOS", "ORGANICOS", "AGROTOXICOS"],
    ignored: ["Fluoreto < 0,01 mg/L"],
  }),
  report({
    sample: "90011-1/2026.0",
    point: "Saída do Tratamento",
    categories: ["ORGANOLEPTICOS", "PRODUTOS_DESINFECCAO"],
    ignored: [
      "Cloro Residual Total 1,15 mg/L", "Cor Aparente < 5,0 CU", "Turbidez < 1,50 NTU",
      "Clorito < 0,0333 mg/L", "Clorato < 0,0333 mg/L", "Bromato < 0,00267 mg/L",
    ],
  }),
  report({
    sample: "90012-1/2026.0",
    point: "Ponto de Consumo",
    categories: ["RADIOATIVIDADE"],
    ignored: ["pH 7,02", "Cloro Residual Livre 0,75 mg/L", "Cloro Residual Total 0,75 mg/L", "Turbidez < 1,50 NTU"],
  }),
];

const parsed = reports.map((text, index) => parser.parseReport(text, {
  arquivoOrigem: `laudo-sanitizado-${index + 1}.txt`,
}));
const batches = parsed.flatMap((result) => result.batches);
const parameters = batches.flatMap((batch) => batch.parametros);
const reviews = batches.flatMap((batch) => batch.revisoes);
const ignored = parsed.flatMap((result) => result.ignored);
const unmapped = parsed.flatMap((result) => result.unmapped);
const duplicates = parsed.flatMap((result) => result.duplicates);

const statuses = parameters.reduce((counts, parameter) => {
  counts[parameter.avaliacaoLegal] = (counts[parameter.avaliacaoLegal] || 0) + 1;
  return counts;
}, {});
if (
  parameters.length !== 92
  || statuses.CONFORME !== 85
  || statuses.INFORMATIVO !== 5
  || statuses.NIVEL_TRIAGEM !== 2
  || reviews.length !== 5
  || ignored.length !== 11
  || unmapped.length !== 0
  || duplicates.length !== 0
) {
  throw new Error(`Resumo integral divergente: ${JSON.stringify({
    parameters: parameters.length,
    statuses,
    reviews: reviews.length,
    ignored: ignored.length,
    unmapped: unmapped.length,
    duplicates: duplicates.length,
  })}.`);
}

const trichlorophenol = parameters.find((item) => item.nome === "2, 4, 6 Triclorofenol");
if (
  trichlorophenol?.resultadoOriginal !== "< 0,003333 μg/L"
  || trichlorophenol.valor !== "0,000003333"
  || trichlorophenol.unidade !== "mg/L"
  || trichlorophenol.resultadoConvertido !== 0.000003333
) {
  throw new Error(`Conversão de 2,4,6-Triclorofenol divergente: ${JSON.stringify(trichlorophenol)}.`);
}

process.stdout.write("parser-full-lot: 92 resultados, 5 revisões e 11 ignorados ok");
