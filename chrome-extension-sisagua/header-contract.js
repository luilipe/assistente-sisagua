globalThis.SISAGUA_HEADER_CONTRACT = (() => {
  "use strict";

  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const parameterKey = (value) => normalize(value)
    .replace(/\btotais\b/g, "total")
    .replace(/[^a-z0-9]+/g, "");

  const unitPattern = "(?:mg\\/L|[µμu]g\\/L|[µμu]S\\/cm|uH|uT|NTU|CU|Bq\\/L|Intensidade)";
  const trailingUnitRegex = new RegExp(`\\s+${unitPattern}\\s*$`, "i");
  const unitRegex = new RegExp(`(?:^|\\s)(${unitPattern})(?=\\s|$)`, "ig");

  const aliases = new Map([
    [parameterKey("Clordano Total"), ["Clordano"]],
    [parameterKey("Nitrogênio Amoniacal"), ["Nitrogênio Amoniacal Total"]],
  ]);

  const controlledExpansions = new Set([
    parameterKey("Atrazina + S-Clorotriazinas"),
  ]);

  function parameterNameFromText(text) {
    return String(text || "")
      .replace(/\s*-\s*VMP\b.*$/i, "")
      .replace(/\s*-\s*Status:\s*[SN].*$/i, "")
      .replace(trailingUnitRegex, "")
      .trim();
  }

  function unitFromText(text) {
    const withoutStatus = String(text || "").replace(/\s*-\s*Status:\s*[SN].*$/i, "");
    const matches = [...withoutStatus.matchAll(unitRegex)];
    return matches.at(-1)?.[1] || "";
  }

  function unitKey(value) {
    const compact = normalize(value).replace(/\s+/g, "");
    const keys = new Map([
      ["μg/l", "ug/l"], ["µg/l", "ug/l"], ["ug/l", "ug/l"],
      ["mg/l", "mg/l"],
      ["μs/cm", "us/cm"], ["µs/cm", "us/cm"], ["us/cm", "us/cm"],
      ["ntu", "turbidity"], ["ut", "turbidity"],
      ["cu", "color"], ["uh", "color"],
      ["bq/l", "bq/l"],
      ["intensidade", "intensidade"],
    ]);
    return keys.get(compact) || compact;
  }

  function unitsEquivalent(left, right) {
    if (!left || !right) return true;
    return unitKey(left) === unitKey(right);
  }

  function makeResolution(status, target, matches, mode = "") {
    return {
      status,
      target,
      mode,
      header: status === "RESOLVED" ? matches[0].header : null,
      screenName: status === "RESOLVED" ? matches[0].screenName : "",
      matches: matches.map((match) => match.screenName),
    };
  }

  function resolve(name, headers, getText = (header) => header?.textContent || "") {
    const targetKey = parameterKey(name);
    const candidates = [...headers].map((header) => {
      const text = String(getText(header) || "");
      const screenName = parameterNameFromText(text);
      return { header, text, screenName, key: parameterKey(screenName) };
    });

    const exact = candidates.filter((candidate) => candidate.key === targetKey);
    if (exact.length === 1) return makeResolution("RESOLVED", name, exact, "EXACT");
    if (exact.length > 1) return makeResolution("AMBIGUOUS", name, exact, "EXACT");

    const aliasKeys = new Set((aliases.get(targetKey) || []).map(parameterKey));
    const aliasMatches = candidates.filter((candidate) => aliasKeys.has(candidate.key));
    if (aliasMatches.length === 1) return makeResolution("RESOLVED", name, aliasMatches, "ALIAS");
    if (aliasMatches.length > 1) return makeResolution("AMBIGUOUS", name, aliasMatches, "ALIAS");

    if (controlledExpansions.has(targetKey)) {
      const normalizedTarget = normalize(name);
      const expanded = candidates.filter((candidate) => (
        normalize(candidate.screenName).startsWith(`${normalizedTarget} (`)
      ));
      if (expanded.length === 1) return makeResolution("RESOLVED", name, expanded, "CONTROLLED_EXPANSION");
      if (expanded.length > 1) {
        return makeResolution("AMBIGUOUS", name, expanded, "CONTROLLED_EXPANSION");
      }
    }

    return makeResolution("MISSING", name, []);
  }

  return {
    aliases,
    controlledExpansions,
    normalize,
    parameterKey,
    parameterNameFromText,
    unitFromText,
    unitsEquivalent,
    resolve,
  };
})();
