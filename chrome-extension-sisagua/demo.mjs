import { parser, core } from "./tests/load-parser.mjs";

console.log("================================================================================");
console.log("   DEMONSTRAÇÃO DE EXECUÇÃO: ASSISTENTE SISAGUA SAC (v2.0.4)");
console.log("================================================================================\n");

const sampleReportText = `
Cliente: COMPANHIA DE AGUA E ESGOTO SANITIZADA CNPJ: 01.234.567/0001-89
Nº Amostra: 2026-LAUDO-0881 - Saída do Poço
Data Coleta: 14/05/2026 08:30

RESULTADOS ANALÍTICOS:
Condutividade Elétrica a 25ºC: 195 μS/cm (Análise: 16/05/2026)
pH: 7.15 (Análise: 14/05/2026)
Cor Verdadeira: < 5,0 CU (Análise: 15/05/2026)
Turbidez: < 1.20 NTU (Análise: 15/05/2026)
Nitrogênio Amoniacal: < 0.20 mg/L (Análise: 16/05/2026)
Nitrato: 1.45 mg/L (Análise: 17/05/2026)
Ferro: 0,12 mg/L (Análise: 18/05/2026)
Manganês: 0,04 mg/L (Análise: 18/05/2026)
Cloreto: 18,5 mg/L (Análise: 18/05/2026)
Gosto e Odor: Ausência (Análise: 15/05/2026)
2, 4, 6 Triclorofenol: < 0,003333 µg/L (Análise: 20/05/2026)
Trihalometanos Totais (THM): 12,4 µg/L (Análise: 20/05/2026)
`;

console.log("[1] PROCESSANDO TEXTO DO LAUDO...");
const result = parser.parseReport(sampleReportText, { arquivoOrigem: "laudo-demonstracao.txt" });

console.log("\n[2] DADOS EXTRAÍDOS DO CABEÇALHO:");
console.log(`   - Amostra:    ${result.header?.amostra || "N/A"}`);
console.log(`   - Ponto:      ${result.header?.ponto || "N/A"}`);
console.log(`   - Coleta:     ${result.header?.dataColeta || "N/A"}`);
console.log(`   - Cliente:    ${result.header?.cliente || "N/A"}`);

console.log(`\n[3] LOTES GERADOS POR CATEGORIA (${result.batches.length} categorias):`);
for (const batch of result.batches) {
  console.log(`\n--- CATEGORIA: ${batch.categoria} (${batch.parametros.length} parâmetros) ---`);
  for (const p of batch.parametros) {
    const orig = p.resultadoOriginal || p.valor;
    const finalVal = p.valor + " " + p.unidade;
    const obs = p.observacoes ? ` [Obs: ${p.observacoes}]` : "";
    const status = p.avaliacaoLegal ? ` [Status Legal: ${p.avaliacaoLegal}]` : "";
    console.log(`   ✓ ${p.nome.padEnd(28)} | Orig: ${orig.padEnd(15)} => Sisagua: ${finalVal.padEnd(16)}${status}${obs}`);
  }
}

if (result.ignored && result.ignored.length > 0) {
  console.log(`\n[4] ITENS IGNORADOS/FORA DO ESCOPO (${result.ignored.length}):`);
  for (const ign of result.ignored) {
    console.log(`   - ${ign.nome || ign}`);
  }
}

if (result.unmapped && result.unmapped.length > 0) {
  console.log(`\n[5] ITENS NÃO MAPEADOS (${result.unmapped.length}):`);
  for (const un of result.unmapped) {
    console.log(`   ? ${un.nome || un}`);
  }
}

console.log("\n================================================================================");
console.log("   DEMONSTRAÇÃO CONCLUÍDA COM SUCESSO!");
console.log("================================================================================");
