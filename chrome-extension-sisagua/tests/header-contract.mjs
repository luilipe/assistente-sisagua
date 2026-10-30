import fs from "node:fs";
import vm from "node:vm";
import { expected, screen, decoys } from "./fixtures/semestral-header-contract.mjs";

vm.runInThisContext(
  fs.readFileSync(new URL("../header-contract.js", import.meta.url), "utf8"),
  { filename: "header-contract.js" }
);

const contract = globalThis.SISAGUA_HEADER_CONTRACT;
if (!contract) throw new Error("Contrato de cabeçalhos não foi carregado.");

const categoryCounts = Object.fromEntries(
  Object.entries(expected).map(([category, names]) => [category, names.length])
);
const expectedCounts = {
  OUTROS: 6,
  INORGANICOS: 13,
  ORGANICOS: 16,
  AGROTOXICOS: 40,
  ORGANOLEPTICOS: 15,
  PRODUTOS_DESINFECCAO: 5,
  RADIOATIVIDADE: 2,
};
if (JSON.stringify(categoryCounts) !== JSON.stringify(expectedCounts)) {
  throw new Error(`Contagens da fixture divergentes: ${JSON.stringify(categoryCounts)}.`);
}

let resolved = 0;
for (const [category, names] of Object.entries(expected)) {
  const headers = [...screen[category], ...(decoys[category] || [])];
  for (const name of names) {
    const resolution = contract.resolve(name, headers, (header) => header);
    if (resolution.status !== "RESOLVED") {
      throw new Error(`${category}/${name} não resolveu unicamente: ${JSON.stringify(resolution)}.`);
    }
    if (name === "Atrazina + S-Clorotriazinas" && resolution.mode !== "CONTROLLED_EXPANSION") {
      throw new Error(`Atrazina não usou expansão controlada: ${resolution.mode}.`);
    }
    if (
      ["Atividade alfa total", "Atividade beta total"].includes(name)
      && (resolution.mode !== "EXACT" || resolution.screenName.includes("subtração"))
    ) {
      throw new Error(`Radioatividade escolheu o cabeçalho incorreto: ${JSON.stringify(resolution)}.`);
    }
    resolved += 1;
  }
}
if (resolved !== 97) throw new Error(`Esperava resolver 97 itens, resolveu ${resolved}.`);

const legacyClordane = contract.resolve("Clordano Total", screen.AGROTOXICOS, (header) => header);
if (legacyClordane.status !== "RESOLVED" || legacyClordane.mode !== "ALIAS") {
  throw new Error(`Alias legado de Clordano falhou: ${JSON.stringify(legacyClordane)}.`);
}
const legacyAmmonia = contract.resolve("Nitrogênio Amoniacal", screen.OUTROS, (header) => header);
if (legacyAmmonia.status !== "RESOLVED" || legacyAmmonia.mode !== "ALIAS") {
  throw new Error(`Alias legado de Nitrogênio Amoniacal falhou: ${JSON.stringify(legacyAmmonia)}.`);
}

for (const [header, expectedName] of [
  ["Condutividade elétrica µS/cm", "Condutividade elétrica"],
  ["Cor Verdadeira uH", "Cor Verdadeira"],
  ["Fósforo Total mg/L", "Fósforo Total"],
  ["Turbidez NTU", "Turbidez"],
]) {
  const actual = contract.parameterNameFromText(header);
  if (actual !== expectedName) throw new Error(`Unidade não removida de '${header}': '${actual}'.`);
}

if (!contract.unitsEquivalent("CU", "uH") || !contract.unitsEquivalent("NTU", "uT")) {
  throw new Error("Equivalências explícitas de cor/turbidez não foram preservadas.");
}

process.stdout.write("header-contract: 97/97 ok");
