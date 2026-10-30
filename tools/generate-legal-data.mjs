import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolDir, "..");
const metaPath = path.join(root, "referencias", "limites_legais_sisagua.meta");
const csvPath = path.join(root, "referencias", "limites_legais_sisagua.csv");
const outputPath = path.join(root, "chrome-extension-sisagua", "legal-data.js");
const temporaryPath = `${outputPath}.tmp`;

const expectedColumns = [
  "parametro",
  "aliases",
  "grupo",
  "tipo_limite",
  "minimo",
  "maximo",
  "unidade",
  "resultado_aceito",
  "aplicacao",
  "fonte",
  "observacao",
];

const allowedLimitTypes = new Set([
  "VMP",
  "MINIMO",
  "FAIXA",
  "AUSENCIA",
  "FORMULA",
  "REGRA_PERCENTUAL",
  "NIVEL_TRIAGEM",
  "GATILHO",
  "INFORMATIVO",
]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\btotais\b/g, "total")
    .replace(/[^a-z0-9]+/g, "");
}

function parseMeta(text) {
  const entries = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) throw new Error(`Linha inválida no metadado: ${line}`);
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    });
  return Object.fromEntries(entries);
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = lines.shift()?.split(";") ?? [];
  if (header.join("|") !== expectedColumns.join("|")) {
    throw new Error(`Cabeçalho inesperado no CSV: ${header.join(";")}`);
  }
  return lines.map((line, index) => {
    const values = line.split(";");
    if (values.length !== expectedColumns.length) {
      throw new Error(`Linha ${index + 2} possui ${values.length} colunas; esperado: ${expectedColumns.length}.`);
    }
    return Object.fromEntries(expectedColumns.map((column, columnIndex) => [column, values[columnIndex].trim()]));
  });
}

function validate(meta, rows) {
  if (meta.status !== "USO_LOCAL_ROTINEIRO") {
    throw new Error(`Base legal indisponível para rotina: status=${meta.status || "AUSENTE"}.`);
  }
  if (!meta.base_id) throw new Error("base_id ausente no metadado.");

  const identities = new Map();
  for (const [index, row] of rows.entries()) {
    if (!row.parametro) throw new Error(`Parâmetro vazio na linha ${index + 2}.`);
    if (!allowedLimitTypes.has(row.tipo_limite)) {
      throw new Error(`tipo_limite inválido para ${row.parametro}: ${row.tipo_limite}.`);
    }
    if (!row.fonte) throw new Error(`fonte ausente para ${row.parametro}.`);
    for (const field of ["minimo", "maximo"]) {
      if (row[field] !== "" && !Number.isFinite(Number(row[field]))) {
        throw new Error(`${field} inválido para ${row.parametro}: ${row[field]}.`);
      }
    }
    if (["VMP", "NIVEL_TRIAGEM"].includes(row.tipo_limite) && row.maximo === "") {
      throw new Error(`maximo ausente para ${row.parametro}.`);
    }
    if (row.tipo_limite === "MINIMO" && row.minimo === "") {
      throw new Error(`minimo ausente para ${row.parametro}.`);
    }
    if (row.tipo_limite === "FAIXA" && (row.minimo === "" || row.maximo === "")) {
      throw new Error(`faixa incompleta para ${row.parametro}.`);
    }

    const names = [row.parametro, ...row.aliases.split("|").map((alias) => alias.trim()).filter(Boolean)];
    for (const name of names) {
      const key = normalize(name);
      const prior = identities.get(key);
      if (prior && prior !== row.parametro) {
        throw new Error(`Identidade/alias ambíguo '${name}': ${prior} e ${row.parametro}.`);
      }
      identities.set(key, row.parametro);
    }
  }
}

const meta = parseMeta(await fs.readFile(metaPath, "utf8"));
const rows = parseCsv(await fs.readFile(csvPath, "utf8"));
validate(meta, rows);

const payload = {
  schemaVersion: 1,
  baseId: meta.base_id,
  status: meta.status,
  verifiedAt: meta.verificado_em || "",
  standard: meta.norma || "",
  rows,
};

const source = [
  "/* Gerado por tools/generate-legal-data.mjs. Não editar manualmente. */",
  `globalThis.SISAGUA_LEGAL_BASE = ${JSON.stringify(payload, null, 2)};`,
  "",
].join("\n");

await fs.writeFile(temporaryPath, source, "utf8");
await fs.rename(temporaryPath, outputPath);
process.stdout.write(`legal-data: ${rows.length} parâmetros | ${meta.base_id}\n`);
