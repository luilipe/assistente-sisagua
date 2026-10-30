globalThis.SISAGUA_PARSER = (() => {
  "use strict";

  const legacy = globalThis.SISAGUA_PARSER;
  const core = globalThis.SISAGUA_CORE;
  const legalBase = globalThis.SISAGUA_LEGAL_BASE;
  if (!legacy?.SYNONYMS || !core || legalBase?.status !== "USO_LOCAL_ROTINEIRO") {
    throw new Error("Dependências do parser seguro não foram carregadas.");
  }

  const LEGAL_BASE_ID = legalBase.baseId;
  const synonyms = legacy.SYNONYMS;
  const ignoredParameters = legacy.IGNORED_PARAMETERS;
  const synonymKeys = Object.keys(synonyms).sort((a, b) => b.length - a.length);
  const ignoredKeys = Object.keys(ignoredParameters).sort((a, b) => b.length - a.length);

  const dialogTexts = {
    INORGANICOS: "SUBSTANCIAS INORGANICAS",
    ORGANICOS: "SUBSTANCIAS ORGANICAS",
    AGROTOXICOS: "AGROTOXICOS",
    OUTROS: "OUTROS",
    PRODUTOS_DESINFECCAO: "PRODUTOS SECUNDARIOS DE DESINFECCAO",
    RADIOATIVIDADE: "RADIOATIVIDADE",
    ORGANOLEPTICOS: "PARAMETROS ORGANOLEPTICOS",
  };
  const titleLabels = {
    INORGANICOS: "Inorgânicos",
    ORGANICOS: "Orgânicos",
    AGROTOXICOS: "Agrotóxicos",
    OUTROS: "Outros",
    PRODUTOS_DESINFECCAO: "Produtos de desinfecção",
    RADIOATIVIDADE: "Radioatividade",
    ORGANOLEPTICOS: "Organolépticos",
  };
  const pointLabels = {
    CAPTACAO_POCO: "captação",
    SAIDA_TRATAMENTO: "saída do tratamento",
    CONSUMO: "consumo",
  };

  function resolveMapping(key, point) {
    if (key === "nitrogenio amoniacal") {
      return point === "SAIDA_TRATAMENTO"
        ? {
            sisagua: "Amônia (como N)",
            legalName: "Amônia (como N)",
            categoria: "ORGANOLEPTICOS",
          }
        : {
            sisagua: "Nitrogênio Amoniacal Total",
            legalName: "Nitrogenio Amoniacal Total",
            categoria: "OUTROS",
          };
    }
    return synonyms[key] || null;
  }

  function normalizeWithOffsets(original) {
    let normalized = "";
    const offsets = [];
    let pendingSpace = false;
    let pendingSpaceOffset = 0;
    for (let index = 0; index < original.length;) {
      const codePoint = original.codePointAt(index);
      const character = String.fromCodePoint(codePoint);
      const normalizedCharacter = character
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      for (const unit of normalizedCharacter) {
        if (/\s/.test(unit)) {
          if (normalized && !pendingSpace) {
            pendingSpace = true;
            pendingSpaceOffset = index;
          }
        } else {
          if (pendingSpace) {
            normalized += " ";
            offsets.push(pendingSpaceOffset);
            pendingSpace = false;
          }
          normalized += unit;
          offsets.push(index);
        }
      }
      index += character.length;
    }
    return { normalized, offsets };
  }

  function originalOffset(original, normalizedIndex) {
    const { offsets } = normalizeWithOffsets(original);
    return offsets[normalizedIndex] ?? original.length;
  }

  function isHeaderDate(text, index) {
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    const prefix = core.norm(text.substring(lineStart, index));
    return /(data coleta|recebimento|publicacao|emissao)\s*:?\s*$/.test(prefix);
  }

  function analysisDates(text) {
    const dates = [];
    const regex = /(\d{2}\/\d{2}\/\d{4})/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!isHeaderDate(text, match.index) && core.isValidDateFormat(match[1])) {
        dates.push({ date: match[1], index: match.index });
      }
    }
    return dates;
  }

  function uniqueNormalized(values) {
    return [...new Map(values.map((value) => [core.norm(value), value])).values()];
  }

  function findOccurrences(blockText) {
    const normalized = normalizeWithOffsets(blockText).normalized;
    const definitions = [
      ...synonymKeys.map((key) => ({ key, kind: "mapped" })),
      ...ignoredKeys.map((key) => ({ key, kind: "ignored" })),
    ];
    const candidates = [];
    for (const definition of definitions) {
      let offset = 0;
      while (offset < normalized.length) {
        const index = normalized.indexOf(definition.key, offset);
        if (index < 0) break;
        const before = index > 0 ? normalized[index - 1] : "";
        const after = index + definition.key.length < normalized.length
          ? normalized[index + definition.key.length]
          : "";
        if ((!before || /[^a-z0-9]/.test(before)) && (!after || /[^a-z0-9]/.test(after))) {
          candidates.push({ ...definition, index, end: index + definition.key.length });
        }
        offset = index + Math.max(1, definition.key.length);
      }
    }
    return candidates
      .sort((a, b) => a.index - b.index || b.key.length - a.key.length)
      .filter((candidate, index, array) => !array.slice(0, index).some(
        (prior) => candidate.index >= prior.index && candidate.end <= prior.end
      ));
  }

  function normalizeRawNumber(rawValue) {
    let value = rawValue.replace(/[^\d.,E+-]/gi, "");
    if (value.includes(".") && value.includes(",")) value = value.replace(/\./g, "");
    else if ((value.match(/\./g) || []).length > 1) value = value.replace(/\./g, "");
    else value = value.replace(".", ",");
    return value;
  }

  function makeReview(parameter, reason, informational) {
    return {
      nome: parameter.nome,
      resultado: parameter.resultadoOriginal,
      motivo: reason,
      coleta: parameter.coleta,
      analise: parameter.analise,
      unidade: parameter.unidadeOriginal || parameter.unidade,
      valorSugerido: informational ? undefined : parameter.valor,
      informational,
      amostra: parameter.amostra,
      arquivoOrigem: parameter.arquivoOrigem,
      tipoOrigem: parameter.tipoOrigem,
      fonteId: parameter.fonteId || "",
      avaliacaoLegal: parameter.avaliacaoLegal || "",
    };
  }

  function parseReport(text, options = {}) {
    if (typeof text !== "string") throw new Error("O texto de entrada deve ser uma string.");
    try {
      const resultsPart = text.replace(
        /Especificações[\s\S]*?(?=(?:=+\s*PÁGINA\s+\d+\s*=+|Data\s+de\s+Publicação:)|$)/gi,
        ""
      );
      const lines = resultsPart.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const sampleHeaders = [];
      const collectionDates = [];
      const clients = [];

      for (const line of lines) {
        const sample = line.match(/\bN(?:Âº|[º°]|o\.?)?\s*Amostra:\s*([^\s-]+-\d+\/\d+\.\d+)\s*-\s*(.+)/i);
        if (sample) sampleHeaders.push({ amostra: sample[1], ponto: sample[2].replace(/\(.*?\)/g, "").trim() });
        const collection = line.match(/Data\s+Coleta:\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (collection) collectionDates.push(collection[1]);
        const client = line.match(/Cliente:\s*(.*?)(?=\s*CNPJ\/CPF:|$)/i);
        if (client) clients.push(client[1].replace(/\s+/g, " ").trim());
      }

      const samples = [...new Set(sampleHeaders.map((header) => header.amostra))];
      const points = uniqueNormalized(sampleHeaders.map((header) => header.ponto));
      const collections = [...new Set(collectionDates)];
      const clientNames = uniqueNormalized(clients);
      const missing = [];
      if (!samples.length) missing.push("Nº Amostra");
      if (!collections.length) missing.push("Data Coleta");
      if (!points.length) missing.push("ponto da amostra");
      if (!clientNames.length) missing.push("Cliente");
      if (missing.length) throw new Error(`Cabeçalho incompleto (${missing.join(", ")}).`);
      if (samples.length !== 1 || points.length !== 1 || collections.length !== 1 || clientNames.length !== 1) {
        throw new Error("Foram detectadas amostras, pontos, coletas ou clientes diferentes. Importe um laudo/amostra por vez.");
      }

      const amostra = samples[0];
      const dataColeta = collections[0];
      const [, collectionMonth, collectionYear] = dataColeta.split("/").map(Number);
      const competencia = `${collectionMonth <= 6 ? "1º" : "2º"} semestre de ${collectionYear}`;
      const pontoIdentificacao = points[0];
      const ponto = core.classifyPoint(pontoIdentificacao);
      if (ponto === "INDEFINIDO") throw new Error(`Ponto '${pontoIdentificacao}' não pôde ser classificado com segurança.`);
      const cliente = clientNames[0];
      const origemInformada = String(options.arquivoOrigem || "").trim();
      const tipoOrigem = origemInformada ? "ARQUIVO_INFORMADO" : "TEXTO_COLADO";
      const arquivoOrigem = origemInformada || `TEXTO_COLADO — amostra ${amostra}`;
      const rawText = lines.join("\n");
      const dates = analysisDates(rawText);
      if (!dates.length) throw new Error("Nenhuma data de análise foi reconhecida.");

      const parsed = [];
      const reviews = [];
      const ignored = [];
      const unmapped = [];
      const duplicates = [];
      const seen = new Map();
      const blocked = new Set();
      const resultRegex = /(?:(<\s*|>\s*)?(\d+(?:[.,]\d+)*(?:E[+-]?\d+)?))|(\b(ausencia|ausência|ausente|presenca|presença|presente)\b)/i;
      const unitRegex = /^(mg\/L|[µμu]g\/L|NTU|uT|CU|Bq\/L|uH|[µμu]S\/cm|UFC\/mL|NMP\/100mL)(?=\s|$)/i;

      for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
        const dataAnalise = dates[dateIndex].date;
        const blockStart = dateIndex > 0 ? dates[dateIndex - 1].index + 10 : 0;
        const blockText = rawText.substring(blockStart, dates[dateIndex].index).replace(/\n+/g, " ").trim();
        if (core.norm(blockText).includes("soma das razoes")) continue;
        const occurrences = findOccurrences(blockText);

        if (!occurrences.length) {
          const result = blockText.match(resultRegex);
          const guessedName = result ? blockText.substring(0, result.index).trim() : "";
          if (result && guessedName.length > 2 && guessedName.length < 80 && !guessedName.includes(":")) {
            unmapped.push({ originalName: guessedName, originalValue: result[0], dataAnalise });
          }
          continue;
        }

        for (let occurrenceIndex = 0; occurrenceIndex < occurrences.length; occurrenceIndex += 1) {
          const occurrence = occurrences[occurrenceIndex];
          const originalStart = originalOffset(blockText, occurrence.index);
          const originalEnd = originalOffset(blockText, occurrence.end);
          const nextStart = occurrenceIndex + 1 < occurrences.length
            ? originalOffset(blockText, occurrences[occurrenceIndex + 1].index)
            : blockText.length;
          const segment = blockText.substring(originalEnd, nextStart).trim();
          const result = segment.match(resultRegex);
          const originalName = blockText.substring(originalStart, originalEnd).trim();

          if (occurrence.kind === "ignored") {
            const definition = ignoredParameters[occurrence.key];
            ignored.push({
              originalName: definition.label,
              originalValue: result?.[0] || "",
              dataAnalise,
              reason: definition.reason,
            });
            continue;
          }

          const mapping = resolveMapping(occurrence.key, ponto);
          if (!mapping || !result) {
            unmapped.push({ originalName, originalValue: result?.[0] || "", dataAnalise });
            continue;
          }

          const qualifier = result[1]?.trim() || "";
          const qualitative = result[3] || "";
          const value = qualitative
            ? (mapping.sisagua === "Gosto e Odor" && core.norm(qualitative).startsWith("aus") ? "0" : qualitative)
            : normalizeRawNumber(result[2]);
          const afterValue = segment.substring(result.index + result[0].length).trim();
          const rawUnit = afterValue.match(unitRegex)?.[1] || "";
          const originalValue = `${qualifier ? `${qualifier} ` : ""}${result[2] || qualitative}${rawUnit ? ` ${rawUnit}` : ""}`;
          const parameter = {
            nome: mapping.sisagua,
            nomeLegal: mapping.legalName || mapping.sisagua,
            categoria: mapping.categoria,
            coleta: dataColeta,
            analise: dataAnalise,
            valor: value,
            resultadoOriginal: originalValue,
            qualificador: qualifier,
            unidade: core.normalizeUnit(rawUnit),
            unidadeOriginal: rawUnit,
            parametroOriginal: originalName,
            amostra,
            arquivoOrigem,
            tipoOrigem,
            pagina: options.pagina || "",
            observacao: mapping.obs || "",
          };

          if (!core.isCategoryPointAllowed(mapping.categoria, ponto)) {
            ignored.push({
              originalName: mapping.sisagua,
              originalValue,
              dataAnalise,
              reason: `Categoria ${mapping.categoria} incompatível com ${ponto}; o resultado não será deslocado.`,
            });
            continue;
          }

          const evaluation = core.evaluateLegal(parameter, ponto, legalBase);
          Object.assign(parameter, {
            fonteId: evaluation.fonteId,
            tipoLimite: evaluation.tipoLimite,
            limiteLegal: evaluation.limiteLegal,
            resultadoConvertido: evaluation.resultadoConvertido,
            unidadeComparacao: evaluation.unidadeComparacao,
            conversaoAplicada: evaluation.conversaoAplicada,
            normalizacaoQualitativa: evaluation.normalizacaoQualitativa,
            qualificadorComparacao: evaluation.qualificadorComparacao,
            avaliacaoLegal: evaluation.status,
            decisaoLancamento: evaluation.decision,
            regra: evaluation.regra,
            conclusao: evaluation.message,
          });
          if (evaluation.conversaoAplicada && evaluation.resultadoConvertido !== undefined && evaluation.unidadeComparacao) {
            parameter.valor = String(evaluation.resultadoConvertido).replace(".", ",");
            parameter.unidade = evaluation.unidadeComparacao;
          }

          const duplicateKey = `${mapping.categoria}|${core.identityKey(mapping.sisagua)}`;
          const signature = [originalValue, dataAnalise, rawUnit].join("|");
          if (blocked.has(duplicateKey)) continue;
          if (seen.has(duplicateKey)) {
            const prior = seen.get(duplicateKey);
            if (prior.signature === signature) {
              duplicates.push({ nome: parameter.nome, type: "EXACT", resultado: originalValue, dataAnalise });
              continue;
            }
            blocked.add(duplicateKey);
            for (let index = parsed.length - 1; index >= 0; index -= 1) {
              if (parsed[index].key === duplicateKey) parsed.splice(index, 1);
            }
            for (let index = reviews.length - 1; index >= 0; index -= 1) {
              if (reviews[index].key === duplicateKey) reviews.splice(index, 1);
            }
            reviews.push({
              key: duplicateKey,
              categoria: mapping.categoria,
              review: makeReview(
                parameter,
                `Duplicidade conflitante: '${prior.parameter.resultadoOriginal}' e '${originalValue}'.`,
                true
              ),
            });
            duplicates.push({ nome: parameter.nome, type: "CONFLICT", values: [prior.parameter.resultadoOriginal, originalValue] });
            continue;
          }
          seen.set(duplicateKey, { signature, parameter });

          if (evaluation.status === "NIVEL_TRIAGEM") {
            parsed.push({
              key: duplicateKey,
              categoria: mapping.categoria,
              parameter,
              originalName,
            });
          } else if (["BLOQUEAR", "CONFIRMACAO_PREVIA"].includes(evaluation.decision)) {
            reviews.push({
              key: duplicateKey,
              categoria: mapping.categoria,
              review: makeReview(
                parameter,
                `${evaluation.status}: ${evaluation.message}`,
                evaluation.decision === "BLOQUEAR"
              ),
            });
          } else {
            parsed.push({
              key: duplicateKey,
              categoria: mapping.categoria,
              parameter,
              originalName,
            });
          }
        }
      }

      const categories = new Set([
        ...parsed.map((entry) => entry.categoria),
        ...reviews.map((entry) => entry.categoria),
      ]);
      const importGroupId = core.makeStorageId([cliente, amostra, pontoIdentificacao, dataColeta]);
      const batches = [];
      for (const category of categories) {
        const categoryParameters = parsed.filter((entry) => entry.categoria === category);
        const categoryReviews = reviews.filter((entry) => entry.categoria === category).map((entry) => entry.review);
        const batch = {
          schemaVersion: 2,
          id: `${importGroupId}-${category}`,
          importGroupId,
          baseId: LEGAL_BASE_ID,
          tipo: "SEMESTRAL",
          ponto,
          categoria: category,
          dialogText: dialogTexts[category],
          titulo: `${titleLabels[category]} — ${pointLabels[ponto]}`,
          cliente,
          amostra,
          arquivoOrigem,
          tipoOrigem,
          dataColeta,
          competencia,
          pontoIdentificacao,
          parametros: categoryParameters.map((entry) => entry.parameter),
          revisoes: categoryReviews,
          importDiagnostics: { unmapped, ignored, duplicates },
          _mappedInfo: categoryParameters.map((entry) => ({
            sisagua: entry.parameter.nome,
            original: entry.originalName,
            valor: entry.parameter.valor,
            avaliacaoLegal: entry.parameter.avaliacaoLegal,
          })),
        };
        if (category === "PRODUTOS_DESINFECCAO") batch.sampleCount = 1;
        batch.requiresConfirmation = true;
        batch.pontoDescricao = pointLabels[ponto];
        batch.confirmationReason = "Confirme o SAC/cliente, a competência semestral, a amostra, o bloco e o ponto exibidos antes do preenchimento.";
        if (categoryParameters.some((entry) => entry.parameter.avaliacaoLegal === "NIVEL_TRIAGEM")) {
          batch.confirmationReason += " A radioatividade usa nível de triagem: confirme também resultado, unidade, regra e conclusão.";
        }
        batches.push(batch);
      }

      return {
        header: {
          amostra,
          dataColeta,
          competencia,
          ponto: pontoIdentificacao,
          tipoPonto: ponto,
          cliente,
          arquivoOrigem,
          tipoOrigem,
        },
        batches,
        unmapped,
        ignored,
        duplicates,
      };
    } catch (error) {
      throw new Error(`Falha no processamento do laudo: ${error.message}`);
    }
  }

  return { parseReport, LEGAL_BASE_ID, secureVersion: 2 };
})();
