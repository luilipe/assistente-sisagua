(() => {
  "use strict";

  if (document.getElementById("sisagua-auto-panel")) return;

  const core = globalThis.SISAGUA_CORE;
  const legalBase = globalThis.SISAGUA_LEGAL_BASE;
  const parser = globalThis.SISAGUA_PARSER;
  const headerContract = globalThis.SISAGUA_HEADER_CONTRACT;
  if (
    !core
    || !legalBase
    || legalBase.status !== "USO_LOCAL_ROTINEIRO"
    || parser?.secureVersion !== 2
    || !headerContract
  ) return;
  const LEGAL_BASE_ID = legalBase.baseId;
  const EXTENSION_VERSION = globalThis.chrome?.runtime?.getManifest?.().version || "desconhecida";
  let batches = globalThis.SISAGUA_BATCHES || [];
  if (globalThis.SISAGUA_BATCH && batches.length === 0) batches = [globalThis.SISAGUA_BATCH];
  let batch = batches[0] || null;

  let stopRequested = false;
  let running = false;
  let completionAudioContext = null;
  let reviewPending = false;
  let displayedReviewItems = [];
  let preflightConfirmedBatchId = null;
  let unsavedItems = [];
  const loggedDuplicatePointScopes = new WeakSet();

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const norm = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // Aguardar AJAX verificando indicadores visuais no DOM (sem injeção de script)
  async function waitForAjax(timeout = 5000) {
    await delay(150);
    // Aguardar até que não haja indicadores de loading/processamento visíveis
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const statusBusy = [...document.querySelectorAll(".ui-ajax-status")].some(visible);
      const blocked = [...document.querySelectorAll(".ui-blockui")].some(visible);
      if (!statusBusy && !blocked) return;
      await delay(80);
    }
    throw new Error("Tempo esgotado aguardando o término da atualização do Sisagua.");
  }

  // Helper date format validation
  function isValidDateFormat(dateStr) {
    return core.isValidDateFormat(dateStr);
  }

  // O campo "Valor quantificado" do SISAGUA aceita somente o componente
  // numérico. O qualificador do laudo (< ou >) continua preservado no lote,
  // mas nunca pode ser enviado ao BigDecimal do servidor.
  function normalizeQuantifiedValue(value) {
    return core.normalizeQuantifiedValue(value);
  }

  // Lotes validation function (Task A1)
  function validateBatch(item, allBatches) {
    return core.validateBatch(item, allBatches, legalBase);
  }

  // Pre-validate all batches
  const batchValidationErrors = {};
  function recomputeBatchValidation() {
    Object.keys(batchValidationErrors).forEach((key) => delete batchValidationErrors[key]);
    batches.forEach((item) => {
      if (item?.id) batchValidationErrors[item.id] = validateBatch(item, batches);
    });
  }
  recomputeBatchValidation();

  const pointDefinitions = {
    CAPTACAO_POCO: {
      label: "ponto de captação",
      markers: ["ponto de captacao", "captacao: subterraneo", "poco artesiano"]
    },
    SAIDA_TRATAMENTO: {
      label: "saída do tratamento",
      markers: ["saida do tratamento", "saida tratamento"]
    },
    CONSUMO: {
      label: "ponto de consumo",
      markers: ["ponto de consumo", "consumo"]
    }
  };

  const categoryLabels = {
    INORGANICOS: "substancias inorganicas",
    ORGANICOS: "substancias organicas",
    AGROTOXICOS: "agrotoxicos",
    OUTROS: "outros",
    PRODUTOS_DESINFECCAO: "produtos secundarios de desinfeccao",
    RADIOATIVIDADE: "radioatividade",
    ORGANOLEPTICOS: "parametros organolepticos"
  };

  function prepareCompletionSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!completionAudioContext) completionAudioContext = new AudioContextClass();
      if (completionAudioContext.state === "suspended") completionAudioContext.resume().catch(() => {});
      return completionAudioContext;
    } catch {
      return null;
    }
  }

  function playCompletionSound() {
    const context = prepareCompletionSound();
    if (!context) return;
    const startAt = context.currentTime + 0.03;
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = startAt + (index * 0.2);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, toneStart);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.13, toneStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.17);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + 0.18);
    });
  }

  let timerInterval = null;
  let secondsElapsed = 0;

  function startTimer() {
    stopTimer();
    secondsElapsed = 0;
    timerElement.textContent = "00:00";
    timerInterval = setInterval(() => {
      secondsElapsed++;
      const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
      const secs = String(secondsElapsed % 60).padStart(2, "0");
      timerElement.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopTimer(persist = false) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (persist && secondsElapsed > 0) {
      const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
      const secs = String(secondsElapsed % 60).padStart(2, "0");
      log(`⏱ Tempo total de execução: ${mins}:${secs}`);
    }
  }

  const visible = (element) => {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  };

  async function waitFor(predicate, timeout = 10000, interval = 120, label = "condição") {
    const started = Date.now();
    let lastError;
    while (Date.now() - started < timeout) {
      try {
        const value = predicate();
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await delay(interval);
    }
    throw lastError || new Error(`Tempo esgotado aguardando: ${label}`);
  }

  function getDialog(ctx) {
    const dialogText = ctx.dialogText || "AGROTOXICOS";
    const matches = [...document.querySelectorAll(".ui-dialog")]
      .filter((dialog) => visible(dialog) && norm(dialog.textContent).includes(norm(dialogText)));
    if (matches.length > 1) throw new Error(`Mais de uma janela corresponde a ${dialogText}.`);
    return matches[0] || null;
  }

  function pointDefinition(ctx) {
    return pointDefinitions[ctx.ponto] || { label: ctx.ponto, markers: [] };
  }

  function matchesPoint(element, definition) {
    const text = norm(element?.textContent);
    return definition.markers.some((marker) => text.includes(marker));
  }

  const pointMarkerSelector = ".ui-accordion-header, [role='tab'], h3, h4, label, legend, strong";
  const clickablePointSelector = ".ui-accordion-header, [role='tab'], h3, h4";

  function pointMarkers(container, ctx) {
    return [...container.querySelectorAll(pointMarkerSelector)]
      .filter((element) => matchesPoint(element, pointDefinition(ctx)));
  }

  function parameterHeaders(ctx) {
    const dialog = getDialog(ctx);
    if (!dialog) return [];
    const allPointMarkers = Object.values(pointDefinitions).flatMap((definition) => definition.markers);
    return [...dialog.querySelectorAll(".ui-accordion-header")]
      .filter((header) => {
        const text = norm(header.textContent);
        return !allPointMarkers.some((marker) => text.includes(marker));
      });
  }

  function parameterNameFromHeader(header) {
    return headerContract.parameterNameFromText(header?.textContent || "");
  }

  function resolveHeader(name, ctx) {
    return headerContract.resolve(name, parameterHeaders(ctx));
  }

  function findHeader(name, ctx) {
    const resolution = resolveHeader(name, ctx);
    if (resolution.status === "AMBIGUOUS") {
      log(`⚠ Cabeçalho ambíguo para '${name}': ${resolution.matches.join(" | ")}.`);
      throw new Error(
        `Mais de um cabeçalho corresponde a "${name}" em ${ctx.titulo || ctx.categoria}: `
        + `${resolution.matches.join(" | ")}.`
      );
    }
    return resolution.header;
  }

  function headerResolutionFailure(items, ctx) {
    const failures = items
      .map((item) => ({ item, resolution: resolveHeader(item.nome, ctx) }))
      .filter(({ resolution }) => resolution.status !== "RESOLVED");
    if (!failures.length) return null;

    const missing = failures
      .filter(({ resolution }) => resolution.status === "MISSING")
      .map(({ item }) => `"${item.nome}"`);
    const ambiguous = failures
      .filter(({ resolution }) => resolution.status === "AMBIGUOUS")
      .map(({ item, resolution }) => `"${item.nome}" → ${resolution.matches.join(" | ")}`);
    const available = parameterHeaders(ctx).map(parameterNameFromHeader).filter(Boolean);
    return {
      missing,
      ambiguous,
      available,
      message: [
        missing.length ? `não encontrado(s): ${missing.join(", ")}` : "",
        ambiguous.length ? `ambíguo(s): ${ambiguous.join("; ")}` : "",
      ].filter(Boolean).join("; "),
    };
  }

  function preflightParameterHeaders(items, ctx, actionLabel = "parâmetros automáticos") {
    const actionable = items.filter((item) => item?.nome);
    const failure = headerResolutionFailure(actionable, ctx);
    if (failure) {
      log(`✗ PREFLIGHT ${actionLabel}: ${failure.message}.`);
      log(`  Cabeçalhos disponíveis (${failure.available.length}): ${failure.available.join(" | ")}.`);
      throw new Error(
        `Preflight de cabeçalhos falhou em ${ctx.titulo || ctx.categoria}: ${failure.message}. `
        + "Nenhum campo foi alterado."
      );
    }

    const resolutions = actionable.map((item) => ({ item, resolution: resolveHeader(item.nome, ctx) }));
    resolutions
      .filter(({ resolution }) => resolution.mode !== "EXACT")
      .forEach(({ item, resolution }) => {
        log(`↳ Cabeçalho resolvido por ${resolution.mode}: ${item.nome} → ${resolution.screenName}.`);
      });
    log(`✓ PREFLIGHT: ${resolutions.length}/${resolutions.length} cabeçalho(s) de ${actionLabel} resolvido(s) sem alterar campos.`);
    return resolutions;
  }

  function statusFor(name, ctx) {
    const header = findHeader(name, ctx);
    const match = header?.textContent?.match(/Status:\s*([SN])/i);
    return match?.[1]?.toUpperCase() || "?";
  }

  function contentAfter(header) {
    let node = header?.nextElementSibling;
    while (node && !node.classList.contains("ui-accordion-content")) node = node.nextElementSibling;
    return node;
  }

  function pointScopeForMarker(marker, parameterContent) {
    if (!marker) return null;
    const accordionContent = contentAfter(marker);
    if (accordionContent?.querySelector('[id$="dataColeta_input"]')) return accordionContent;

    let candidate = marker.parentElement;
    while (candidate && candidate !== parameterContent.parentElement) {
      const collections = candidate.querySelectorAll('[id$="dataColeta_input"]');
      const analyses = candidate.querySelectorAll('[id$="dataAnalise_input"]');
      const results = candidate.querySelectorAll('[id$="campoResultado"]');
      if (collections.length === 1 && analyses.length === 1 && results.length === 1) {
        return candidate;
      }
      if (candidate === parameterContent) break;
      candidate = candidate.parentElement;
    }
    return null;
  }

  function uniqueFieldsInScope(scope) {
    if (!scope) return null;
    const collections = [...scope.querySelectorAll('[id$="dataColeta_input"]')];
    const analyses = [...scope.querySelectorAll('[id$="dataAnalise_input"]')];
    const results = [...scope.querySelectorAll('[id$="campoResultado"]')];
    if (collections.length !== 1 || analyses.length !== 1 || results.length !== 1) return null;
    return {
      coleta: collections[0],
      analise: analyses[0],
      resultado: results[0],
    };
  }

  function sameFieldSet(candidate, fields) {
    return candidate.coleta === fields.coleta
      && candidate.analise === fields.analise
      && candidate.resultado === fields.resultado;
  }

  function markerTexts(markers) {
    return [...new Set(markers
      .map((marker) => String(marker.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean))];
  }

  function preferredPointHeader(markers) {
    return markers.find((marker) => marker.matches(clickablePointSelector)) || markers[0] || null;
  }

  function pointIdentityMatches(candidate, ctx) {
    const identity = norm(ctx.pontoIdentificacao);
    if (!identity) return false;
    return candidate.texts.some((text) => norm(text).includes(identity));
  }

  function pointAmbiguityError(candidates, ctx) {
    const details = candidates
      .map((candidate, index) => `[${index + 1}] ${candidate.texts.join(" / ") || "rótulo sem texto"}`)
      .join("; ");
    const error = new Error(
      `Foram encontrados ${candidates.length} conjuntos distintos de campos para ${pointDefinition(ctx).label}`
      + `${ctx.pontoIdentificacao ? ` (ponto do laudo: ${ctx.pontoIdentificacao})` : ""}. `
      + `A extensão não escolheu automaticamente. Candidatos: ${details}.`
    );
    error.code = "AMBIGUIDADE_ENTRE_PONTOS";
    return error;
  }

  function selectPointCandidate(candidates, ctx) {
    if (candidates.length <= 1) return candidates[0] || null;
    const identityMatches = candidates.filter((candidate) => pointIdentityMatches(candidate, ctx));
    if (identityMatches.length === 1) return identityMatches[0];
    throw pointAmbiguityError(candidates, ctx);
  }

  function resolveExpectedPoint(container, ctx) {
    const markers = pointMarkers(container, ctx);
    const candidates = [];

    markers.forEach((marker) => {
      const scope = pointScopeForMarker(marker, container);
      const fields = uniqueFieldsInScope(scope);
      if (!fields) return;

      let candidate = candidates.find((item) => sameFieldSet(item, fields));
      if (!candidate) {
        candidate = { ...fields, scope, markers: [] };
        candidates.push(candidate);
      } else if (candidate.scope?.contains(scope) && candidate.scope !== scope) {
        candidate.scope = scope;
      }
      candidate.markers.push(marker);
    });

    candidates.forEach((candidate) => {
      candidate.texts = markerTexts(candidate.markers);
      candidate.pointHeader = preferredPointHeader(candidate.markers);
    });

    const selected = selectPointCandidate(candidates, ctx);
    if (selected) {
      if (selected.markers.length > 1 && !loggedDuplicatePointScopes.has(selected.scope)) {
        loggedDuplicatePointScopes.add(selected.scope);
        log(
          `↳ ${pointDefinition(ctx).label}: ${selected.markers.length} rótulos equivalentes `
          + "apontam para o mesmo conjunto de campos; usando um único destino."
        );
      }
      return selected;
    }

    const clickableMarkers = markers.filter((marker) => marker.matches(clickablePointSelector));
    const markerCandidates = clickableMarkers.map((marker) => ({
      pointHeader: marker,
      scope: null,
      markers: [marker],
      texts: markerTexts([marker]),
    }));
    return selectPointCandidate(markerCandidates, ctx);
  }

  function fieldsForContent(content, ctx) {
    if (!content) return null;
    const resolvedPoint = resolveExpectedPoint(content, ctx);
    const pointHeader = resolvedPoint?.pointHeader || null;
    const pointContent = resolvedPoint?.scope || null;
    const radioactivitySingleSet = !pointHeader
      && ctx.categoria === "RADIOATIVIDADE"
      && ctx.ponto === "CONSUMO";
    const unscopedCollections = [...content.querySelectorAll('[id$="dataColeta_input"]')];
    const unscopedAnalyses = [...content.querySelectorAll('[id$="dataAnalise_input"]')];
    const unscopedResults = [...content.querySelectorAll('[id$="campoResultado"]')];
    const uniqueUnscopedFields = radioactivitySingleSet
      && unscopedCollections.length === 1
      && unscopedAnalyses.length === 1
      && unscopedResults.length === 1;
    const scopedContent = pointContent || (uniqueUnscopedFields ? content : null);
    const collections = resolvedPoint?.coleta
      ? [resolvedPoint.coleta]
      : (scopedContent ? [...scopedContent.querySelectorAll('[id$="dataColeta_input"]')] : []);
    const analyses = resolvedPoint?.analise
      ? [resolvedPoint.analise]
      : (scopedContent ? [...scopedContent.querySelectorAll('[id$="dataAnalise_input"]')] : []);
    const results = resolvedPoint?.resultado
      ? [resolvedPoint.resultado]
      : (scopedContent ? [...scopedContent.querySelectorAll('[id$="campoResultado"]')] : []);
    const uniqueScopedFields = collections.length === 1
      && analyses.length === 1
      && results.length === 1;
    const index = uniqueScopedFields ? 0 : -1;
    return {
      coleta: collections[index],
      analise: analyses[index],
      resultado: results[index],
      pointHeader,
      pointContent: scopedContent,
      pointEvidence: pointHeader
        ? (resolvedPoint.markers.length > 1 ? "ROTULO_DUPLICADO_MESMO_PONTO" : "MARCADOR_SEMANTICO")
        : (uniqueUnscopedFields ? "RADIOATIVIDADE_CONJUNTO_UNICO" : ""),
    };
  }

  async function ensureSampleCount(name, content, ctx, allowMutation = true) {
    if (!ctx.sampleCount) return content;
    const target = String(ctx.sampleCount);
    const select = content.querySelector('[id$="numeroAmostraTipoPontoColeta_input"]');
    if (!select) throw new Error(`Número de amostras não encontrado em ${name}.`);
    if (select.value !== target) {
      if (!allowMutation) {
        throw new Error(
          `${name}: número de amostras '${select.value || "não informado"}' `
          + `diverge do lote '${target}'.`
        );
      }
      log(`  ${name}: definindo número de amostras como ${target}...`);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(select, target);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForAjax();
      await delay(200);
      await waitFor(() => {
        const currentHeader = findHeader(name, ctx);
        const currentContent = contentAfter(currentHeader);
        const currentSelect = currentContent?.querySelector('[id$="numeroAmostraTipoPontoColeta_input"]');
        return currentSelect?.value === target ? currentContent : null;
      }, 8000, 120, `atualização do número de amostras de "${name}"`);
    }
    const freshHeader = findHeader(name, ctx);
    return contentAfter(freshHeader);
  }

  async function ensureFields(name, ctx, options = {}) {
    const allowSampleCountMutation = options.allowSampleCountMutation !== false;
    let header = await waitFor(
      () => findHeader(name, ctx),
      10000,
      120,
      `cabeçalho "${name}" em ${ctx.titulo || ctx.categoria}`
    );
    let content = contentAfter(header);

    if (!content || !visible(content)) {
      header.click();
      await delay(250);
      header = await waitFor(
        () => findHeader(name, ctx),
        10000,
        120,
        `cabeçalho "${name}" após abrir o parâmetro`
      );
      content = await waitFor(() => {
        const candidate = contentAfter(header);
        return visible(candidate) ? candidate : null;
      }, 10000, 120, `conteúdo visível de "${name}"`);
    }

    content = await ensureSampleCount(name, content, ctx, allowSampleCountMutation);

    let selectedFields = fieldsForContent(content, ctx);
    let collection = selectedFields?.coleta;
    if (!collection || !visible(collection) || !selectedFields?.pointEvidence) {
      let pointHeader;
      try {
        pointHeader = await waitFor(() => {
          const currentHeader = findHeader(name, ctx);
          const currentContent = contentAfter(currentHeader);
          return currentContent ? resolveExpectedPoint(currentContent, ctx)?.pointHeader : null;
        }, 6000, 120, `${pointDefinition(ctx).label} em "${name}"`);
      } catch {
        throw new Error(
          `${pointDefinition(ctx).label} não encontrado após abrir ${name}. ` +
          `Verifique se a categoria foi aberta no bloco correto.`
        );
      }
      const clickablePointMarker = pointHeader.matches(".ui-accordion-header, [role='tab'], h3, h4");
      if (!clickablePointMarker) {
        throw new Error(
          `${pointDefinition(ctx).label} foi identificado em ${name}, mas seus campos não foram encontrados sem ambiguidade.`
        );
      }
      pointHeader.click();
      await delay(250);
    }

    return waitFor(() => {
      const freshHeader = findHeader(name, ctx);
      const freshContent = contentAfter(freshHeader);
      const fields = fieldsForContent(freshContent, ctx);
      const coleta = fields?.coleta;
      const analise = fields?.analise;
      const resultado = fields?.resultado;
      if (
        fields?.pointEvidence
        && (
          !fields.pointHeader
          || matchesPoint(fields.pointHeader, pointDefinition(ctx))
        )
        && visible(coleta)
        && visible(analise)
        && visible(resultado)
      ) {
        return {
          header: freshHeader,
          content: freshContent,
          coleta,
          analise,
          resultado,
          pointHeader: fields.pointHeader,
          pointContent: fields.pointContent,
          pointEvidence: fields.pointEvidence,
        };
      }
      return null;
    }, 10000, 120, `campos de ${pointDefinition(ctx).label} em "${name}"`);
  }

  const monthIndex = new Map([
    ["janeiro", 0], ["fevereiro", 1], ["marco", 2], ["abril", 3],
    ["maio", 4], ["junho", 5], ["julho", 6], ["agosto", 7],
    ["setembro", 8], ["outubro", 9], ["novembro", 10], ["dezembro", 11]
  ]);

  function parseDate(value) {
    const [day, month, year] = value.split("/").map(Number);
    return { day, month: month - 1, year };
  }

  function visiblePicker() {
    const picker = document.querySelector("#ui-datepicker-div");
    return visible(picker) ? picker : null;
  }

  function pickerMonth(picker) {
    const monthText = norm(picker.querySelector(".ui-datepicker-month")?.textContent);
    const year = Number(picker.querySelector(".ui-datepicker-year")?.textContent);
    return { month: monthIndex.get(monthText), year };
  }

  async function chooseDate(input, dateText) {
    const target = parseDate(dateText);
    const inputId = input.id;
    input.focus();
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    input.click();

    let picker;
    try {
      picker = await waitFor(visiblePicker, 2500);
    } catch {
      input.dispatchEvent(new KeyboardEvent("keypress", { key: "0", bubbles: true }));
      setText(input, dateText);
      await delay(700);
      await waitFor(() => {
        const fresh = document.getElementById(inputId);
        return fresh?.value === dateText;
      }, 5000, 120, `preenchimento direto da data ${dateText}`);
      return;
    }

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const current = pickerMonth(picker);
      if (current.month === target.month && current.year === target.year) break;
      const currentNumber = current.year * 12 + current.month;
      const targetNumber = target.year * 12 + target.month;
      showTransientMsg(`Navegando no calendário para ${dateText}...`);
      const control = picker.querySelector(currentNumber > targetNumber ? ".ui-datepicker-prev" : ".ui-datepicker-next");
      if (!control) throw new Error(`Não foi possível navegar até ${dateText}.`);
      control.click();
      await delay(120);
      const newMonth = pickerMonth(picker);
      if (newMonth.month === current.month && newMonth.year === current.year) {
        throw new Error(`Calendário travado ao tentar navegar para ${dateText}.`);
      }
    }
    const reached = pickerMonth(picker);
    if (reached.month !== target.month || reached.year !== target.year) {
      throw new Error(`O calendário não alcançou o mês/ano de ${dateText}.`);
    }
    showTransientMsg("");

    const dayLink = [...picker.querySelectorAll("td:not(.ui-datepicker-other-month) a")]
      .find((link) => Number(link.textContent.trim()) === target.day);
    if (!dayLink) throw new Error(`Dia ${dateText} não encontrado no calendário.`);
    dayLink.click();
    await delay(300);

    // Se o calendário ainda estiver aberto, fechar explicitamente
    const stillOpen = visiblePicker();
    if (stillOpen) {
      const inp = document.getElementById(inputId);
      if (inp) {
        inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", keyCode: 27, bubbles: true }));
      }
      await delay(300);
    }

    // Verificar se o valor foi preenchido
    let freshInput = document.getElementById(inputId);
    if (!freshInput || freshInput.value !== dateText) {
      // Fallback: setar valor diretamente se o clique no calendário não funcionou
      if (freshInput) {
        setText(freshInput, dateText);
        await delay(400);
      }
    }

    // Garantir eventos para PrimeFaces processar a mudança
    freshInput = document.getElementById(inputId);
    if (freshInput) {
      freshInput.dispatchEvent(new Event("change", { bubbles: true }));
      freshInput.blur();
    }

    await waitFor(() => {
      const fresh = document.getElementById(inputId);
      return fresh?.value === dateText;
    }, 5000, 120, `confirmação da data ${dateText}`);
  }

  function showTransientMsg(msg) {
    const el = document.getElementById("sisagua-auto-transient-msg");
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? "block" : "none";
    }
  }

  function setText(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }

  function validateButton(content) {
    return [...content.querySelectorAll("button, input[type=button]")]
      .find((button) => norm(button.textContent || button.value) === "validar");
  }

  async function processParameter(item, ctx, verifiedExisting = new Set()) {
    if (statusFor(item.nome, ctx) === "S") {
      if (!verifiedExisting.has(core.identityKey(item.nome))) {
        await verifyExistingValidated(item, ctx);
      }
      return false;
    }

    log(`→ ${item.nome}: abrindo...`);
    let fields = await ensureFields(item.nome, ctx);
    
    const previousActive = document.querySelector(".sisagua-active-row");
    if (previousActive) previousActive.classList.remove("sisagua-active-row");
    const rowToHighlight = fields.content ? (fields.content.closest("tr") || fields.header) : null;
    if (rowToHighlight) rowToHighlight.classList.add("sisagua-active-row");

    log(`  ${item.nome}: preenchendo coleta ${item.coleta}...`);
    await chooseDate(fields.coleta, item.coleta);
    await waitForAjax();

    fields = await ensureFields(item.nome, ctx);
    log(`  ${item.nome}: aguardando campo de análise...`);
    await waitFor(() => {
      const currentHeader = findHeader(item.nome, ctx);
      const currentContent = contentAfter(currentHeader);
       const currentAnalysis = fieldsForContent(currentContent, ctx)?.analise;
      return visible(currentAnalysis)
        && !currentAnalysis.disabled
        && !currentAnalysis.classList.contains("ui-state-disabled")
        ? currentAnalysis
        : null;
    }, 10000, 120, `campo de análise de "${item.nome}"`);
    fields = await ensureFields(item.nome, ctx);
    log(`  ${item.nome}: preenchendo análise ${item.analise}...`);
    await chooseDate(fields.analise, item.analise);

    fields = await ensureFields(item.nome, ctx);
    const quantified = normalizeQuantifiedValue(item.valor);
    if (!quantified) {
      throw new Error(
        `${item.nome}: valor quantificado '${item.valor}' inválido. ` +
        "O SISAGUA aceita somente o componente numérico."
      );
    }
    if (quantified.qualifier) {
      log(
        `  ${item.nome}: preservando '${quantified.qualifier}' no resultado original ` +
        `e preenchendo somente ${quantified.value} no valor quantificado...`
      );
    } else {
      log(`  ${item.nome}: preenchendo valor ${quantified.value}...`);
    }
    setText(fields.resultado, quantified.value);
    await delay(150);

    const fieldValue = normalizeQuantifiedValue(fields.resultado.value);
    if (!fieldValue || fieldValue.qualifier || fieldValue.value !== quantified.value) {
      throw new Error(
        `${item.nome}: o campo numérico ficou com valor inválido '${fields.resultado.value}'. ` +
        "A validação foi interrompida antes do envio ao servidor."
      );
    }

    const validate = validateButton(fields.content);
    if (!validate) throw new Error(`Botão VALIDAR não encontrado em ${item.nome}.`);
    validate.click();

    await waitFor(
      () => statusFor(item.nome, ctx) === "S",
      12000,
      120,
      `Status S de "${item.nome}" após VALIDAR`
    );
    if (rowToHighlight) rowToHighlight.classList.remove("sisagua-active-row");
    log(`✓ ${item.nome}: ${item.coleta} | ${item.analise} | ${item.valor}`);
    return true;
  }

  // System messages collector. O PrimeFaces varia as classes conforme o tipo
  // da mensagem e pode reutilizar o mesmo growl alterando apenas sua classe.
  const systemMessageSelector = [
    ".ui-growl-message",
    ".ui-growl-title",
    ".ui-messages-detail",
    ".ui-messages-summary",
    ".ui-messages-info-detail",
    ".ui-messages-info-summary",
    ".ui-messages-warn-detail",
    ".ui-messages-warn-summary",
    ".ui-messages-error-detail",
    ".ui-messages-error-summary",
    ".ui-messages-fatal-detail",
    ".ui-messages-fatal-summary",
    ".ui-message-info-detail",
    ".ui-message-warn-detail",
    ".ui-message-error-detail",
    ".ui-message-fatal-detail",
  ].join(", ");

  function getSystemMessagesText() {
    return getSystemMessageElements()
      .map(el => norm(el.textContent));
  }

  function getSystemMessageElements() {
    return [...document.querySelectorAll(systemMessageSelector)]
      .filter((element) => visible(element));
  }

  // Safe numerical comparison helper (Task A5)
  function compareValuesSafe(val1, val2) {
    const parsed1 = normalizeQuantifiedValue(val1);
    const parsed2 = normalizeQuantifiedValue(val2);
    if (!parsed1 || !parsed2) return false;
    const n1 = parsed1.value.replace(",", ".");
    const n2 = parsed2.value.replace(",", ".");
    if (n1 === n2) return true;
    
    const num1 = Number(n1);
    const num2 = Number(n2);
    if (!isNaN(num1) && !isNaN(num2)) {
      return num1 === num2;
    }
    return false;
  }

  function itemScreenDiscrepancies(item, fields, ctx) {
    const discrepancies = [];
    const currentStatus = statusFor(item.nome, ctx);
    if (currentStatus !== "S") {
      discrepancies.push(`Status na tela é '${currentStatus}' (esperava 'S')`);
    }

    const coletaVal = fields.coleta.value?.trim();
    if (coletaVal !== item.coleta) {
      discrepancies.push(`Data de coleta '${coletaVal}' diverge do lote '${item.coleta}'`);
    }

    const analiseVal = fields.analise.value?.trim();
    if (analiseVal !== item.analise) {
      discrepancies.push(`Data de análise '${analiseVal}' diverge do lote '${item.analise}'`);
    }

    const resultadoVal = fields.resultado.value?.trim();
    if (!compareValuesSafe(resultadoVal, item.valor)) {
      discrepancies.push(`Valor quantificado '${resultadoVal}' diverge do lote '${item.valor}'`);
    }

    const screenUnit = headerContract.unitFromText(fields.header?.textContent || "");
    if (screenUnit && item.unidade && !headerContract.unitsEquivalent(screenUnit, item.unidade)) {
      discrepancies.push(`Unidade da tela '${screenUnit}' diverge do lote '${item.unidade}'`);
    }

    if (
      !fields.pointEvidence
      || (fields.pointHeader && !matchesPoint(fields.pointHeader, pointDefinition(ctx)))
    ) {
      discrepancies.push(`Ponto '${pointDefinition(ctx).label}' não foi confirmado`);
    }

    return discrepancies;
  }

  async function verifyExistingValidated(item, ctx) {
    const fields = await ensureFields(item.nome, ctx, { allowSampleCountMutation: false });
    const discrepancies = itemScreenDiscrepancies(item, fields, ctx);
    if (discrepancies.length) {
      throw new Error(
        `${item.nome}: o Status S existente diverge do lote: ${discrepancies.join("; ")}. `
        + "Nenhum campo novo foi alterado."
      );
    }
    log(`✓ ${item.nome}: Status S auditado (ponto, datas, valor e unidade conferidos).`);
  }

  async function preflightExistingValidated(items, ctx) {
    const verified = new Set();
    const alreadyValidated = items.filter((item) => statusFor(item.nome, ctx) === "S");
    for (const item of alreadyValidated) {
      await verifyExistingValidated(item, ctx);
      verified.add(core.identityKey(item.nome));
    }
    if (alreadyValidated.length) {
      log(`✓ PREFLIGHT: ${alreadyValidated.length} item(ns) com Status S conferido(s) antes de novos preenchimentos.`);
    }
    return verified;
  }

  // Deep Audit function (Task A5)
  async function auditDeep(items, ctx) {
    log(`🔍 Iniciando auditoria profunda de ${items.length} parâmetro(s)...`);
    const discrepancies = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const pIdx = ctx.parametros.findIndex(p => p.nome === item.nome);
      if (pIdx !== -1) {
        updateBadgeState(pIdx, "running", item.nome);
      }
      updateProgressBar(index + 1, items.length, "Auditando");
      
      try {
        log(`  Auditando: ${item.nome}...`);
        const fields = await ensureFields(item.nome, ctx);
        const itemDiscrepancies = itemScreenDiscrepancies(item, fields, ctx);
        if (itemDiscrepancies.length) {
          itemDiscrepancies.forEach((message) => discrepancies.push(`${item.nome}: ${message}`));
          if (pIdx !== -1) updateBadgeState(pIdx, "danger", item.nome);
          continue;
        }
        
        log(`  ✓ ${item.nome}: auditado com sucesso (ponto, datas, valor, unidade e status S ok).`);
        if (pIdx !== -1) {
          updateBadgeState(pIdx, "audited", item.nome, 
            `${item.nome}\nColeta: ${item.coleta}\nAnálise: ${item.analise}\nValor: ${item.valor}\n(Auditado)`);
        }
      } catch (err) {
        discrepancies.push(`${item.nome}: Falha durante leitura na auditoria (${err.message})`);
        if (pIdx !== -1) updateBadgeState(pIdx, "danger", item.nome);
      }
    }
    
    if (discrepancies.length > 0) {
      log(`✗ Auditoria falhou com ${discrepancies.length} divergência(s):\n` + discrepancies.map(d => `  - ${d}`).join("\n"));
      throw new Error(`Auditoria pós-persistência falhou.`);
    }
    log("✓ Auditoria profunda concluída com sucesso para todos os itens.");
  }

  // Reopen row logic matching block and point (Task A7)
  function alterCategoryButton(ctx) {
    const expectedCategory = categoryLabels[ctx.categoria] || norm(ctx.categoria);
    const pointDef = pointDefinitions[ctx.ponto] || { label: ctx.ponto, markers: [] };

    function monitoringBlockForRow(row) {
      const blockLabels = [...document.querySelectorAll("strong, label, span, div")]
        .filter((element) => visible(element))
        .map((element) => ({ element, text: norm(element.textContent) }))
        .filter(({ text }) => (
          text === "monitoramento da qualidade da agua no ponto de captacao"
          || text === "monitoramento da qualidade da agua da sac"
        ))
        .filter(({ element }) => (
          element.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING
        ));
      const nearest = blockLabels.length ? blockLabels[blockLabels.length - 1].text : "";
      if (nearest.includes("ponto de captacao")) return "CAPTACAO_POCO";
      if (nearest.includes("agua da sac")) return "SAC";
      return "";
    }
    
    const rows = [...document.querySelectorAll("tr")]
      .filter((row) => visible(row) && norm(row.textContent).includes(norm(expectedCategory)))
      .filter((row) => [...row.querySelectorAll("button")].some((btn) => norm(btn.title) === "alterar"));
      
    const matchingRows = rows.filter(row => {
      const rowText = norm(row.textContent);
      const monitoringBlock = monitoringBlockForRow(row);
      if (monitoringBlock) {
        return ctx.ponto === "CAPTACAO_POCO"
          ? monitoringBlock === "CAPTACAO_POCO"
          : monitoringBlock === "SAC";
      }
      const pointIdentity = norm(ctx.pontoIdentificacao);
      const pointMatch = (pointIdentity && rowText.includes(pointIdentity))
        || pointDef.markers.some(marker => rowText.includes(marker));
      const blockMatch = ctx.ponto === "CAPTACAO_POCO" 
        ? rowText.includes("captacao") 
        : (rowText.includes("sac") || rowText.includes("saida") || rowText.includes("consumo") || rowText.includes("tratamento"));
        
      return pointMatch && blockMatch;
    });
    
    if (matchingRows.length === 0) {
      log(`✗ Nenhuma linha correspondente encontrada para categoria ${ctx.categoria} e ponto ${ctx.ponto}.`);
      return null;
    }
    if (matchingRows.length > 1) {
      log(`✗ Ambiguidade detectada: ${matchingRows.length} linhas correspondem à categoria ${ctx.categoria} e ponto ${ctx.ponto}.`);
      return null;
    }
    
    const row = matchingRows[0];
    return [...row.querySelectorAll("button")].find((btn) => norm(btn.title) === "alterar");
  }

  async function reopenCategory(ctx) {
    const alter = await waitFor(
      () => alterCategoryButton(ctx),
      15000,
      120,
      `botão Alterar de ${ctx.titulo || ctx.categoria}`
    );
    if (!alter) throw new Error("Botão de reabertura de categoria não disponível ou ambíguo.");
    alter.click();
    await waitFor(
      () => getDialog(ctx),
      20000,
      120,
      `reabertura da janela ${ctx.titulo || ctx.categoria}`
    );
  }

  function categorySaveButton(dialog) {
    return [...dialog.querySelectorAll("button, input[type=button], input[type=submit]")]
      .find((button) => norm(button.textContent || button.value || button.title) === "salvar");
  }

  function createSuccessObserver() {
    const successText = "registro alterado com sucesso";
    let observed = false;
    const isSuccess = (element) => element && norm(element.textContent).includes(successText);
    const inspectNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement?.closest(systemMessageSelector);
        if (isSuccess(parent)) observed = true;
        return;
      }
      if (!(node instanceof Element)) return;
      if (node.matches(systemMessageSelector) && isSuccess(node)) observed = true;
      node.querySelectorAll?.(systemMessageSelector).forEach((element) => {
        if (isSuccess(element)) observed = true;
      });
      const parent = node.closest(systemMessageSelector);
      if (isSuccess(parent)) observed = true;
    };
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        inspectNode(mutation.target);
        mutation.addedNodes.forEach(inspectNode);
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"],
    });
    return {
      wasObserved: () => observed,
      disconnect: () => observer.disconnect(),
    };
  }

  async function saveOpenCategory(ctx, items, reason = "progresso") {
    const dialog = getDialog(ctx);
    if (!dialog) throw new Error("A janela da categoria não está aberta para salvar.");
    const saveButton = categorySaveButton(dialog);
    if (!saveButton || saveButton.disabled) throw new Error("Botão SALVAR não encontrado ou desabilitado.");

    const observer = createSuccessObserver();
    try {
      log(`↻ Salvando ${reason} (${items.length} item(ns))...`);
      saveButton.click();
      try {
        await waitFor(() => observer.wasObserved(), 45000, 120, "mensagem oficial de salvamento");
      } catch {
        const messages = [...new Set(getSystemMessageElements()
          .map((element) => String(element.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean))];
        const dialogState = getDialog(ctx) ? "a janela permanece aberta" : "a janela foi fechada";
        throw new Error(
          `Salvamento não confirmado pela mensagem oficial; ${dialogState}. `
          + (messages.length
            ? `Mensagens visíveis: ${messages.join(" | ")}.`
            : "Nenhuma mensagem do Sisagua permaneceu visível.")
        );
      }
      log("✓ Mensagem oficial nova confirmada: Registro alterado com sucesso.");
      await waitFor(() => !getDialog(ctx), 20000, 120, "fechamento da janela após salvamento");
      log("✓ Janela fechada após a confirmação oficial.");
      const savedNames = new Set(items.map((item) => item.nome));
      unsavedItems = unsavedItems.filter((item) => !savedNames.has(item.nome));
    } finally {
      observer.disconnect();
    }
  }

  async function saveReopenAndAudit(items, ctx, reason = "categoria") {
    await saveOpenCategory(ctx, items, reason);
    await reopenCategory(ctx);
    const expectedParameter = items[0]?.nome || ctx.parametros[0]?.nome;
    if (expectedParameter && !findHeader(expectedParameter, ctx)) {
      throw new Error(`A categoria reaberta não contém ${expectedParameter}.`);
    }
    await auditDeep(items, ctx);
    const liveBatch = batches.find((item) => item.id === ctx.id);
    if (liveBatch) {
      const auditedAt = new Date().toISOString();
      items.forEach((auditedItem) => {
        const parameter = liveBatch.parametros?.find((item) => item.nome === auditedItem.nome);
        if (parameter) {
          parameter.statusSisagua = "SALVO_AUDITADO";
          parameter.auditadoEm = auditedAt;
        }
        const review = liveBatch.revisoes?.find((item) => item.nome === auditedItem.nome);
        if (review) {
          review.statusSisagua = "SALVO_AUDITADO";
          review.valorConfirmado = auditedItem.valor;
          review.auditadoEm = auditedAt;
        }
      });
      liveBatch.auditTrail = Array.isArray(liveBatch.auditTrail) ? liveBatch.auditTrail : [];
      liveBatch.auditTrail.push({
        auditedAt,
        reason,
        items: items.map((item) => item.nome),
        officialMessage: "Registro alterado com sucesso",
        result: "SALVO_AUDITADO",
      });
      if (liveBatch.id?.startsWith("IMPORT-")) await persistImportedBatches();
    }
  }



  function reviewItems(ctx) {
    const configured = Array.isArray(ctx.revisoes)
      ? ctx.revisoes
      : (ctx.pendencias || []).map((mensagem) => ({ mensagem, informational: true }));
    return configured;
  }

  function unmappedPendingItems(configuredReviews, ctx) {
    const knownNames = [
      ...ctx.parametros.map((item) => item.nome),
      ...configuredReviews.map((item) => item.nome).filter(Boolean)
    ];
    const knownHeaders = new Set(knownNames.map((name) => findHeader(name, ctx)).filter(Boolean));
    return parameterHeaders(ctx)
      .filter((header) => /Status:\s*N\b/i.test(header.textContent || "") && !knownHeaders.has(header))
      .map((header) => {
        const nome = parameterNameFromHeader(header);
        return {
          nome,
          motivo: "Status N e nenhum resultado deste parâmetro foi mapeado no lote. Verifique o laudo antes do lançamento.",
          informational: true,
          amostra: ctx.amostra,
          arquivoOrigem: ctx.arquivoOrigem,
          tipoOrigem: ctx.tipoOrigem,
          coleta: ctx.dataColeta,
          statusSisagua: "PENDENTE_STATUS_N",
          decisaoLancamento: "BLOQUEAR",
        };
      });
  }

  function needsPreflightReview(ctx = batch) {
    return Boolean(ctx && (ctx.tipo === "SEMESTRAL" || ctx.requiresConfirmation || ctx.manualOnly));
  }

  function clearPreflightReview() {
    if (!preflightElement) return;
    preflightElement.hidden = true;
    preflightListElement.textContent = "";
    preflightCheck.checked = false;
  }

  function updateStartButton() {
    if (!batch) {
      startButton.textContent = "Nenhum lote selecionado";
      startButton.disabled = true;
      return;
    }
    const isInvalid = (batchValidationErrors[batch.id] || []).length > 0;
    if (isInvalid) {
      startButton.textContent = "Configuração inválida";
      startButton.disabled = true;
      return;
    }
    const reviewRequired = needsPreflightReview(batch) && preflightConfirmedBatchId !== batch.id;
    startButton.textContent = reviewRequired ? "Revisar antes de preencher" : "Preencher restantes";
  }

  function appendPreflightDetail(container, labelText, valueText) {
    if (!valueText) return;
    const row = document.createElement("p");
    const label = document.createElement("span");
    label.textContent = labelText;
    const value = document.createElement("b");
    value.textContent = valueText;
    row.append(label, value);
    container.appendChild(row);
  }

  function showPreflightReview(ctx) {
    clearReviewReport();
    preflightListElement.textContent = "";
    preflightReasonElement.textContent = ctx.confirmationReason
      || ctx.manualReason
      || "Confira os dados e confirme antes do lançamento.";

    const contextItem = document.createElement("li");
    const contextName = document.createElement("strong");
    contextName.textContent = "Contexto do lançamento";
    const contextDetails = document.createElement("div");
    appendPreflightDetail(contextDetails, "SAC / cliente", ctx.cliente);
    appendPreflightDetail(contextDetails, "Competência", ctx.competencia);
    appendPreflightDetail(contextDetails, "Amostra", ctx.amostra);
    appendPreflightDetail(contextDetails, "Origem", ctx.arquivoOrigem);
    appendPreflightDetail(contextDetails, "Categoria", ctx.titulo || ctx.categoria);
    appendPreflightDetail(contextDetails, "Ponto do laudo", ctx.pontoIdentificacao);
    appendPreflightDetail(contextDetails, "Tipo de ponto", ctx.pontoDescricao || ctx.ponto);
    contextItem.append(contextName, contextDetails);
    preflightListElement.appendChild(contextItem);

    ctx.parametros.forEach((item) => {
      const listItem = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = item.nome;
      const details = document.createElement("div");
      appendPreflightDetail(details, "Ponto", ctx.pontoDescricao || ctx.ponto);
      appendPreflightDetail(details, "Coleta", item.coleta);
      appendPreflightDetail(details, "Análise", item.analise);
      appendPreflightDetail(details, "Resultado", `${item.valor}${item.unidade ? ` ${item.unidade}` : ""}`);
      appendPreflightDetail(details, "Regra", item.regra || item.limite);
      if (item.conclusao) {
        const conclusion = document.createElement("p");
        conclusion.className = "sisagua-preflight-conclusion";
        conclusion.textContent = item.conclusao;
        details.appendChild(conclusion);
      }
      listItem.append(name, details);
      preflightListElement.appendChild(listItem);
    });
    reviewItems(ctx).forEach((item) => {
      const listItem = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = `Pendência — ${item.nome || "item sem mapeamento"}`;
      const details = document.createElement("div");
      appendPreflightDetail(details, "Resultado original", item.resultado);
      appendPreflightDetail(details, "Motivo", item.motivo || item.mensagem);
      appendPreflightDetail(details, "Amostra", item.amostra);
      appendPreflightDetail(details, "Origem", item.arquivoOrigem);
      appendPreflightDetail(details, "Fonte", item.fonteId);
      listItem.append(name, details);
      preflightListElement.appendChild(listItem);
    });

    preflightElement.hidden = false;
    logDetailsElement.open = false;
    logToggleElement.textContent = "Detalhes da execução";
    setStatus("Revisão obrigatória antes do preenchimento", "warning");
    requestAnimationFrame(() => {
      panelBodyElement.scrollTop = preflightElement.offsetTop - 8;
    });
  }

  function reviewText(item) {
    if (item.mensagem) return item.mensagem;
    const details = [
      item.resultado ? `resultado ${item.resultado}` : "",
      item.limite ? `limite/regra ${item.limite}` : "",
      item.motivo || ""
    ].filter(Boolean).join("; ");
    return `${item.nome || "Parâmetro"}${details ? ` — ${details}` : ""}`;
  }

  function clearReviewReport() {
    reviewPending = false;
    displayedReviewItems = [];
    if (!reviewElement) return;
    reviewElement.hidden = true;
    reviewListElement.textContent = "";
    reviewCountElement.textContent = "";
    reviewFillButton.hidden = true;
    reviewControls.style.display = "none";
  }

  function showReviewReport(ctx) {
    clearPreflightReview();
    const items = reviewItems(ctx);
    displayedReviewItems = items;
    reviewPending = items.length > 0;
    reviewListElement.textContent = "";
    if (!items.length) {
      reviewElement.hidden = true;
      reviewControls.style.display = "none";
      return;
    }
    
    items.forEach((item, index) => {
      if (item.nome && statusFor(item.nome, ctx) === "S") return;
      const listItem = document.createElement("li");
      listItem.className = "sisagua-review-card";
      listItem.dataset.reviewIndex = String(index);
      
      const label = document.createElement("label");
      label.className = "sisagua-review-select";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "sisagua-review-check";
      checkbox.disabled = Boolean(item.informational);
      checkbox.addEventListener("change", () => {
        updateControlsState();
      });
      
      const name = document.createElement("strong");
      name.className = "sisagua-review-name";
      name.textContent = item.nome || "Parâmetro para revisão";
      label.append(checkbox, name);
      listItem.appendChild(label);

      const details = document.createElement("div");
      details.className = "sisagua-review-details";
      if (item.resultado) {
        const result = document.createElement("p");
        const resultLabel = document.createElement("span");
        resultLabel.textContent = "Laudo";
        const resultValue = document.createElement("b");
        resultValue.textContent = item.resultado;
        result.append(resultLabel, resultValue);
        details.appendChild(result);
      }
      if (item.limite) {
        const limit = document.createElement("p");
        const limitLabel = document.createElement("span");
        limitLabel.textContent = "Limite/regra";
        const limitValue = document.createElement("b");
        limitValue.textContent = item.limite;
        limit.append(limitLabel, limitValue);
        details.appendChild(limit);
      }
      if (item.motivo || item.mensagem) {
        const reason = document.createElement("p");
        reason.className = "sisagua-review-reason";
        reason.textContent = item.motivo || item.mensagem;
        details.appendChild(reason);
      }
      listItem.appendChild(details);
      
      if (item.informational) {
        listItem.classList.add("sisagua-review-informational");
      }

      if (item.coleta && item.analise) {
        const valueLabel = document.createElement("label");
        valueLabel.className = "sisagua-review-value-label";
        const valueCaption = document.createElement("span");
        valueCaption.textContent = "Valor confirmado";
        const valueInput = document.createElement("input");
        valueInput.className = "sisagua-review-value";
        valueInput.type = "text";
        valueInput.inputMode = "decimal";
        valueInput.value = item.valorSugerido || "";
        valueInput.placeholder = item.placeholder || "Valor confirmado";
        valueInput.setAttribute("aria-label", `Valor confirmado para ${item.nome}`);
        
        valueInput.addEventListener("input", () => {
          const val = valueInput.value.trim();
          const parsedValue = normalizeQuantifiedValue(val);
          const isValidNumber = Boolean(parsedValue && !parsedValue.qualifier);
          if (val === "") {
            valueInput.className = "sisagua-review-value";
          } else if (isValidNumber) {
            valueInput.className = "sisagua-review-value valid-value";
          } else {
            valueInput.className = "sisagua-review-value invalid-value";
          }
        });
        
        valueLabel.append(valueCaption, valueInput);
        listItem.appendChild(valueLabel);
      }
      
      reviewListElement.appendChild(listItem);
      log(`⚠ REVISÃO FINAL: ${reviewText(item)}`);
    });
    
    reviewPending = reviewListElement.children.length > 0;
    reviewElement.hidden = !reviewPending;
    
    const hasActionableReview = [...reviewListElement.querySelectorAll(".sisagua-review-check")]
      .some((checkbox) => !checkbox.disabled);
      
    reviewFillButton.hidden = false; // Always show button to allow closing or submitting
    if (hasActionableReview) {
      reviewFillButton.textContent = "Confirmar e preencher selecionados";
    } else {
      reviewFillButton.textContent = "Ocultar pendências";
    }
    
    reviewControls.style.display = hasActionableReview ? "flex" : "none";
    allReviewsSelected = false;
    reviewToggleAll.textContent = "Marcar todos";
    
    reviewCountElement.textContent = reviewPending
      ? `${reviewListElement.children.length} ${reviewListElement.children.length === 1 ? "item" : "itens"}`
      : "";
      
    if (reviewPending) {
      logDetailsElement.open = false;
      logToggleElement.textContent = "Detalhes da execução";
      requestAnimationFrame(() => {
        panelBodyElement.scrollTop = reviewElement.offsetTop - 8;
      });
    }
  }

  async function finalizeReviewState(ctx) {
    const configured = reviewItems(ctx);
    const statusPending = unmappedPendingItems(configured, ctx);
    const combined = [...configured];
    const known = new Set(combined.map((item) => core.identityKey(item.nome)).filter(Boolean));
    statusPending.forEach((item) => {
      const key = core.identityKey(item.nome);
      if (!known.has(key)) {
        combined.push(item);
        known.add(key);
      }
    });
    const liveBatch = batches.find((item) => item.id === ctx.id);
    if (liveBatch && statusPending.length) {
      liveBatch.revisoes = Array.isArray(liveBatch.revisoes) ? liveBatch.revisoes : [];
      const persistedNames = new Set(liveBatch.revisoes.map((item) => core.identityKey(item.nome)));
      statusPending.forEach((item) => {
        const key = core.identityKey(item.nome);
        if (!persistedNames.has(key)) {
          liveBatch.revisoes.push(structuredClone(item));
          persistedNames.add(key);
        }
      });
      if (liveBatch.id?.startsWith("IMPORT-")) await persistImportedBatches();
    }
    ctx.revisoes = combined;
    if (statusPending.length) {
      log(`⚠ ${statusPending.length} cabeçalho(s) continuam com Status: N e foram registrados como pendência.`);
    }
    showReviewReport(ctx);
    setReviewPending(reviewPending);
    setCompleted(!reviewPending);
    setStatus(
      reviewPending ? "Persistência auditada; categoria possui pendências" : "Categoria salva, reaberta e auditada",
      reviewPending ? "warning" : "success"
    );
    return reviewPending;
  }

  // Immutable context run function (Task A2)
  async function run() {
    if (running) return;
    if (!batch) return;
    const errors = batchValidationErrors[batch.id] || [];
    if (errors.length > 0) {
      setStatus("Lote inválido; verifique erros de configuração.", "danger");
      return;
    }
    
    const ctx = structuredClone(batch);
    
    if (needsPreflightReview(ctx) && preflightConfirmedBatchId !== ctx.id) {
      showPreflightReview(ctx);
      return;
    }
    
    prepareCompletionSound();
    logDetailsElement.open = true;
    logToggleElement.textContent = "Detalhes da execução";
    panelBodyElement.scrollTop = 0;
    setCompleted(false);
    setReviewPending(false);
    clearReviewReport();
    
    running = true;
    stopRequested = false;
    unsavedItems = [];
    
    setStatus("Executando...", "running");
    updateControlsState();
    startTimer();
    renderBadges(ctx);
    
    try {
      if (!getDialog(ctx)) throw new Error(`Abra a janela da categoria selecionada: ${ctx.titulo || ctx.categoria}.`);

      preflightParameterHeaders(ctx.parametros, ctx, "parâmetros automáticos");
      const verifiedExisting = await preflightExistingValidated(ctx.parametros, ctx);

      log(`Lote ${ctx.id} | base ${ctx.baseId}`);
      const saveEvery = Number(ctx.saveEvery || (ctx.parametros.length > 20 ? 10 : 0));
      let processedSinceSave = [];
      
      const totalParams = ctx.parametros.length;
      let completedParams = 0;
      
      ctx.parametros.forEach((item, idx) => {
        try {
          if (statusFor(item.nome, ctx) === "S") {
            updateBadgeState(idx, "success", item.nome);
            completedParams++;
          } else {
            updateBadgeState(idx, "pending", item.nome);
          }
        } catch (e) {
          updateBadgeState(idx, "pending", item.nome);
        }
      });
      
      updateProgressBar(completedParams, totalParams, "Preenchendo");
      
      for (let idx = 0; idx < ctx.parametros.length; idx++) {
        const item = ctx.parametros[idx];
        
        if (stopRequested) {
          log("Parada solicitada pelo usuário.");
          break;
        }
        
        updateBadgeState(idx, "running", item.nome);
        const processed = await processParameter(item, ctx, verifiedExisting);
        
        if (processed) {
          processedSinceSave.push(item);
          unsavedItems.push(item);
          updateBadgeState(idx, "success", item.nome);
          completedParams++;
          updateProgressBar(completedParams, totalParams, "Preenchendo");
        } else {
          updateBadgeState(idx, "success", item.nome);
        }

        if (saveEvery > 0 && processedSinceSave.length >= saveEvery) {
          setStatus("Salvando e auditando bloco...", "running");
          await saveReopenAndAudit([...processedSinceSave], ctx, "bloco interno");
          processedSinceSave = [];
        }
      }
      
      if (stopRequested) {
        if (unsavedItems.length > 0 && getDialog(ctx)) {
          setStatus("Pausando... salvando parcial.", "warning");
          await saveReopenAndAudit([...unsavedItems], ctx, "parada segura");
          setStatus("Parado — progresso salvo e auditado", "warning");
        } else {
          setStatus("Parado sem alterações não salvas", "warning");
        }
        return;
      }

      if (ctx.parametros.length > 0) {
        setStatus("Salvando categoria...", "running");
        if (unsavedItems.length > 0) {
          await saveReopenAndAudit([...unsavedItems], ctx, "categoria");
        } else {
          // Mesmo quando tudo já está S, o salvamento força o fechamento e a
          // reabertura, impedindo que o estado da janela atual seja confundido
          // com persistência confirmada.
          await saveReopenAndAudit(ctx.parametros, ctx, "confirmação de persistência");
        }
      }

      await finalizeReviewState(ctx);
      playCompletionSound();
    } catch (error) {
      log(`✗ PARADA: ${error.message}`);
      if (unsavedItems.length > 0 && getDialog(ctx)) {
        try {
          log(`↻ Tentando preservar ${unsavedItems.length} alteração(ões) após o erro...`);
          await saveReopenAndAudit([...unsavedItems], ctx, "recuperação após erro");
          setStatus(`Erro após progresso salvo e auditado: ${error.message}`, "warning");
        } catch (saveError) {
          log(`✗ Alterações continuam não salvas: ${saveError.message}`);
          setStatus(`Erro; ${unsavedItems.length} item(ns) permanecem não salvos`, "danger");
        }
      } else {
        setStatus(`Parado por erro: ${error.message}`, "danger");
      }
    } finally {
      running = false;
      stopTimer(true);
      updateControlsState();
      updateProgressBar(0, 0);
    }
  }

  async function runConfirmedReviews() {
    if (running) return;
    
    const ctx = structuredClone(batch);
    const hasActionableReview = [...reviewListElement.querySelectorAll(".sisagua-review-check")]
      .some((checkbox) => !checkbox.disabled);

    if (!hasActionableReview) {
      reviewElement.hidden = true;
      setReviewPending(true);
      setCompleted(false);
      updateControlsState();
      setStatus("Pendências reconhecidas; categoria permanece incompleta", "warning");
      return;
    }
    
    const selected = [...reviewListElement.querySelectorAll("li")]
      .filter((listItem) => listItem.querySelector(".sisagua-review-check")?.checked)
      .map((listItem) => {
        const review = displayedReviewItems[Number(listItem.dataset.reviewIndex)];
        const value = listItem.querySelector(".sisagua-review-value")?.value?.trim();
        return { review, value };
      });
      
    if (!selected.length) {
      setStatus("Selecione ao menos um parâmetro revisado.", "warning");
      return;
    }
    const missingValue = selected.find(({ review, value }) => review.coleta && review.analise && !value);
    if (missingValue) {
      setStatus(`Informe o valor confirmado de ${missingValue.review.nome}.`, "warning");
      return;
    }
    const invalidValue = selected.find(({ review, value }) => {
      if (!review.coleta || !review.analise) return false;
      const parsedValue = normalizeQuantifiedValue(value);
      return !parsedValue || Boolean(parsedValue.qualifier);
    });
    if (invalidValue) {
      setStatus(
        `Informe somente o componente numérico de ${invalidValue.review.nome}, sem sinais ou unidade.`,
        "warning"
      );
      return;
    }

    prepareCompletionSound();
    logDetailsElement.open = true;
    logToggleElement.textContent = "Detalhes da execução";
    
    running = true;
    stopRequested = false;
    unsavedItems = [];
    
    setStatus("Preenchendo parâmetros confirmados...", "running");
    updateControlsState();
    startTimer();
    
    try {
      if (!getDialog(ctx)) throw new Error(`Reabra a janela ${ctx.titulo || ctx.categoria}.`);

      const reviewItemsForPreflight = selected.map(({ review, value }) => ({
        nome: review.nome,
        coleta: review.coleta,
        analise: review.analise,
        valor: value,
        unidade: review.unidade,
      }));
      preflightParameterHeaders(reviewItemsForPreflight, ctx, "revisões selecionadas");
      const verifiedExisting = await preflightExistingValidated(reviewItemsForPreflight, ctx);

      const confirmedItems = [];
      const totalReviews = selected.length;
      let completedReviews = 0;
      
      updateProgressBar(completedReviews, totalReviews, "Revisões");
      
      for (const { review, value } of selected) {
        if (stopRequested) {
          log("Parada solicitada pelo usuário.");
          break;
        }
        
        const item = {
          nome: review.nome,
          coleta: review.coleta,
          analise: review.analise,
          valor: value,
          unidade: review.unidade,
        };
        
        const processed = await processParameter(item, ctx, verifiedExisting);
        confirmedItems.push(item);
        if (processed) unsavedItems.push(item);
        
        completedReviews++;
        updateProgressBar(completedReviews, totalReviews, "Revisões");
      }
      
      if (stopRequested) {
        if (unsavedItems.length > 0 && getDialog(ctx)) {
          setStatus("Pausando... salvando parcial.", "warning");
          await saveReopenAndAudit([...unsavedItems], ctx, "revisões na parada");
          setStatus("Parado — revisões salvas e auditadas", "warning");
        } else {
          setStatus("Parado para revisão", "warning");
        }
        return;
      }

      if (confirmedItems.length > 0) {
        if (unsavedItems.length > 0) {
          await saveReopenAndAudit([...unsavedItems], ctx, "revisões confirmadas");
        } else {
          await saveReopenAndAudit(confirmedItems, ctx, "confirmação das revisões");
        }
      }
      await finalizeReviewState(ctx);
      playCompletionSound();
    } catch (error) {
      log(`✗ REVISÃO: ${error.message}`);
      if (unsavedItems.length > 0 && getDialog(ctx)) {
        try {
          await saveReopenAndAudit([...unsavedItems], ctx, "recuperação de revisões");
          setStatus(`Revisão falhou após salvar o progresso: ${error.message}`, "warning");
        } catch (saveError) {
          log(`✗ Revisões não salvas: ${saveError.message}`);
          setStatus(`Revisão falhou; ${unsavedItems.length} item(ns) não salvos`, "danger");
        }
      } else {
        setStatus(`Revisão falhou: ${error.message}`, "danger");
      }
    } finally {
      running = false;
      stopTimer(true);
      updateControlsState();
      updateProgressBar(0, 0);
    }
  }

  function log(message) {
    const stamp = new Date().toLocaleTimeString("pt-BR");
    logElement.textContent += `[${stamp}] ${message}\n`;
    logElement.scrollTop = logElement.scrollHeight;
  }

  // Panel creation with premium markup (Task B1, B2, B5, B6, B7, B8, B9)
  const panel = document.createElement("section");
  panel.id = "sisagua-auto-panel";
  panel.innerHTML = `
    <header>
      <div class="sisagua-header-main">
        <span id="sisagua-auto-title">Assistente SISAGUA</span>
        <div class="sisagua-header-actions">
          <button id="sisagua-auto-help" class="sisagua-btn-icon" type="button" title="Ajuda / Instruções">?</button>
          <button id="sisagua-auto-minimize" class="sisagua-btn-icon" type="button" aria-label="Minimizar painel" title="Minimizar painel">−</button>
        </div>
      </div>
      <div class="sisagua-header-sub" id="sisagua-auto-header-sub"></div>
    </header>
    <div class="sisagua-tabs" role="tablist" aria-label="Seções do assistente">
      <button type="button" role="tab" aria-selected="true" class="sisagua-tab active" id="sisagua-tab-categories">Categorias</button>
      <button type="button" role="tab" aria-selected="false" class="sisagua-tab" id="sisagua-tab-import">Importar Laudo</button>
    </div>
    <div class="body sisagua-tab-content active" id="sisagua-content-categories">
      <label class="sisagua-auto-field">
        <span>Categoria</span>
        <div style="display:flex; gap: 4px; flex:1">
           <select id="sisagua-auto-batch"></select>
           <button id="sisagua-auto-clear" class="sisagua-btn-icon" style="flex:0; padding: 0 8px; font-size: 16px;" title="Apagar todos os lotes importados">🗑️</button>
        </div>
      </label>
      
      <div id="sisagua-auto-status" role="status" aria-live="polite">
        <span id="sisagua-auto-status-text">Pronto</span>
        <span id="sisagua-auto-timer" style="margin-left: auto; font-family: var(--font-mono); font-size: 11px; opacity: 0.85;"></span>
      </div>
      <div id="sisagua-auto-transient-msg"></div>
      
      <div class="sisagua-progress-container" id="sisagua-auto-progress-container">
        <div class="sisagua-progress-bar" id="sisagua-auto-progress-bar"></div>
        <div class="sisagua-progress-text" id="sisagua-auto-progress-text">0 / 0</div>
      </div>
      
      <details class="sisagua-badges-container" id="sisagua-auto-badges-details">
        <summary class="sisagua-badges-summary">
          <span>Parâmetros do lote</span>
          <span id="sisagua-auto-badges-count">0/0</span>
        </summary>
        <div class="sisagua-badges-list" id="sisagua-auto-badges-list"></div>
      </details>
      
      <div class="actions">
        <button id="sisagua-auto-start">Preencher restantes</button>
        <button id="sisagua-auto-stop">Parar</button>
        <button id="sisagua-auto-export" type="button" title="Baixar o registro canônico temporário">Exportar registro</button>
      </div>
      
      <details id="sisagua-auto-log-details" open>
        <summary class="sisagua-log-summary-container">
          <span id="sisagua-auto-log-toggle">Detalhes da execução</span>
          <button class="sisagua-log-copy-btn" id="sisagua-auto-log-copy" type="button">📋 Copiar log</button>
        </summary>
        <div id="sisagua-auto-log" role="log" aria-live="polite"></div>
      </details>
      
      <section id="sisagua-auto-preflight" hidden>
        <div class="sisagua-preflight-heading">
          <div>
            <strong>Revisão antes do lançamento</strong>
            <span>obrigatória</span>
          </div>
          <button id="sisagua-auto-preflight-cancel" class="sisagua-btn-icon sisagua-modal-close" type="button" title="Cancelar e fechar">✕</button>
        </div>
        <p id="sisagua-auto-preflight-reason"></p>
        <ul id="sisagua-auto-preflight-list"></ul>
        <label class="sisagua-preflight-confirm">
          <input id="sisagua-auto-preflight-check" type="checkbox">
          <span>Revisei SAC/cliente, semestre/ano, amostra, bloco, ponto, datas, resultados, unidades e regras acima.</span>
        </label>
        <button id="sisagua-auto-preflight-confirm" type="button">Revisei e confirmo — preencher categoria</button>
      </section>
      
      <section id="sisagua-auto-review" hidden>
        <div class="sisagua-review-heading">
          <div>
            <strong>Revisão da categoria</strong>
            <p>Confira o valor, marque o item e confirme.</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span id="sisagua-auto-review-count"></span>
            <button id="sisagua-auto-review-cancel" class="sisagua-btn-icon sisagua-modal-close" type="button" title="Cancelar e fechar">✕</button>
          </div>
        </div>
        <div class="sisagua-review-controls" id="sisagua-auto-review-controls" style="display:none; justify-content: flex-end; margin-bottom: 6px;">
          <button class="sisagua-review-toggle-all" id="sisagua-auto-review-toggle-all" type="button">Marcar todos</button>
        </div>
        <ul id="sisagua-auto-review-list"></ul>
        <div class="sisagua-review-action">
          <button id="sisagua-auto-review-fill" type="button" hidden>Confirmar e preencher selecionados</button>
        </div>
      </section>
      <p class="note">A extensão valida e salva esta categoria, mas nunca aciona o envio definitivo do formulário semestral.</p>
    </div>
    <div class="body sisagua-tab-content" id="sisagua-content-import">
      <textarea id="sisagua-import-textarea" placeholder="Cole aqui o texto do relatório de análises do laboratório (Ctrl+A no PDF e Ctrl+V aqui)"></textarea>
      <button class="sisagua-import-btn" id="sisagua-import-extract">Extrair Dados</button>
      <div id="sisagua-import-preview"></div>
      <button class="sisagua-import-btn" id="sisagua-import-generate" style="display: none;">Gerar Lotes</button>
    </div>`;
  document.documentElement.appendChild(panel);

  const statusElement = panel.querySelector("#sisagua-auto-status-text");
  const timerElement = panel.querySelector("#sisagua-auto-timer");
  const progressContainer = panel.querySelector("#sisagua-auto-progress-container");
  const progressBar = panel.querySelector("#sisagua-auto-progress-bar");
  const progressText = panel.querySelector("#sisagua-auto-progress-text");
  const badgesDetails = panel.querySelector("#sisagua-auto-badges-details");
  const badgesSummary = panel.querySelector(".sisagua-badges-summary");
  const badgesList = panel.querySelector("#sisagua-auto-badges-list");
  const badgesCount = panel.querySelector("#sisagua-auto-badges-count");
  
  const logElement = panel.querySelector("#sisagua-auto-log");
  const startButton = panel.querySelector("#sisagua-auto-start");
  const stopButton = panel.querySelector("#sisagua-auto-stop");
  const exportButton = panel.querySelector("#sisagua-auto-export");
  const batchSelect = panel.querySelector("#sisagua-auto-batch");
  const titleElement = panel.querySelector("#sisagua-auto-title");
  const headerSubElement = panel.querySelector("#sisagua-auto-header-sub");
  const minimizeButton = panel.querySelector("#sisagua-auto-minimize");
  const helpButton = panel.querySelector("#sisagua-auto-help");
  
  const reviewElement = panel.querySelector("#sisagua-auto-review");
  const reviewListElement = panel.querySelector("#sisagua-auto-review-list");
  const reviewCountElement = panel.querySelector("#sisagua-auto-review-count");
  const reviewFillButton = panel.querySelector("#sisagua-auto-review-fill");
  const reviewToggleAll = panel.querySelector("#sisagua-auto-review-toggle-all");
  const reviewControls = panel.querySelector("#sisagua-auto-review-controls");
  
  const logDetailsElement = panel.querySelector("#sisagua-auto-log-details");
  const logToggleElement = panel.querySelector("#sisagua-auto-log-toggle");
  const logCopyButton = panel.querySelector("#sisagua-auto-log-copy");
  
  const panelBodyElement = panel.querySelector("#sisagua-content-categories");
  const preflightElement = panel.querySelector("#sisagua-auto-preflight");
  const preflightReasonElement = panel.querySelector("#sisagua-auto-preflight-reason");
  const preflightListElement = panel.querySelector("#sisagua-auto-preflight-list");
  const preflightCheck = panel.querySelector("#sisagua-auto-preflight-check");
  const preflightConfirmButton = panel.querySelector("#sisagua-auto-preflight-confirm");
  const preflightCancelButton = panel.querySelector("#sisagua-auto-preflight-cancel");
  const reviewCancelButton = panel.querySelector("#sisagua-auto-review-cancel");

  let allReviewsSelected = false;

  function updatePanelButton() {
    const minimized = panel.classList.contains("minimized");
    const completed = panel.classList.contains("completed");
    const hasReview = panel.classList.contains("review-pending");
    minimizeButton.textContent = minimized ? (hasReview ? "!" : (completed ? "✓" : "S")) : "−";
    minimizeButton.setAttribute("aria-label", minimized ? "Restaurar painel" : "Minimizar painel");
    minimizeButton.title = minimized
      ? (hasReview ? "Categoria concluída com revisão — restaurar painel" : (completed ? "Categoria concluída — restaurar painel" : "Restaurar painel"))
      : "Minimizar painel";
  }

  function setMinimized(minimized) {
    panel.classList.toggle("minimized", minimized);
    updatePanelButton();
    try {
      localStorage.setItem("sisagua-assistente-minimizado", minimized ? "1" : "0");
    } catch {
    }
  }

  function setCompleted(completed) {
    panel.classList.toggle("completed", completed);
    updatePanelButton();
  }

  function setReviewPending(pending) {
    panel.classList.toggle("review-pending", pending);
    updatePanelButton();
  }

  function updateHeaderSub() {
    if (!batch) {
      headerSubElement.textContent = "Nenhum lote importado";
      headerSubElement.title = "";
      return;
    }
    if (batch.cliente) {
      headerSubElement.textContent = `${batch.cliente} — ${batch.pontoIdentificacao || batch.ponto}`;
      headerSubElement.title = `ID: ${batch.id} | Base: ${batch.baseId}`;
    } else {
      headerSubElement.textContent = `ID: ${batch.id} | Base: ${batch.baseId} | Categoria: ${batch.categoria}`;
      headerSubElement.title = "";
    }
  }

  function renderBatchSelect() {
    batchSelect.innerHTML = "";
    
    const standardBatches = [];
    const importedGroups = {};
    
    batches.forEach((b, index) => {
      const item = { batch: b, index };
      if (b.id && b.id.startsWith("IMPORT-")) {
        const client = b.cliente || "Laudo Importado";
        const point = b.pontoIdentificacao || b.ponto || "Ponto de Coleta";
        const key = `${client} — ${point}`;
        if (!importedGroups[key]) {
          importedGroups[key] = [];
        }
        importedGroups[key].push(item);
      } else {
        standardBatches.push(item);
      }
    });
    
    for (const [key, items] of Object.entries(importedGroups)) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = key;
      items.forEach(item => {
        const option = document.createElement("option");
        option.value = String(item.index);
        const isEmpty = !item.batch.parametros || item.batch.parametros.length === 0;
        option.textContent = `${item.batch.titulo || item.batch.categoria}${isEmpty ? ' (Vazio)' : ''}`;
        optgroup.appendChild(option);
      });
      batchSelect.appendChild(optgroup);
    }
    
    if (standardBatches.length > 0) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = "Lotes Padrão";
      standardBatches.forEach(item => {
        const option = document.createElement("option");
        option.value = String(item.index);
        const isEmpty = !item.batch.parametros || item.batch.parametros.length === 0;
        option.textContent = `${item.batch.titulo || item.batch.categoria}${isEmpty ? ' (Vazio)' : ''}`;
        optgroup.appendChild(option);
      });
      batchSelect.appendChild(optgroup);
    }
    const selectedIndex = batches.indexOf(batch);
    if (selectedIndex >= 0) batchSelect.value = String(selectedIndex);
  }

  // Controls manager (Task A1, A2)
  function updateControlsState() {
    if (!batch) {
      startButton.disabled = true;
      stopButton.disabled = true;
      batchSelect.disabled = true;
      exportButton.disabled = running || !batches.some((item) => item.id?.startsWith("IMPORT-"));
      startButton.textContent = "Nenhum lote selecionado";
      return;
    }
    const isEmpty = (!batch.parametros || batch.parametros.length === 0)
      && (!batch.revisoes || batch.revisoes.length === 0);
    if (isEmpty) {
      startButton.disabled = true;
      stopButton.disabled = true;
      batchSelect.disabled = running;
      exportButton.disabled = running || !batches.some((item) => item.id?.startsWith("IMPORT-"));
      startButton.textContent = "Lote sem parâmetros";
      return;
    }
    const errors = batchValidationErrors[batch.id] || [];
    const isInvalid = errors.length > 0;
    const reviewRequired = needsPreflightReview(batch) && preflightConfirmedBatchId !== batch.id;

    batchSelect.disabled = running;
    stopButton.disabled = !running;
    panel.querySelector("#sisagua-auto-clear").disabled = running;
    exportButton.disabled = running || !batches.some((item) => item.id?.startsWith("IMPORT-"));
    panel.querySelector("#sisagua-import-extract").disabled = running;
    panel.querySelector("#sisagua-import-generate").disabled = running;
    panel.querySelector("#sisagua-import-textarea").disabled = running;
    panel.querySelector("#sisagua-tab-import").disabled = running;

    if (running) {
      startButton.disabled = true;
      reviewFillButton.disabled = true;
    } else {
      if (isInvalid) {
        startButton.disabled = true;
        reviewFillButton.disabled = true;
        startButton.textContent = "Configuração inválida";
      } else {
        startButton.disabled = false;
        
        const hasActionableReview = [...reviewListElement.querySelectorAll(".sisagua-review-check")]
          .some((checkbox) => !checkbox.disabled);
        
        if (reviewPending) {
          if (hasActionableReview) {
            const anyChecked = [...reviewListElement.querySelectorAll(".sisagua-review-check:checked")].length > 0;
            reviewFillButton.disabled = !anyChecked;
          } else {
            reviewFillButton.disabled = false;
          }
        } else {
          reviewFillButton.disabled = true;
        }

        startButton.textContent = reviewRequired ? "Revisar antes de preencher" : "Preencher restantes";
      }
    }
  }

  // Dynamic feedback and color mapping (Task B6)
  function setStatus(message, type = "running") {
    statusElement.textContent = message;
    
    // clear classes
    const wrapper = panel.querySelector("#sisagua-auto-status");
    wrapper.className = "";
    
    let icon = "⏳";
    if (type === "success" || message.includes("Concluído") || message.includes("conferida")) {
      icon = "✅";
      wrapper.classList.add("status-success");
    } else if (type === "warning" || message.includes("Revisão") || message.includes("Parado") || message.includes("Pausando")) {
      icon = "⚠️";
      wrapper.classList.add("status-warning");
    } else if (type === "danger" || message.includes("Erro") || message.includes("falhou") || message.includes("inválido")) {
      icon = "❌";
      wrapper.classList.add("status-danger");
    } else {
      wrapper.classList.add("status-running");
    }
    
    // update icon
    let iconSpan = wrapper.querySelector(".status-icon");
    if (!iconSpan) {
      iconSpan = document.createElement("span");
      iconSpan.className = "status-icon";
      wrapper.prepend(iconSpan);
    }
    iconSpan.textContent = icon + " ";
  }

  // Progress bar management (Task B1)
  function updateProgressBar(current, total, label = "Processando") {
    if (total <= 0) {
      progressContainer.style.display = "none";
      return;
    }
    progressContainer.style.display = "block";
    const percent = Math.min(100, Math.max(0, (current / total) * 100));
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${label}: ${current} / ${total}`;
  }

  // Badges renderer (Task B2)
  function renderBadges(ctx) {
    badgesList.innerHTML = "";
    if (!ctx || !Array.isArray(ctx.parametros)) {
      badgesCount.textContent = "0/0";
      return;
    }
    
    const total = ctx.parametros.length;
    let completedCount = 0;
    
    ctx.parametros.forEach((p, idx) => {
      const badge = document.createElement("div");
      badge.className = "sisagua-badge pending";
      badge.id = `badge-${idx}`;
      
      const shortName = p.nome.length > 18 ? p.nome.substring(0, 16) + "..." : p.nome;
      badge.textContent = shortName;
      badge.title = `${p.nome}\nColeta: ${p.coleta}\nAnálise: ${p.analise}\nValor: ${p.valor}`;
      
      try {
        const currentStatus = statusFor(p.nome, ctx);
        if (currentStatus === "S") {
          badge.className = "sisagua-badge success";
          badge.textContent = `✓ ${shortName}`;
          completedCount++;
        }
      } catch (e) {
      }
      
      badgesList.appendChild(badge);
    });
    
    badgesCount.textContent = `${completedCount}/${total}`;
  }

  function updateBadgeState(index, state, name, tooltipText = "") {
    const badge = document.getElementById(`badge-${index}`);
    if (!badge) return;
    
    const shortName = name.length > 18 ? name.substring(0, 16) + "..." : name;
    badge.className = `sisagua-badge ${state}`;
    
    if (state === "running") {
      badge.textContent = `🔄 ${shortName}`;
    } else if (state === "success") {
      badge.textContent = `✓ ${shortName}`;
    } else if (state === "warning") {
      badge.textContent = `⚠️ ${shortName}`;
    } else if (state === "danger") {
      badge.textContent = `❌ ${shortName}`;
    } else if (state === "audited") {
      badge.textContent = `✓✓ ${shortName}`;
    } else {
      badge.textContent = shortName;
    }
    
    if (tooltipText) {
      badge.title = tooltipText;
    }
    
    const total = badgesList.children.length;
    const completed = badgesList.querySelectorAll(".success, .audited").length;
    badgesCount.textContent = `${completed}/${total}`;
  }

  let initiallyMinimized = false;
  try {
    initiallyMinimized = localStorage.getItem("sisagua-assistente-minimizado") === "1";
  } catch {
    initiallyMinimized = false;
  }
  setMinimized(initiallyMinimized);

  renderBatchSelect();
  
  updateHeaderSub();
  updateControlsState();
  updateStartButton();
  
  renderBadges(batch);

  // Validate initial batch errors if any
  const initialErrors = batch ? (batchValidationErrors[batch.id] || []) : [];
  if (initialErrors.length > 0) {
    setStatus("Lote com erros de configuração.", "danger");
    log(`✗ CONFIGURAÇÃO INVÁLIDA PARA O LOTE:\n` + initialErrors.map(e => `  - ${e}`).join("\n"));
  }

  batchSelect.addEventListener("change", () => {
    if (running) {
      const currentIndex = batches.indexOf(batch);
      if (currentIndex >= 0) batchSelect.value = String(currentIndex);
      log("Troca de lote ignorada durante a execução.");
      return;
    }
    batch = batches[Number(batchSelect.value)] || null;
    preflightConfirmedBatchId = null;
    updateHeaderSub();
    logElement.textContent = "";
    
    if (!batch) {
       setStatus("Nenhum lote importado. Use a aba 'Importar Laudo'.", "warning");
       setCompleted(false);
       setReviewPending(false);
       clearReviewReport();
       clearPreflightReview();
       updateControlsState();
       updateStartButton();
       renderBadges(null);
       return;
    }

    
    const errors = batchValidationErrors[batch.id] || [];
    if (errors.length > 0) {
      setStatus(`Lote inválido: ${errors.length} erro(s) encontrados.`, "danger");
      log(`✗ CONFIGURAÇÃO INVÁLIDA PARA O LOTE:\n` + errors.map(e => `  - ${e}`).join("\n"));
    } else {
      setStatus("Pronto", "success");
    }
    
    setCompleted(false);
    setReviewPending(false);
    clearReviewReport();
    clearPreflightReview();
    updateControlsState();
    updateStartButton();
    renderBadges(batch);
  });

  startButton.addEventListener("click", run);
  
  preflightConfirmButton.addEventListener("click", () => {
    if (!preflightCheck.checked) {
      setStatus("Marque a confirmação após revisar todos os dados.", "warning");
      return;
    }
    preflightConfirmedBatchId = batch.id;
    preflightElement.hidden = true;
    updateStartButton();
    log(`✓ Revisão prévia confirmada para ${batch.titulo || batch.categoria}.`);
    setStatus("Revisão confirmada; iniciando preenchimento...", "running");
    run();
  });
  
  reviewFillButton.addEventListener("click", runConfirmedReviews);

  preflightCancelButton.addEventListener("click", () => {
    clearPreflightReview();
    updateControlsState();
  });
  
  reviewCancelButton.addEventListener("click", () => {
    reviewElement.hidden = true;
    setReviewPending(true);
    setCompleted(false);
    setStatus("Revisão ocultada; pendências permanecem abertas", "warning");
    updateControlsState();
  });
  
  minimizeButton.addEventListener("click", () => setMinimized(!panel.classList.contains("minimized")));
  
  const clearButton = panel.querySelector("#sisagua-auto-clear");
  clearButton.addEventListener("click", async () => {
    if (running) return;
    if (confirm("Apagar todos os lotes importados?")) {
      const previousBatches = structuredClone(batches);
      const previousBatchId = batch?.id;
      batches = batches.filter((item) => !item.id?.startsWith("IMPORT-"));
      batch = batches[0] || null;
      try {
        await persistImportedBatches();
        try { localStorage.removeItem("sisagua-imported-batches"); } catch {}
      } catch (error) {
        batches = previousBatches;
        batch = batches.find((item) => item.id === previousBatchId) || batches[0] || null;
        recomputeBatchValidation();
        renderBatchSelect();
        setStatus(`Não foi possível persistir a exclusão: ${error.message}`, "danger");
        return;
      }
      recomputeBatchValidation();
      renderBatchSelect();
      batchSelect.dispatchEvent(new Event("change"));
    }
  });

  function canonicalExportPayload() {
    const imported = batches.filter((item) => item.id?.startsWith("IMPORT-"));
    const groups = new Map();
    imported.forEach((item) => {
      const groupId = item.importGroupId || item.id;
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          importGroupId: groupId,
          cliente: item.cliente || "",
          amostra: item.amostra || "",
          arquivoOrigem: item.arquivoOrigem || "",
          tipoOrigem: item.tipoOrigem || "",
          dataColeta: item.dataColeta || "",
          competencia: item.competencia || "",
          ponto: item.ponto || "",
          pontoIdentificacao: item.pontoIdentificacao || "",
          diagnosticos: structuredClone(item.importDiagnostics || {
            unmapped: [],
            ignored: [],
            duplicates: [],
          }),
          categorias: [],
        });
      }
      const { _mappedInfo, importDiagnostics, ...canonicalBatch } = structuredClone(item);
      groups.get(groupId).categorias.push(canonicalBatch);
    });
    const canonicalGroups = [...groups.values()];
    const canonicalBatches = canonicalGroups.flatMap((group) => group.categorias);
    return {
      schemaVersion: 2,
      tipo: "REGISTRO_CANONICO_TEMPORARIO_SEMESTRAL",
      baseId: LEGAL_BASE_ID,
      baseStatus: legalBase.status,
      exportadoEm: new Date().toISOString(),
      aviso: "Registro temporário de importação, decisões, salvamentos e auditorias. Não representa envio definitivo ao Sisagua.",
      resumo: {
        grupos: canonicalGroups.length,
        categorias: canonicalBatches.length,
        parametros: canonicalBatches.reduce((sum, item) => sum + (item.parametros?.length || 0), 0),
        revisoesPendentes: canonicalBatches.reduce((sum, item) => (
          sum + (item.revisoes || []).filter((review) => review.statusSisagua !== "SALVO_AUDITADO").length
        ), 0),
        itensSalvosAuditados: canonicalBatches.reduce((sum, item) => (
          sum
          + (item.parametros || []).filter((parameter) => parameter.statusSisagua === "SALVO_AUDITADO").length
          + (item.revisoes || []).filter((review) => review.statusSisagua === "SALVO_AUDITADO").length
        ), 0),
      },
      grupos: canonicalGroups,
    };
  }

  function downloadCanonicalRecord() {
    const payload = canonicalExportPayload();
    if (!payload.grupos.length) {
      setStatus("Não há lotes importados para exportar", "warning");
      return;
    }
    const timestamp = payload.exportadoEm.replace(/[:.]/g, "-");
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sisagua-registro-canonico-${timestamp}.json`;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    log(`✓ REGISTRO: exportado com ${payload.resumo.categorias} categoria(s) e ${payload.resumo.parametros} parâmetro(s).`);
    setStatus("Registro canônico exportado", "success");
  }

  exportButton.addEventListener("click", () => {
    if (!running) downloadCanonicalRecord();
  });
  
  helpButton.addEventListener("click", () => {
    logDetailsElement.open = true;
    logToggleElement.textContent = "Detalhes da execução";
    log(`--- AJUDA / INSTRUÇÕES RÁPIDAS ---
1. Selecione a Categoria no seletor acima.
2. Certifique-se de que a página correspondente no SISAGUA está aberta e no ponto correto.
3. Se necessário revisão prévia, revise os dados no painel amarelo e marque a confirmação.
4. Clique em "Preencher restantes" para preencher automaticamente.
5. Se precisar pausar, clique em "Parar" (salvamento parcial seguro será acionado).
6. Se houver itens de revisão ao final, analise, preencha o valor correto, selecione a checkbox do item e clique em "Confirmar e preencher selecionados".
7. Use "Exportar registro" para guardar o registro canônico temporário com decisões e auditorias.
8. A extensão nunca efetua o envio definitivo do lote.`);
    panelBodyElement.scrollTop = logDetailsElement.offsetTop - 8;
  });

  stopButton.addEventListener("click", () => {
    stopRequested = true;
    log("Parada solicitada.");
  });





  logCopyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(logElement.textContent).then(() => {
      const originalText = logCopyButton.textContent;
      logCopyButton.textContent = "✓ Copiado!";
      setTimeout(() => {
        logCopyButton.textContent = originalText;
      }, 2000);
    }).catch(err => {
      log(`✗ Erro ao copiar log: ${err.message}`);
    });
  });

  reviewToggleAll.addEventListener("click", () => {
    const checkboxes = [...reviewListElement.querySelectorAll(".sisagua-review-check")].filter(cb => !cb.disabled);
    allReviewsSelected = !allReviewsSelected;
    checkboxes.forEach(cb => cb.checked = allReviewsSelected);
    reviewToggleAll.textContent = allReviewsSelected ? "Desmarcar todos" : "Marcar todos";
    updateControlsState();
  });

  // Tab Logic
  const tabCategories = panel.querySelector("#sisagua-tab-categories");
  const tabImport = panel.querySelector("#sisagua-tab-import");
  const contentCategories = panel.querySelector("#sisagua-content-categories");
  const contentImport = panel.querySelector("#sisagua-content-import");

  function switchTab(tabId) {
    if (running && tabId === "import") return;
    if (tabId === "import") {
      tabCategories.classList.remove("active");
      tabImport.classList.add("active");
      contentCategories.classList.remove("active");
      contentImport.classList.add("active");
      tabCategories.setAttribute("aria-selected", "false");
      tabImport.setAttribute("aria-selected", "true");
    } else {
      tabImport.classList.remove("active");
      tabCategories.classList.add("active");
      contentImport.classList.remove("active");
      contentCategories.classList.add("active");
      tabImport.setAttribute("aria-selected", "false");
      tabCategories.setAttribute("aria-selected", "true");
    }
  }

  tabCategories.addEventListener("click", () => switchTab("categories"));
  tabImport.addEventListener("click", () => switchTab("import"));

  // Import Logic
  const extractBtn = panel.querySelector("#sisagua-import-extract");
  const generateBtn = panel.querySelector("#sisagua-import-generate");
  const textarea = panel.querySelector("#sisagua-import-textarea");
  const preview = panel.querySelector("#sisagua-import-preview");
  
  let extractedBatches = [];
  const IMPORT_STORAGE_KEY = "sisaguaImportedBatchesV2";
  const PERSISTED_UI_NAME_MIGRATIONS = new Map([
    [core.identityKey("Clordano Total"), "Clordano"],
    [core.identityKey("Nitrogênio Amoniacal"), "Nitrogênio Amoniacal Total"],
  ]);

  function migratePersistedUiNames(persistedBatches) {
    let changed = false;
    const migratedBatches = persistedBatches.map((persistedBatch) => {
      const migrations = [];
      const migrateNamedItem = (item, collection) => {
        if (!item?.nome) return;
        const replacement = PERSISTED_UI_NAME_MIGRATIONS.get(core.identityKey(item.nome));
        if (!replacement || replacement === item.nome) return;
        migrations.push({ collection, from: item.nome, to: replacement });
        item.nome = replacement;
        changed = true;
      };

      (persistedBatch.parametros || []).forEach((item) => migrateNamedItem(item, "parametros"));
      (persistedBatch.revisoes || []).forEach((item) => migrateNamedItem(item, "revisoes"));
      (persistedBatch._mappedInfo || []).forEach((item) => {
        const replacement = PERSISTED_UI_NAME_MIGRATIONS.get(core.identityKey(item?.sisagua));
        if (!replacement || replacement === item.sisagua) return;
        migrations.push({ collection: "_mappedInfo", from: item.sisagua, to: replacement });
        item.sisagua = replacement;
        changed = true;
      });

      if (migrations.length) {
        persistedBatch.auditTrail = Array.isArray(persistedBatch.auditTrail)
          ? persistedBatch.auditTrail
          : [];
        persistedBatch.auditTrail.push({
          auditedAt: new Date().toISOString(),
          reason: "migração do contrato de nomes da interface v2.0.4",
          result: "MIGRACAO_NOME_UI",
          migrations,
        });
      }
      return persistedBatch;
    });
    return { batches: migratedBatches, changed };
  }

  async function persistImportedBatches() {
    if (!globalThis.chrome?.storage?.local) {
      throw new Error("Armazenamento próprio da extensão indisponível.");
    }
    const importedOnly = batches.filter((item) => item.id?.startsWith("IMPORT-"));
    await chrome.storage.local.set({
      [IMPORT_STORAGE_KEY]: {
        schemaVersion: 2,
        baseId: LEGAL_BASE_ID,
        savedAt: new Date().toISOString(),
        batches: importedOnly,
      },
    });
  }

  async function readPersistedBatches() {
    if (!globalThis.chrome?.storage?.local) return [];
    const stored = await chrome.storage.local.get(IMPORT_STORAGE_KEY);
    const payload = stored?.[IMPORT_STORAGE_KEY];
    if (payload && Array.isArray(payload.batches)) {
      const migration = migratePersistedUiNames(payload.batches);
      if (migration.changed) {
        await chrome.storage.local.set({
          [IMPORT_STORAGE_KEY]: {
            ...payload,
            schemaVersion: 2,
            savedAt: new Date().toISOString(),
            batches: migration.batches,
          },
        });
        log("✓ PERSISTÊNCIA: nomes antigos migrados para o contrato de tela v2.0.4.");
      }
      return migration.batches;
    }

    // Migração conservadora: preserva dados antigos, mas não altera base_id nem
    // os considera válidos. A validação exigirá reimportação quando necessário.
    try {
      const legacyText = localStorage.getItem("sisagua-imported-batches");
      const legacy = legacyText ? JSON.parse(legacyText) : [];
      if (!Array.isArray(legacy) || !legacy.length) return [];
      const migration = migratePersistedUiNames(legacy);
      await chrome.storage.local.set({
        [IMPORT_STORAGE_KEY]: {
          schemaVersion: 1,
          migratedFromPageStorage: true,
          savedAt: new Date().toISOString(),
          batches: migration.batches,
        },
      });
      localStorage.removeItem("sisagua-imported-batches");
      return migration.batches;
    } catch (error) {
      throw new Error(`Falha ao migrar lotes antigos: ${error.message}`);
    }
  }

  extractBtn.addEventListener("click", () => {
    const text = textarea.value.trim();
    if (!text) return;
    
    function escapeHtml(unsafe) {
      return String(unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
    
    try {
      const result = parser.parseReport(text);
      extractedBatches = result.batches;
      const replacementGroups = new Set(extractedBatches.map((item) => item.importGroupId));
      const futureBatches = [
        ...batches.filter((item) => !replacementGroups.has(item.importGroupId)),
        ...extractedBatches,
      ];
      const validationErrors = extractedBatches.flatMap((item) =>
        validateBatch(item, futureBatches).map((message) => `${item.titulo}: ${message}`)
      );
      if (validationErrors.length) {
        throw new Error(`Lote extraído inválido:\n${validationErrors.join("\n")}`);
      }
      preview.style.color = "";
      preview.style.fontWeight = "";
      
      let html = `<div class="sisagua-import-card">
        <div class="sisagua-import-header">Cabeçalho Extraído</div>
        <div>Origem registrada automaticamente: <b>${escapeHtml(result.header.arquivoOrigem)}</b></div>
        <div>Amostra: <b>${escapeHtml(result.header.amostra) || "N/A"}</b></div>
        <div>Coleta: <b>${escapeHtml(result.header.dataColeta) || "N/A"}</b></div>
        <div>Ponto: <b>${escapeHtml(result.header.ponto) || "N/A"}</b></div>
      </div>`;
      
      let totalParams = 0;
      
      result.batches.forEach(b => {
        totalParams += b.parametros.length;
        html += `<div class="sisagua-import-card">
          <div class="sisagua-import-header">${escapeHtml(b.categoria)} (${b.parametros.length})</div>
          <table class="sisagua-import-table">
            <thead>
              <tr>
                <th>Nome SISAGUA</th>
                <th>Valor</th>
                <th>Avaliação</th>
              </tr>
            </thead>
            <tbody>`;
            
        b._mappedInfo.forEach(m => {
          html += `<tr>
            <td title="No laudo: ${escapeHtml(m.original)}"><span class="sisagua-status-ok">✓</span> ${escapeHtml(m.sisagua)}</td>
            <td>${escapeHtml(m.valor)}</td>
            <td>${escapeHtml(m.avaliacaoLegal)}</td>
          </tr>`;
        });
        
        html += `</tbody></table></div>`;
      });
      
      if (result.unmapped && result.unmapped.length > 0) {
        html += `<div class="sisagua-import-card">
          <div class="sisagua-import-header" style="color:var(--sisagua-warning)">Não Mapeados (${result.unmapped.length})</div>
          <ul style="margin:0; padding-left:16px;">`;
        result.unmapped.forEach(u => {
          html += `<li>${escapeHtml(u.originalName)} (${escapeHtml(u.originalValue)})</li>`;
        });
        html += `</ul></div>`;
      }

      if (result.ignored && result.ignored.length > 0) {
        html += `<div class="sisagua-import-card">
          <div class="sisagua-import-header" style="color:var(--sisagua-muted)">Não lançados automaticamente (${result.ignored.length})</div>
          <ul style="margin:0; padding-left:16px;">`;
        result.ignored.forEach(item => {
          html += `<li><b>${escapeHtml(item.originalName)}</b> (${escapeHtml(item.originalValue)}) — ${escapeHtml(item.reason)}</li>`;
        });
        html += `</ul></div>`;
      }

      if (result.duplicates && result.duplicates.length > 0) {
        html += `<div class="sisagua-import-card">
          <div class="sisagua-import-header" style="color:var(--sisagua-warning)">Duplicidades (${result.duplicates.length})</div>
          <ul style="margin:0; padding-left:16px;">`;
        result.duplicates.forEach((item) => {
          html += `<li>${escapeHtml(item.nome)} — ${escapeHtml(item.type)}</li>`;
        });
        html += `</ul></div>`;
      }
      
      preview.innerHTML = html;
      generateBtn.style.display = "block";
      
    } catch (e) {
      preview.textContent = `Erro ao extrair: ${e.message}`;
      preview.style.color = "var(--sisagua-danger)";
      preview.style.fontWeight = "bold";
      generateBtn.style.display = "none";
    }
  });
  
  generateBtn.addEventListener("click", async () => {
    if (!extractedBatches.length) return;
    if (running) return;
    const previousBatches = structuredClone(batches);
    
    // Substituir o grupo inteiro da mesma amostra. Isso remove categorias
    // obsoletas que uma versão anterior possa ter classificado incorretamente.
    const categorySuffix = /-(?:INORGANICOS|ORGANICOS|AGROTOXICOS|OUTROS|PRODUTOS_DESINFECCAO|RADIOATIVIDADE|ORGANOLEPTICOS)$/;
    const groupIdFor = (item) => item.importGroupId || String(item.id || "").replace(categorySuffix, "");
    const replacementGroups = new Set(extractedBatches.map(groupIdFor));
    const replacementIds = new Set(extractedBatches.map(item => item.id));
    batches = batches.filter(item => {
      if (!item.id?.startsWith("IMPORT-")) return true;
      return !replacementGroups.has(groupIdFor(item)) || replacementIds.has(item.id);
    });

    // Add to batches and persist
    extractedBatches.forEach(b => {
      // Avoid exact ID duplicates
      const existingIdx = batches.findIndex(ex => ex.id === b.id);
      if (existingIdx >= 0) {
        batches[existingIdx] = b;
      } else {
        batches.push(b);
      }
    });
    
    recomputeBatchValidation();
    try {
      await persistImportedBatches();
    } catch (error) {
      batches = previousBatches;
      recomputeBatchValidation();
      setStatus(`Importação não persistida: ${error.message}`, "danger");
      return;
    }
    
    // Re-render select
    renderBatchSelect();
    
    // Select the first of the newly added
    const firstImportedId = extractedBatches[0].id;
    const targetIdx = batches.findIndex(ex => ex.id === firstImportedId);
    if (targetIdx >= 0) {
      batchSelect.value = String(targetIdx);
      batchSelect.dispatchEvent(new Event("change"));
    }
    
    switchTab("categories");
    textarea.value = "";
    preview.innerHTML = "";
    generateBtn.style.display = "none";
    extractedBatches = [];
  });
  
  async function loadPersistedBatches() {
    try {
      const persisted = await readPersistedBatches();
      persisted.forEach((item) => {
        if (!item?.id) return;
        const existingIndex = batches.findIndex((existing) => existing.id === item.id);
        if (existingIndex >= 0) batches[existingIndex] = item;
        else batches.push(item);
      });
      recomputeBatchValidation();
      Object.entries(batchValidationErrors)
        .filter(([, errors]) => errors.length)
        .forEach(([batchId, errors]) => {
          log(`✗ LOTE PERSISTIDO INVÁLIDO ${batchId}:\n${errors.map((message) => `  - ${message}`).join("\n")}`);
        });
      if (!batch || !batches.includes(batch)) batch = batches[0] || null;
      renderBatchSelect();
      updateHeaderSub();
      updateControlsState();
      updateStartButton();
      renderBadges(batch);
      if (batch) batchSelect.value = String(batches.indexOf(batch));
    } catch (error) {
      log(`✗ PERSISTÊNCIA: ${error.message}`);
      setStatus("Falha ao carregar lotes persistidos", "danger");
    }
  }

  log(`Assistente SISAGUA v${EXTENSION_VERSION} carregado | base ${LEGAL_BASE_ID}`);
  void loadPersistedBatches();

})();
