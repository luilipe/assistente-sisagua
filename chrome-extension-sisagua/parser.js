globalThis.SISAGUA_PARSER = (() => {
  "use strict";

  const core = globalThis.SISAGUA_CORE;
  const legalBase = globalThis.SISAGUA_LEGAL_BASE;
  if (!core) throw new Error("SISAGUA_CORE não foi carregado antes do parser.");
  if (!legalBase || legalBase.status !== "USO_LOCAL_ROTINEIRO") {
    throw new Error("Base legal local indisponível para o importador.");
  }
  const LEGAL_BASE_ID = legalBase.baseId;

  // Synonym mapping dictionary
  const SYNONYMS = {
    "ph":                              { sisagua: "pH",                       categoria: "OUTROS" },
    "condutividade eletrica a 25oc":   { sisagua: "Condutividade Elétrica",   categoria: "OUTROS" },
    "condutividade eletrica a 25ºc":   { sisagua: "Condutividade Elétrica",   categoria: "OUTROS" },
    "cor verdadeira":                  { sisagua: "Cor Verdadeira",           categoria: "OUTROS" },
    "turbidez":                        { sisagua: "Turbidez",                 categoria: "OUTROS" },
    "fosforo total":                   { sisagua: "Fósforo Total",            categoria: "OUTROS" },
    // Inorgânicos
    "nitrato":                         { sisagua: "Nitrato (como N)",         categoria: "INORGANICOS" },
    "nitrito":                         { sisagua: "Nitrito (como N)",         categoria: "INORGANICOS" },
    "mercurio":                        { sisagua: "Mercúrio Total",           categoria: "INORGANICOS" },
    "antimonio":                       { sisagua: "Antimônio",                categoria: "INORGANICOS" },
    "arsenio":                         { sisagua: "Arsênio",                  categoria: "INORGANICOS" },
    "bario":                           { sisagua: "Bário",                    categoria: "INORGANICOS" },
    "cadmio":                          { sisagua: "Cádmio",                   categoria: "INORGANICOS" },
    "chumbo":                          { sisagua: "Chumbo",                   categoria: "INORGANICOS" },
    "cobre":                           { sisagua: "Cobre",                    categoria: "INORGANICOS" },
    "cromo":                           { sisagua: "Cromo",                    categoria: "INORGANICOS" },
    "niquel":                          { sisagua: "Níquel",                   categoria: "INORGANICOS" },
    "selenio":                         { sisagua: "Selênio",                  categoria: "INORGANICOS" },
    "uranio":                          { sisagua: "Urânio",                   categoria: "INORGANICOS" },
    // Agrotóxicos
    "2,4-d":                           { sisagua: "2,4 D",                                            categoria: "AGROTOXICOS" },
    "alacloro":                        { sisagua: "Alacloro",                                         categoria: "AGROTOXICOS" },
    "aldicarb + sulfona + sulfoxido":  { sisagua: "Aldicarbe + Aldicarbesulfona + Aldicarbesulfóxido", categoria: "AGROTOXICOS" },
    "aldrin + dieldrin":               { sisagua: "Aldrin + Dieldrin",                                 categoria: "AGROTOXICOS" },
    "ametrina":                        { sisagua: "Ametrina",                                         categoria: "AGROTOXICOS" },
    "atrazina + s-clorotriazinas":     { sisagua: "Atrazina + S-Clorotriazinas",                      categoria: "AGROTOXICOS" },
    "carbendazim":                     { sisagua: "Carbendazim",                                      categoria: "AGROTOXICOS" },
    "carbofurano":                     { sisagua: "Carbofurano",                                      categoria: "AGROTOXICOS" },
    "ciproconazol":                    { sisagua: "Ciproconazol",                                     categoria: "AGROTOXICOS" },
    "clordano (trans)":                { sisagua: "Clordano",                                         legalName: "Clordano", categoria: "AGROTOXICOS", obs: "Alias contextual confirmado para este formato: Clordano (Trans) → Clordano." },
    "clorotalonil":                    { sisagua: "Clorotalonil",                                     categoria: "AGROTOXICOS" },
    "clorpirifos + oxon":              { sisagua: "Clorpirifós + clorpirifós-oxon",                   categoria: "AGROTOXICOS" },
    "p,p'-ddt + p,p'-dde + p,p'-ddd":  { sisagua: "DDT + DDD + DDE",                                  categoria: "AGROTOXICOS" },
    "difenoconazol":                   { sisagua: "Difenoconazol",                                    categoria: "AGROTOXICOS" },
    "dimetoato + ometoato":            { sisagua: "Dimetoato + ometoato",                             categoria: "AGROTOXICOS" },
    "diuron":                          { sisagua: "Diuron",                                           categoria: "AGROTOXICOS" },
    "epoxiconazol":                    { sisagua: "Epoxiconazol",                                     categoria: "AGROTOXICOS" },
    "fipronil":                        { sisagua: "Fipronil",                                         categoria: "AGROTOXICOS" },
    "flutriafol":                      { sisagua: "Flutriafol",                                       categoria: "AGROTOXICOS" },
    "glifosato + ampa":                { sisagua: "Glifosato + AMPA",                                 categoria: "AGROTOXICOS" },
    "hidroxi-atrazina":                { sisagua: "Hidroxi-Atrazina",                                 categoria: "AGROTOXICOS" },
    "lindano (gama-hch)":              { sisagua: "Lindano (gama HCH)",                               categoria: "AGROTOXICOS" },
    "malation":                        { sisagua: "Malationa",                                        categoria: "AGROTOXICOS" },
    "mancozebe + etu":                 { sisagua: "Mancozebe + ETU",                                  categoria: "AGROTOXICOS" },
    "metamidofos + acefato":           { sisagua: "Metamidofós + Acefato",                            categoria: "AGROTOXICOS" },
    "metolacloro":                     { sisagua: "Metolacloro",                                      categoria: "AGROTOXICOS" },
    "metribuzim":                      { sisagua: "Metribuzim",                                       categoria: "AGROTOXICOS" },
    "molinato":                        { sisagua: "Molinato",                                         categoria: "AGROTOXICOS" },
    "paraquate":                       { sisagua: "Paraquate",                                        categoria: "AGROTOXICOS" },
    "picloram":                        { sisagua: "Picloram",                                         categoria: "AGROTOXICOS" },
    "profenofos":                      { sisagua: "Profenofós",                                       categoria: "AGROTOXICOS" },
    "propargite":                      { sisagua: "Propargito",                                       categoria: "AGROTOXICOS" },
    "protioconazol + proticonazoldestio": { sisagua: "Protioconazol + ProticonazolDestio",            categoria: "AGROTOXICOS" },
    "simazina":                        { sisagua: "Simazina",                                         categoria: "AGROTOXICOS" },
    "tebuconazol":                     { sisagua: "Tebuconazol",                                      categoria: "AGROTOXICOS" },
    "terbufos":                        { sisagua: "Terbufós",                                         categoria: "AGROTOXICOS" },
    "tiodicarb":                       { sisagua: "Tiodicarbe",                                       categoria: "AGROTOXICOS" },
    "tiametoxam":                      { sisagua: "Tiametoxam",                                       categoria: "AGROTOXICOS" },
    "tiram":                           { sisagua: "Tiram",                                            categoria: "AGROTOXICOS" },
    "trifluralina":                    { sisagua: "Trifluralina",                                     categoria: "AGROTOXICOS" },
    // Orgânicos
    "1,2-dicloroetano":                { sisagua: "1,2 Dicloroetano",          categoria: "ORGANICOS" },
    "acrilamida":                      { sisagua: "Acrilamida",                 categoria: "ORGANICOS" },
    "benzeno":                         { sisagua: "Benzeno",                    categoria: "ORGANICOS" },
    "benzo(a)pireno":                  { sisagua: "Benzo[a]pireno",            categoria: "ORGANICOS" },
    "cloreto de vinila":               { sisagua: "Cloreto de Vinila",          categoria: "ORGANICOS" },
    "di(2-etilhexil)ftalato":          { sisagua: "Di (2-etilhexil) ftalato", categoria: "ORGANICOS" },
    "diclorometano":                   { sisagua: "Diclorometano",              categoria: "ORGANICOS" },
    "dioxano":                         { sisagua: "Dioxano",                    categoria: "ORGANICOS" },
    "epicloridrina":                   { sisagua: "Epicloridrina",              categoria: "ORGANICOS" },
    "etilbenzeno":                     { sisagua: "Etilbenzeno",                categoria: "ORGANICOS" },
    "pentaclorofenol":                 { sisagua: "Pentaclorofenol",            categoria: "ORGANICOS" },
    "tetracloreto de carbono":         { sisagua: "Tetracloreto de Carbono", categoria: "ORGANICOS" },
    "tetracloroeteno":                 { sisagua: "Tetracloroeteno",            categoria: "ORGANICOS" },
    "tolueno":                         { sisagua: "Tolueno",                    categoria: "ORGANICOS" },
    "tricloroeteno":                   { sisagua: "Tricloroeteno",              categoria: "ORGANICOS" },
    "xilenos":                         { sisagua: "Xilenos",                    categoria: "ORGANICOS" },
    // Organolépticos
    "aluminio":                        { sisagua: "Alumínio",                  categoria: "ORGANOLEPTICOS" },
    "solidos dissolvidos totais":      { sisagua: "Sólidos Dissolvidos Totais", categoria: "ORGANOLEPTICOS" },
    "cloreto":                         { sisagua: "Cloreto",                   categoria: "ORGANOLEPTICOS" },
    "dureza total":                    { sisagua: "Dureza total",               categoria: "ORGANOLEPTICOS" },
    "manganes":                        { sisagua: "Manganês",                  categoria: "ORGANOLEPTICOS" },
    "sodio":                           { sisagua: "Sódio",                      categoria: "ORGANOLEPTICOS" },
    "zinco":                           { sisagua: "Zinco",                      categoria: "ORGANOLEPTICOS" },
    "ferro":                           { sisagua: "Ferro",                      categoria: "ORGANOLEPTICOS" },
    "sulfato":                         { sisagua: "Sulfato",                    categoria: "ORGANOLEPTICOS" },
    "sulfeto (h2s nao dissociado)":    { sisagua: "Sulfeto de hidrogênio",     categoria: "ORGANOLEPTICOS" },
    "gosto e odor":                    { sisagua: "Gosto e Odor",              categoria: "ORGANOLEPTICOS" },
    "nitrogenio amoniacal":            { sisagua: "Nitrogênio Amoniacal Total", categoria: "OUTROS" },
    "1,2-diclorobenzeno":              { sisagua: "1,2-Diclorobenzeno",        categoria: "ORGANOLEPTICOS" },
    "1,4-diclorobenzeno":              { sisagua: "1,4-Diclorobenzeno",        categoria: "ORGANOLEPTICOS" },
    "monoclorobenzeno":                { sisagua: "Monoclorobenzeno",          categoria: "ORGANOLEPTICOS" },
    // Produtos de Desinfecção
    "trihalometanos totais (thm)":     { sisagua: "Trihalometanos Total",      categoria: "PRODUTOS_DESINFECCAO" },
    "cloraminas":                      { sisagua: "Cloraminas Total",          categoria: "PRODUTOS_DESINFECCAO" },
    "acidos haloaceticos total":       { sisagua: "Ácidos Haloacéticos Total", categoria: "PRODUTOS_DESINFECCAO" },
    "2,4,6-triclorofenol":             { sisagua: "2, 4, 6 Triclorofenol",     categoria: "PRODUTOS_DESINFECCAO", convertsUgL: true },
    "2,4-diclorofenol":                { sisagua: "2, 4 Diclorofenol",         categoria: "PRODUTOS_DESINFECCAO" },
    // Radioatividade
    "radioatividade alfa global":      { sisagua: "Atividade alfa total", categoria: "RADIOATIVIDADE", regra: "Nível de triagem: 0,5 Bq/L", fonteId: "PRT888_ART37" },
    "radioatividade alfa total":       { sisagua: "Atividade alfa total", categoria: "RADIOATIVIDADE", regra: "Nível de triagem: 0,5 Bq/L", fonteId: "PRT888_ART37" },
    "atividade alfa total":            { sisagua: "Atividade alfa total", categoria: "RADIOATIVIDADE", regra: "Nível de triagem: 0,5 Bq/L", fonteId: "PRT888_ART37" },
    "radioatividade beta global":      { sisagua: "Atividade beta total", categoria: "RADIOATIVIDADE", regra: "Nível de triagem: 1 Bq/L", fonteId: "PRT888_ART37" },
    "radioatividade beta total":       { sisagua: "Atividade beta total", categoria: "RADIOATIVIDADE", regra: "Nível de triagem: 1 Bq/L", fonteId: "PRT888_ART37" },
    "atividade beta total":            { sisagua: "Atividade beta total", categoria: "RADIOATIVIDADE", regra: "Nível de triagem: 1 Bq/L", fonteId: "PRT888_ART37" },
  };

  const IGNORED_PARAMETERS = {
    "fluoreto": {
      label: "Fluoreto",
      reason: "Não disponível na categoria semestral observada; não será forçado para outro campo."
    },
    "cloro residual livre": {
      label: "Cloro Residual Livre",
      reason: "Pertence ao controle mensal e não será transferido automaticamente ao semestral."
    },
    "cloro residual total": {
      label: "Cloro Residual Total",
      reason: "Pertence ao controle mensal e não será transferido automaticamente ao semestral."
    },
    "cor aparente": {
      label: "Cor Aparente",
      reason: "Não disponível na categoria semestral observada; não será forçada para outro campo."
    },
    "clorito": {
      label: "Clorito",
      reason: "Não disponível na tela semestral observada; manter como resultado do laudo sem lançamento automático."
    },
    "clorato": {
      label: "Clorato",
      reason: "Não disponível na tela semestral observada; manter como resultado do laudo sem lançamento automático."
    },
    "bromato": {
      label: "Bromato",
      reason: "Não disponível na tela semestral observada; manter como resultado do laudo sem lançamento automático."
    }
  };
  const IGNORED = new Set(Object.keys(IGNORED_PARAMETERS));
  const sortedIgnoredKeys = [...IGNORED].sort((a, b) => b.length - a.length);

  const norm = (str) => String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u202f]/g, " ")
    .toLowerCase()
    .trim();

  // Resolve context-dependent parameters
  function resolveSynonym(normName, point) {
    if (normName === "nitrogenio amoniacal") {
      if (point === "SAIDA_TRATAMENTO") return { sisagua: "Amônia (como N)", categoria: "ORGANOLEPTICOS" };
      return { sisagua: "Nitrogênio Amoniacal Total", legalName: "Nitrogenio Amoniacal Total", categoria: "OUTROS" };
    }
    // Direct match
    if (SYNONYMS[normName]) return SYNONYMS[normName];
    return null;
  }

  // Maps normalized string index back to original string index
  const getOriginalOffset = (original, normTargetIdx) => {
    let normIdx = 0;
    let origIdx = 0;
    const origArr = [...original];
    while (origIdx < origArr.length && normIdx < normTargetIdx) {
      const char = origArr[origIdx];
      const normChar = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      normIdx += normChar.length;
      origIdx++;
    }
    return origIdx;
  };

  // Detects and ignores publication, collection and reception dates
  const isHeaderDate = (text, index) => {
    const lookback = text.substring(Math.max(0, index - 30), index);
    return /data\s+coleta|recebimento|publicacao|publicação/i.test(lookback);
  };

  // Extract analysis dates that end blocks
  const getAnalysisDates = (text) => {
    const regex = /(\d{2}\/\d{2}\/\d{4})/g;
    const dates = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!isHeaderDate(text, match.index)) {
        dates.push({
          date: match[1],
          index: match.index
        });
      }
    }
    return dates;
  };

  // Sort synonyms by descending length to prevent sub-string overlap bugs
  const sortedSynonymKeys = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);

  function parseReport(text) {
    if (typeof text !== "string") {
      throw new Error("O texto de entrada deve ser uma string.");
    }
    
    try {
    // 1. Remove cada rodapé de especificações sem descartar seções de
    // resultados posteriores do mesmo arquivo/PDF.
    const resultsPart = text.replace(
      /Especificações[\s\S]*?(?=(?:=+\s*PÁGINA\s+\d+\s*=+|Data\s+de\s+Publicação:)|$)/gi,
      ""
    );
    const lines = resultsPart.split("\n").map(l => l.trim()).filter(Boolean);

    // ── 2. Extract Header Info ──
    let amostra = "";
    let dataColeta = "";
    let pontoExtracted = "";
    let cliente = "";

    for (const line of lines) {
      if (!dataColeta) {
        const m = line.match(/Data\s+Coleta:\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (m) dataColeta = m[1];
      }
      if (!amostra) {
        const m = line.match(/\bN(?:Âº|[º°]|o\.?)?\s*Amostra:\s*([^\s-]+-\d+\/\d+\.\d+)\s*-\s*(.+)/i);
        if (m) {
          amostra = m[1];
          pontoExtracted = m[2].replace(/\(.*?\)/g, "").trim();
        }
      }
      if (!cliente) {
        const m = line.match(/Cliente:\s*(.*?)(?=\s*CNPJ\/CPF:|$)/i);
        if (m) {
          cliente = m[1].replace(/\s+/g, " ").trim();
        }
      }
    }

    const missingHeaderFields = [];
    if (!amostra) missingHeaderFields.push("Nº Amostra");
    if (!dataColeta) missingHeaderFields.push("Data Coleta");
    if (!pontoExtracted) missingHeaderFields.push("ponto da amostra");
    if (missingHeaderFields.length > 0) {
      throw new Error(
        `Cabeçalho incompleto (${missingHeaderFields.join(", ")}). ` +
        "O laudo não será classificado por suposição; copie novamente o texto completo."
      );
    }

    let ponto = "CAPTACAO_POCO";
    const normPonto = norm(pontoExtracted);
    if (
      normPonto.includes("saida do tratamento") ||
      normPonto.includes("saida de tratamento") ||
      normPonto.includes("saida tratamento")
    ) {
      ponto = "SAIDA_TRATAMENTO";
    } else if (
      normPonto.includes("ponto de consumo") ||
      normPonto.includes("consumo") ||
      normPonto.includes("torneira") ||
      normPonto.includes("refeitorio") ||
      normPonto.includes("bebedouro") ||
      normPonto.includes("rede")
    ) {
      ponto = "CONSUMO";
    }

    // ── 3. Slice Results into date-anchored Blocks ──
    const rawText = lines.join("\n");
    const datePositions = getAnalysisDates(rawText);
    const parsedParams = [];
    const unmapped = [];
    const ignored = [];

    // Regex to match value and optional unit
    const resultRegex = /(?:(<\s*|>\s*)?(\d+(?:[.,]\d+)*(?:E-?\d+)?))|(\b(ausencia|ausência|ausente|presenca|presença|presente)\b)/i;
    const unitRegex = /^(mg\/L|µg\/L|μg\/L|NTU|CU|Bq\/L|uH|μS\/cm)\b/i;

    for (let di = 0; di < datePositions.length; di++) {
      const dataAnalise = datePositions[di].date;
      const blockEnd = datePositions[di].index;
      const blockStart = di > 0 ? datePositions[di - 1].index + 10 : 0;

      const blockText = rawText.substring(blockStart, blockEnd).replace(/\n+/g, " ").trim();
      const normBlockText = norm(blockText);

      // Skip the "Soma das razões" calculations entirely
      if (normBlockText.includes("soma das razoes") || normBlockText.includes("soma das razões")) {
        continue;
      }

      // Parâmetros conhecidos que não possuem campo na tela observada não são
      // "não mapeados": ficam registrados separadamente como não lançáveis.
      let ignoredKey = null;
      let ignoredIndex = -1;
      for (const key of sortedIgnoredKeys) {
        const idx = normBlockText.indexOf(key);
        if (idx === -1) continue;
        const charBefore = idx > 0 ? normBlockText[idx - 1] : "";
        const charAfter = idx + key.length < normBlockText.length ? normBlockText[idx + key.length] : "";
        if ((!charBefore || /[^a-z0-9]/.test(charBefore)) && (!charAfter || /[^a-z0-9]/.test(charAfter))) {
          ignoredKey = key;
          ignoredIndex = idx;
          break;
        }
      }
      if (ignoredKey) {
        const origEndIndex = getOriginalOffset(blockText, ignoredIndex + ignoredKey.length);
        const match = blockText.substring(origEndIndex).trim().match(resultRegex);
        const definition = IGNORED_PARAMETERS[ignoredKey];
        ignored.push({
          originalName: definition.label,
          originalValue: match?.[0] || "",
          dataAnalise,
          reason: definition.reason
        });
        continue;
      }

      // Find the matched synonym
      let matchedKey = null;
      let matchedIndex = -1;

      for (const key of sortedSynonymKeys) {
        const idx = normBlockText.indexOf(key);
        if (idx !== -1) {
          // Word boundary checks to prevent false partial matches (e.g. descobre vs cobre)
          const charBefore = idx > 0 ? normBlockText[idx - 1] : '';
          const charAfter = idx + key.length < normBlockText.length ? normBlockText[idx + key.length] : '';
          const isBoundaryBefore = !charBefore || /[^a-z0-9]/.test(charBefore);
          const isBoundaryAfter = !charAfter || /[^a-z0-9]/.test(charAfter);
          
          if (isBoundaryBefore && isBoundaryAfter) {
            matchedKey = key;
            matchedIndex = idx;
            break;
          }
        }
      }

      if (matchedKey) {
        const mapping = resolveSynonym(matchedKey, ponto);
        if (!mapping) continue;

        // Skip ignored parameters (e.g. fluoreto)
        if (IGNORED.has(matchedKey)) continue;

        if (mapping.categoria === "OUTROS" && ponto !== "CAPTACAO_POCO") {
          const origEndIndex = getOriginalOffset(blockText, matchedIndex + matchedKey.length);
          const match = blockText.substring(origEndIndex).trim().match(resultRegex);
          ignored.push({
            originalName: mapping.sisagua,
            originalValue: match?.[0] || "",
            dataAnalise,
            reason: "O bloco Outros pertence à captação no controle semestral; o resultado não será deslocado da saída para outro ponto."
          });
          continue;
        }

        // Skip anything other than Radioatividade if point is CONSUMO
        if (ponto === "CONSUMO" && mapping.categoria !== "RADIOATIVIDADE") {
          continue;
        }

        const origEndIndex = getOriginalOffset(blockText, matchedIndex + matchedKey.length);
        const remainingText = blockText.substring(origEndIndex).trim();
        const match = remainingText.match(resultRegex);

        if (match) {
          let finalValue = "";
          let unit = "";

          const qualifier = match[1] ? match[1].trim() : "";

          if (match[3]) {
            // Qualitative
            const qual = match[3].toLowerCase();
            if (qual.startsWith("aus")) {
              finalValue = mapping.sisagua === "Gosto e Odor" ? "0" : "Ausência";
            } else {
              finalValue = "Presença";
            }
          } else {
            // Numeric: deep clean and normalize to Brazilian format
            let rawVal = match[2].replace(/[^\d.,E-]/ig, "");
            if (rawVal.includes(".") && rawVal.includes(",")) {
              rawVal = rawVal.replace(/\./g, ""); // Remove thousands separator
            } else if (rawVal.includes(".") && !rawVal.includes(",")) {
              if ((rawVal.match(/\./g) || []).length > 1) {
                rawVal = rawVal.replace(/\./g, ""); // Multiple dots = thousands
              } else {
                rawVal = rawVal.replace(/\./g, ","); // Single dot = decimal
              }
            }
            finalValue = rawVal;
          }

          // Locate optional unit immediately following the value
          const valueEndIndex = match.index + match[0].length;
          const afterValueText = remainingText.substring(valueEndIndex).trim();
          const unitMatch = afterValueText.match(unitRegex);
          if (unitMatch) {
            unit = unitMatch[1];
          }

          let finalObs = mapping.obs || "";
          const originalUnit = unit;

          // µg/L → mg/L conversion for specific parameters
          if (mapping.convertsUgL && (unit === "µg/L" || unit === "μg/L")) {
            const valNum = parseFloat(finalValue.replace(",", "."));
            if (!isNaN(valNum)) {
              finalValue = String(valNum / 1000).replace(".", ",");
              unit = "mg/L";
              finalObs = "Convertido de μg/L para mg/L. " + finalObs;
            }
          }

          const paramObj = {
            nome: mapping.sisagua,
            coleta: dataColeta,
            analise: dataAnalise,
            valor: finalValue,
            resultadoOriginal: `${qualifier ? `${qualifier} ` : ""}${match[2] || match[3]}${originalUnit ? ` ${originalUnit}` : ""}`,
            qualificador: qualifier,
            unidade: unit,
            unidadeOriginal: originalUnit
          };

          if (finalObs) paramObj.observacao = finalObs.trim();
          if (mapping.regra) paramObj.regra = mapping.regra;
          if (mapping.fonteId) paramObj.fonteId = mapping.fonteId;

          if (mapping.review) {
            paramObj._review = true;
            paramObj._reviewMsg = mapping.reviewMsg;
            if (mapping.reviewValue !== undefined) paramObj._reviewValue = mapping.reviewValue;
            if (mapping.categoria === "RADIOATIVIDADE") {
              paramObj.unidade = "Bq/L";
              paramObj.regra = mapping.reviewMsg;
              paramObj.conclusao = "Resultado abaixo do nível de triagem.";
              paramObj.observacao = matchedKey + " no laudo.";
            }
          }

          // Avoid duplicate param names per category
          if (!parsedParams.some(p => p.param.nome === mapping.sisagua && p.categoria === mapping.categoria)) {
            parsedParams.push({
              categoria: mapping.categoria,
              param: paramObj,
              originalName: matchedKey,
              originalValue: match[0]
            });
          }
        }
      } else {
        // Fallback or unmapped detection if any number followed by unit or Ausência
        const match = blockText.match(resultRegex);
        if (match) {
          const guessName = blockText.substring(0, match.index).trim();
          if (guessName.length > 2 && guessName.length < 50 && !guessName.includes(":") && !guessName.includes("/")) {
            unmapped.push({
              originalName: guessName,
              originalValue: match[0],
              dataAnalise
            });
          }
        }
      }
    }

    // ── 4. Group by Categoria and create clean SISAGUA batches ──
    const categoriesMap = {};
    parsedParams.forEach(p => {
      if (!categoriesMap[p.categoria]) categoriesMap[p.categoria] = [];
      categoriesMap[p.categoria].push(p);
    });

    const dialogTexts = {
      "INORGANICOS": "SUBSTANCIAS INORGANICAS",
      "ORGANICOS": "SUBSTANCIAS ORGANICAS",
      "AGROTOXICOS": "AGROTOXICOS",
      "OUTROS": "OUTROS",
      "PRODUTOS_DESINFECCAO": "PRODUTOS SECUNDARIOS DE DESINFECCAO",
      "RADIOATIVIDADE": "RADIOATIVIDADE",
      "ORGANOLEPTICOS": "PARAMETROS ORGANOLEPTICOS"
    };

    const titleLabel = {
      "INORGANICOS": "Inorgânicos",
      "ORGANICOS": "Orgânicos",
      "AGROTOXICOS": "Agrotóxicos",
      "OUTROS": "Outros",
      "PRODUTOS_DESINFECCAO": "Produtos de desinfecção",
      "RADIOATIVIDADE": "Radioatividade",
      "ORGANOLEPTICOS": "Organolépticos"
    };

    const pointLabels = {
      "CAPTACAO_POCO": "captação",
      "SAIDA_TRATAMENTO": "saída do tratamento",
      "CONSUMO": "consumo"
    };

    const batches = [];

    for (const [cat, params] of Object.entries(categoriesMap)) {
      const baseIdClean = amostra ? amostra.replace(/[^a-zA-Z0-9-]/g, "") : "IMPORT_DATA";
      const catTitle = titleLabel[cat] || cat;
      const pointLabel = pointLabels[ponto] || ponto;
      
      const lote = {
        id: `IMPORT-${baseIdClean}-${cat}`,
        importGroupId: `IMPORT-${baseIdClean}`,
        baseId: LEGAL_BASE_ID,
        tipo: "SEMESTRAL",
        ponto: ponto,
        categoria: cat,
        dialogText: dialogTexts[cat] || cat,
        titulo: `${catTitle} — ${pointLabel}`,
        cliente: cliente || "Laudo Importado",
        pontoIdentificacao: pontoExtracted || pointLabel,
        parametros: params.filter(p => !p.param._review || cat === "RADIOATIVIDADE").map(p => p.param),
        _mappedInfo: params.map(p => ({
          sisagua: p.param.nome,
          original: p.originalName,
          valor: p.param.valor
        }))
      };

      if (cat === "PRODUTOS_DESINFECCAO") lote.sampleCount = 1;

      if (cat === "RADIOATIVIDADE") {
        lote.requiresConfirmation = true;
        lote.confirmationReason = "Radioatividade usa nível de triagem. Confirme a identidade e unidade.";
        lote.pontoDescricao = "Ponto de consumo";
      }

      // Handle category reviews
      if (cat !== "RADIOATIVIDADE") {
        const reviews = params.filter(p => p.param._review).map(p => {
          const rev = {
            nome: p.param.nome,
            resultado: p.originalValue,
            motivo: p.param._reviewMsg,
            coleta: p.param.coleta,
            analise: p.param.analise
          };
          if (p.param._reviewValue !== undefined) rev.valorSugerido = p.param._reviewValue;
          return rev;
        });
        if (reviews.length > 0) lote.revisoes = reviews;
      }

      // Clean temp properties from params
      lote.parametros.forEach(p => {
        delete p._review;
        delete p._reviewMsg;
        delete p._reviewValue;
      });

      batches.push(lote);
    }

    return {
      header: { amostra, dataColeta, ponto: pontoExtracted || ponto, cliente },
      batches,
      unmapped,
      ignored
    };
    } catch (error) {
      throw new Error("Falha no processamento do laudo: " + error.message);
    }
  }

  return { parseReport, LEGAL_BASE_ID, SYNONYMS, IGNORED_PARAMETERS, secureVersion: 0 };
})();
