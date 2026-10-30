globalThis.SISAGUA_CORE = (() => {
  "use strict";

  const ALERT_STATUSES = new Set([
    "EXCEDE_VMP",
    "ABAIXO_MINIMO",
    "NAO_CONFORME_QUALITATIVO",
    "INCONCLUSIVO_LQ",
    "ATENCAO_UNIDADE",
    "PENDENTE_APLICACAO",
    "PENDENTE_IDENTIDADE",
    "REGRA_ESPECIAL",
  ]);

  const POINT_CATEGORY_MATRIX = {
    INORGANICOS: new Set(["CAPTACAO_POCO"]),
    ORGANICOS: new Set(["CAPTACAO_POCO"]),
    AGROTOXICOS: new Set(["CAPTACAO_POCO"]),
    OUTROS: new Set(["CAPTACAO_POCO"]),
    PRODUTOS_DESINFECCAO: new Set(["SAIDA_TRATAMENTO", "CONSUMO"]),
    RADIOATIVIDADE: new Set(["SAIDA_TRATAMENTO", "CONSUMO"]),
    ORGANOLEPTICOS: new Set(["SAIDA_TRATAMENTO", "CONSUMO"]),
  };

  function norm(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u00a0\u202f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function identityKey(value) {
    return norm(value)
      .replace(/\btotais\b/g, "total")
      .replace(/[^a-z0-9]+/g, "");
  }

  function isValidDateFormat(dateStr) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(dateStr || ""))) return false;
    const [day, month, year] = dateStr.split("/").map(Number);
    if (year < 2000 || year > 2100 || month < 1 || month > 12) return false;
    return day >= 1 && day <= new Date(year, month, 0).getDate();
  }

  function normalizeQuantifiedValue(value) {
    if (value === undefined || value === null) return null;
    const original = String(value).replace(/[\u00a0\u202f]/g, " ").trim();
    const match = original.match(/^([<>])?\s*(\d+(?:[.,]\d+)?(?:e[+-]?\d+)?)$/i);
    if (!match) return null;
    const numeric = Number(match[2].replace(",", "."));
    if (!Number.isFinite(numeric)) return null;
    return {
      original,
      qualifier: match[1] || "",
      numeric,
      value: String(match[2]).replace(".", ",").replace(/e/i, "E"),
    };
  }

  function normalizeUnit(value) {
    const compact = norm(value).replace(/\s+/g, "");
    const aliases = new Map([
      ["μg/l", "ug/L"],
      ["µg/l", "ug/L"],
      ["ug/l", "ug/L"],
      ["mg/l", "mg/L"],
      ["bq/l", "Bq/L"],
      ["ntu", "NTU"],
      ["ut", "uT"],
      ["uh", "uH"],
      ["cu", "CU"],
      ["μs/cm", "uS/cm"],
      ["µs/cm", "uS/cm"],
      ["us/cm", "uS/cm"],
      ["ufc/ml", "UFC/mL"],
      ["nmp/100ml", "NMP/100mL"],
    ]);
    return aliases.get(compact) || String(value || "").trim();
  }

  function convertUnit(numeric, fromUnit, toUnit) {
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    if (!from && !to) return { numeric, unit: "", converted: false };
    if (!from || !to) return null;
    if (from === to) return { numeric, unit: to, converted: false };
    if ((from === "NTU" && to === "uT") || (from === "uT" && to === "NTU")) {
      return { numeric, unit: to, converted: true };
    }
    if (from === "ug/L" && to === "mg/L") return { numeric: numeric / 1000, unit: to, converted: true };
    if (from === "mg/L" && to === "ug/L") return { numeric: numeric * 1000, unit: to, converted: true };
    return null;
  }

  function classifyPoint(label) {
    const point = norm(label);
    const matches = [];
    if (/(saida do tratamento|saida de tratamento|saida tratamento)/.test(point)) matches.push("SAIDA_TRATAMENTO");
    if (/(ponto de consumo|consumo|torneira|refeitorio|bebedouro|\brede\b)/.test(point)) matches.push("CONSUMO");
    if (/(poco|poço|agua subterranea|captacao|captação|saida do poco|saida do poço)/.test(point)) matches.push("CAPTACAO_POCO");
    return [...new Set(matches)].length === 1 ? matches[0] : "INDEFINIDO";
  }

  function isCategoryPointAllowed(category, point) {
    return Boolean(POINT_CATEGORY_MATRIX[category]?.has(point));
  }

  function isApplicationAllowed(application, point) {
    const normalized = norm(application);
    if (!normalized || normalized === "potabilidade" || normalized === "controle da sac") return true;
    if (normalized.includes("pos-desinfeccao")) return point === "SAIDA_TRATAMENTO";
    if (
      normalized === "agua tratada"
      || normalized.startsWith("agua tratada quando")
      || normalized === "agua para consumo humano"
      || normalized === "controle operacional"
    ) {
      return point === "SAIDA_TRATAMENTO" || point === "CONSUMO";
    }
    if (
      normalized === "agua distribuida"
      || normalized.includes("distribuicao e ponto de consumo")
      || normalized === "ponto de consumo de sac"
    ) {
      return point === "CONSUMO";
    }
    return false;
  }

  function buildLegalLookup(base) {
    const lookup = new Map();
    if (!base || base.status !== "USO_LOCAL_ROTINEIRO" || !Array.isArray(base.rows)) return lookup;
    for (const row of base.rows) {
      const names = [row.parametro, ...String(row.aliases || "").split("|")];
      for (const name of names.map((item) => item.trim()).filter(Boolean)) {
        const key = identityKey(name);
        if (!lookup.has(key)) lookup.set(key, row);
      }
    }
    return lookup;
  }

  function evaluateLegal(parameter, point, base) {
    const lookup = buildLegalLookup(base);
    const row = lookup.get(identityKey(parameter.nomeLegal || parameter.nome));
    const legalRule = row?.tipo_limite === "NIVEL_TRIAGEM" && row.maximo !== ""
      ? `Nível de triagem: ${String(row.maximo).replace(".", ",")} ${row.unidade}`.trim()
      : (row?.observacao || "");
    const common = {
      baseId: base?.baseId || "",
      fonteId: row?.fonte || "",
      tipoLimite: row?.tipo_limite || "",
      limiteLegal: row ? {
        minimo: row.minimo === "" ? null : Number(row.minimo),
        maximo: row.maximo === "" ? null : Number(row.maximo),
        unidade: row.unidade || "",
        resultadoAceito: row.resultado_aceito || "",
        aplicacao: row.aplicacao || "",
      } : null,
      regra: legalRule,
    };

    if (!base || base.status !== "USO_LOCAL_ROTINEIRO") {
      return { ...common, status: "PENDENTE_IDENTIDADE", decision: "BLOQUEAR", message: "Base legal local indisponível." };
    }
    if (!row) {
      return { ...common, status: "PENDENTE_IDENTIDADE", decision: "BLOQUEAR", message: "Parâmetro não encontrado na base legal local." };
    }
    if (!isApplicationAllowed(row.aplicacao, point)) {
      return {
        ...common,
        status: "PENDENTE_APLICACAO",
        decision: "BLOQUEAR",
        message: `A aplicação legal '${row.aplicacao || "não informada"}' não contempla o ponto ${point}.`,
      };
    }

    const qualitativeText = norm(`${parameter.valor || ""} ${parameter.resultadoOriginal || ""}`);
    if (row.tipo_limite === "AUSENCIA") {
      if (qualitativeText.includes("presen")) {
        return {
          ...common,
          status: "NAO_CONFORME_QUALITATIVO",
          decision: "BLOQUEAR",
          message: `Resultado qualitativo incompatível com '${row.resultado_aceito || "AUSENCIA"}'.`,
        };
      }
      if (qualitativeText.includes("ausen")) {
        return {
          ...common,
          status: "CONFORME_QUALITATIVO",
          decision: "BLOQUEAR",
          message: "Resultado qualitativo compatível, mas o lançamento exige tratamento manual específico.",
        };
      }
      return {
        ...common,
        status: "PENDENTE_IDENTIDADE",
        decision: "BLOQUEAR",
        message: "Resultado qualitativo não reconhecido com segurança.",
      };
    }
    if (row.tipo_limite === "GATILHO") {
      return {
        ...common,
        status: "REGRA_ESPECIAL",
        decision: "BLOQUEAR",
        message: "Resultado sujeito a gatilho de avaliação; não pode ser tratado como limite simples.",
      };
    }

    const quantified = normalizeQuantifiedValue(parameter.valor);
    if (!quantified) {
      return { ...common, status: "PENDENTE_IDENTIDADE", decision: "BLOQUEAR", message: "Resultado não numérico ou inconclusivo." };
    }

    const targetUnit = row.unidade || parameter.unidade;
    const normalizedOriginal = norm(parameter.resultadoOriginal);
    const normalizesAbsenceToIntensity = identityKey(row.parametro) === "gostoeodor"
      && norm(targetUnit) === "intensidade"
      && (normalizedOriginal.includes("ausencia") || normalizedOriginal.includes("ausente"));
    const converted = normalizesAbsenceToIntensity
      ? {
          numeric: 0,
          unit: targetUnit,
          converted: true,
          normalization: "AUSENCIA_PARA_INTENSIDADE_ZERO",
        }
      : convertUnit(quantified.numeric, parameter.unidade, targetUnit);
    if (!converted) {
      return {
        ...common,
        status: "ATENCAO_UNIDADE",
        decision: "BLOQUEAR",
        message: `Unidade incompatível: '${parameter.unidade || "ausente"}' → '${targetUnit || "ausente"}'.`,
      };
    }

    const result = converted.numeric;
    const qualifier = String(parameter.qualificador || quantified.qualifier || "").trim();
    const minimum = row.minimo === "" ? null : Number(row.minimo);
    const maximum = row.maximo === "" ? null : Number(row.maximo);
    const withResult = {
      ...common,
      resultadoConvertido: result,
      unidadeComparacao: converted.unit,
      conversaoAplicada: converted.converted,
      normalizacaoQualitativa: converted.normalization || "",
      qualificadorComparacao: qualifier,
    };

    if (!isCategoryPointAllowed(parameter.categoria, point)) {
      return { ...withResult, status: "PENDENTE_IDENTIDADE", decision: "BLOQUEAR", message: "Categoria incompatível com o ponto do laudo." };
    }
    if (["FORMULA", "REGRA_PERCENTUAL"].includes(row.tipo_limite)) {
      return { ...withResult, status: "REGRA_ESPECIAL", decision: "BLOQUEAR", message: "Regra legal não pode ser avaliada como limite numérico simples." };
    }
    if (row.tipo_limite === "NIVEL_TRIAGEM") {
      if (qualifier === "<" && maximum !== null && result > maximum) {
        return { ...withResult, status: "INCONCLUSIVO_LQ", decision: "BLOQUEAR", message: "Limite de quantificação superior ao nível de triagem." };
      }
      if (qualifier === ">" && (maximum === null || result < maximum)) {
        return { ...withResult, status: "INCONCLUSIVO_LQ", decision: "BLOQUEAR", message: "Resultado com '>' não permite concluir a posição em relação ao nível de triagem." };
      }
      const isAboveTriage = maximum !== null
        && (result > maximum || (qualifier === ">" && result >= maximum));
      const conclusion = isAboveTriage ? "Acima do nível de triagem." : "No ou abaixo do nível de triagem.";
      return { ...withResult, status: "NIVEL_TRIAGEM", decision: "CONFIRMACAO_PREVIA", message: conclusion };
    }
    if (row.tipo_limite === "INFORMATIVO") {
      return { ...withResult, status: "INFORMATIVO", decision: "LANCAR", message: "Parâmetro informativo, sem VMP simples." };
    }
    if (row.tipo_limite === "VMP") {
      if (qualifier === ">" && maximum !== null && result >= maximum) {
        return { ...withResult, status: "EXCEDE_VMP", decision: "CONFIRMACAO_PREVIA", message: "Resultado acima do VMP." };
      }
      if (qualifier === ">" && (maximum === null || result < maximum)) {
        return { ...withResult, status: "INCONCLUSIVO_LQ", decision: "BLOQUEAR", message: "Resultado com '>' não permite concluir conformidade." };
      }
      if (qualifier === "<" && maximum !== null && result > maximum) {
        return { ...withResult, status: "INCONCLUSIVO_LQ", decision: "BLOQUEAR", message: "Limite de quantificação superior ao VMP." };
      }
      if (maximum !== null && result > maximum) {
        return { ...withResult, status: "EXCEDE_VMP", decision: "CONFIRMACAO_PREVIA", message: "Resultado acima do VMP." };
      }
    }
    if (row.tipo_limite === "MINIMO" && minimum !== null) {
      if (qualifier === "<" && result <= minimum) {
        return { ...withResult, status: "ABAIXO_MINIMO", decision: "CONFIRMACAO_PREVIA", message: "Resultado abaixo do mínimo legal." };
      }
      if ((qualifier === "<" && result > minimum) || (qualifier === ">" && result < minimum)) {
        return { ...withResult, status: "INCONCLUSIVO_LQ", decision: "BLOQUEAR", message: "Resultado qualificado não permite concluir conformidade com o mínimo." };
      }
      if (!qualifier && result < minimum) {
        return { ...withResult, status: "ABAIXO_MINIMO", decision: "CONFIRMACAO_PREVIA", message: "Resultado abaixo do mínimo legal." };
      }
    }
    if (row.tipo_limite === "FAIXA") {
      if (qualifier === "<") {
        if (minimum !== null && result <= minimum) {
          return { ...withResult, status: "ABAIXO_MINIMO", decision: "CONFIRMACAO_PREVIA", message: "Resultado abaixo da faixa legal." };
        }
        return { ...withResult, status: "INCONCLUSIVO_LQ", decision: "BLOQUEAR", message: "Resultado com '<' não permite concluir conformidade com a faixa." };
      }
      if (qualifier === ">") {
        if (maximum !== null && result >= maximum) {
          return { ...withResult, status: "EXCEDE_VMP", decision: "CONFIRMACAO_PREVIA", message: "Resultado acima da faixa legal." };
        }
        return { ...withResult, status: "INCONCLUSIVO_LQ", decision: "BLOQUEAR", message: "Resultado com '>' não permite concluir conformidade com a faixa." };
      }
      if ((minimum !== null && result < minimum) || (maximum !== null && result > maximum)) {
        return { ...withResult, status: result < minimum ? "ABAIXO_MINIMO" : "EXCEDE_VMP", decision: "CONFIRMACAO_PREVIA", message: "Resultado fora da faixa legal." };
      }
    }
    return { ...withResult, status: "CONFORME", decision: "LANCAR", message: "Resultado compatível com a regra simples aplicável." };
  }

  function validateBatch(item, allBatches, legalBase) {
    const errors = [];
    if (!item || item.tipo !== "SEMESTRAL") errors.push("O tipo de lote deve ser SEMESTRAL.");
    if (!item?.id) errors.push("O ID do lote está vazio.");
    if (item?.id && allBatches.filter((batch) => batch?.id === item.id).length > 1) errors.push(`O ID '${item.id}' está duplicado.`);
    if (!item?.baseId || item.baseId !== legalBase?.baseId) errors.push(`baseId inválido; esperado '${legalBase?.baseId || "indisponível"}'.`);
    if (legalBase?.status !== "USO_LOCAL_ROTINEIRO") errors.push("A base legal local não está liberada para uso rotineiro.");
    if (!POINT_CATEGORY_MATRIX[item?.categoria]) errors.push(`Categoria desconhecida: ${item?.categoria || "ausente"}.`);
    if (!["CAPTACAO_POCO", "SAIDA_TRATAMENTO", "CONSUMO"].includes(item?.ponto)) errors.push(`Ponto desconhecido: ${item?.ponto || "ausente"}.`);
    if (item?.categoria && item?.ponto && !isCategoryPointAllowed(item.categoria, item.ponto)) {
      errors.push(`Categoria ${item.categoria} incompatível com ${item.ponto}.`);
    }
    if (item?.importGroupId && item?.cliente && item?.pontoIdentificacao && item?.amostra) {
      const sameDestination = allBatches.filter((candidate) => (
        candidate !== item
        && candidate?.importGroupId
        && candidate?.categoria === item.categoria
        && identityKey(candidate?.cliente) === identityKey(item.cliente)
        && identityKey(candidate?.pontoIdentificacao) === identityKey(item.pontoIdentificacao)
        && identityKey(candidate?.amostra) !== identityKey(item.amostra)
      ));
      if (sameDestination.length) {
        errors.push(
          `Há mais de uma amostra para o mesmo cliente, ponto e categoria (${[
            item.amostra,
            ...sameDestination.map((candidate) => candidate.amostra),
          ].join(", ")}). Consolide e aprove os resultados antes de preencher.`
        );
      }
    }

    const parameters = Array.isArray(item?.parametros) ? item.parametros : [];
    const reviews = Array.isArray(item?.revisoes) ? item.revisoes : [];
    if (parameters.length === 0 && reviews.length === 0) errors.push("O lote não possui parâmetros nem revisões.");
    const names = new Set();
    parameters.forEach((parameter, index) => {
      const prefix = `Parâmetro #${index + 1} (${parameter?.nome || "sem nome"}):`;
      const key = identityKey(parameter?.nome);
      if (!parameter?.nome) errors.push(`${prefix} nome ausente.`);
      if (key && names.has(key)) errors.push(`${prefix} nome duplicado.`);
      names.add(key);
      if (!isValidDateFormat(parameter?.coleta)) errors.push(`${prefix} coleta inválida.`);
      if (!isValidDateFormat(parameter?.analise)) errors.push(`${prefix} análise inválida.`);
      if (!normalizeQuantifiedValue(parameter?.valor)) errors.push(`${prefix} valor quantificado inválido.`);
      if (!parameter?.unidade && parameter?.limiteLegal?.unidade) {
        errors.push(`${prefix} unidade necessária para a comparação legal ausente.`);
      }
      if (!parameter?.resultadoOriginal) errors.push(`${prefix} resultado original ausente.`);
      if (!parameter?.amostra) errors.push(`${prefix} amostra ausente.`);
      if (!parameter?.arquivoOrigem) errors.push(`${prefix} arquivo/origem ausente.`);
      if (!parameter?.fonteId) errors.push(`${prefix} fonte_id ausente.`);
      if (!parameter?.avaliacaoLegal) errors.push(`${prefix} avaliação legal ausente.`);
      const safeDecision = parameter?.decisaoLancamento === "LANCAR"
        || (
          parameter?.avaliacaoLegal === "NIVEL_TRIAGEM"
          && parameter?.decisaoLancamento === "CONFIRMACAO_PREVIA"
        );
      if (!safeDecision) {
        errors.push(`${prefix} decisão '${parameter?.decisaoLancamento || "ausente"}' não permite preenchimento automático.`);
      }
    });
    reviews.forEach((review, index) => {
      const prefix = `Revisão #${index + 1} (${review?.nome || "sem nome"}):`;
      const key = identityKey(review?.nome);
      if (!review?.nome) errors.push(`${prefix} nome ausente.`);
      if (key && names.has(key)) errors.push(`${prefix} nome duplicado entre parâmetros/revisões.`);
      names.add(key);
      if (!review?.motivo) errors.push(`${prefix} motivo ausente.`);
      if (!review?.informational && !review?.resultado) errors.push(`${prefix} resultado original ausente.`);
      if (!review?.amostra) errors.push(`${prefix} amostra ausente.`);
      if (!review?.arquivoOrigem) errors.push(`${prefix} arquivo/origem ausente.`);
      if (!review?.informational) {
        if (!isValidDateFormat(review?.coleta)) errors.push(`${prefix} coleta inválida.`);
        if (!isValidDateFormat(review?.analise)) errors.push(`${prefix} análise inválida.`);
      }
    });
    return errors;
  }

  function makeStorageId(parts) {
    const value = parts.map((part) => norm(part)).join("|");
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `IMPORT-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function isAlertStatus(status) {
    return ALERT_STATUSES.has(status);
  }

  return {
    ALERT_STATUSES,
    POINT_CATEGORY_MATRIX,
    norm,
    identityKey,
    isValidDateFormat,
    normalizeQuantifiedValue,
    normalizeUnit,
    convertUnit,
    classifyPoint,
    isCategoryPointAllowed,
    isApplicationAllowed,
    buildLegalLookup,
    evaluateLegal,
    validateBatch,
    makeStorageId,
    isAlertStatus,
  };
})();
