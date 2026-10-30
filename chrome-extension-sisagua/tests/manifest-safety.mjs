import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const scripts = manifest.content_scripts?.[0]?.js || [];
const expectedOrder = [
  "legal-data.js", "core.js", "batch-data.js", "parser.js", "parser-secure.js", "header-contract.js", "content.js",
];
if (scripts.join("|") !== expectedOrder.join("|")) {
  throw new Error(`Ordem de scripts inválida: ${scripts.join(", ")}.`);
}
if (!manifest.permissions?.includes("storage")) {
  throw new Error("Permissão storage ausente.");
}

const content = fs.readFileSync(new URL("../content.js", import.meta.url), "utf8");
if (/["'`](?:enviar|finalizar)["'`][\s\S]{0,120}\.click\s*\(/i.test(content)) {
  throw new Error("Foi detectado possível acionamento de envio definitivo.");
}
if (!content.includes("Registro alterado com sucesso")) {
  throw new Error("Confirmação oficial de salvamento ausente.");
}
if (!content.includes("saveReopenAndAudit")) {
  throw new Error("Fluxo transacional de salvamento/auditoria ausente.");
}
if (!content.includes("parser?.secureVersion !== 2")) {
  throw new Error("O painel pode iniciar sem o parser seguro.");
}
if (!content.includes("globalThis.SISAGUA_HEADER_CONTRACT") || !content.includes("preflightParameterHeaders")) {
  throw new Error("O painel pode iniciar sem o contrato/preflight integral de cabeçalhos.");
}
if (content.includes("sisagua-import-source")) {
  throw new Error("O painel voltou a exigir digitação manual do arquivo/origem.");
}
if (!content.includes("Origem registrada automaticamente")) {
  throw new Error("A origem automática não é informada na prévia da importação.");
}

process.stdout.write("manifest-safety: ok");
