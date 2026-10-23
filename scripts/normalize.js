function normalizeShortcuts(text) {
  let t = (text || '').trim();
  if (!t) return '';

  // 1. Convert CamelCase / PascalCase like SuperPlusM, CtrlPlusC, AltPlusTab, SuperPlusShiftPlusQ
  const patternPlus = /\b(Super|Ctrl|Control|Alt|Shift|Cmd|Command|Win|Windows|Meta)(?:Plus(?:Super|Ctrl|Control|Alt|Shift|Cmd|Command|Win|Windows|Meta|[A-Za-z0-9]|F[1-9]|F1[0-2]|Enter|Space|Tab|Esc|Escape|Backspace|Delete))+\b/gi;
  t = t.replace(patternPlus, (match) => {
    const parts = match.split(/Plus/i);
    return parts.map(p => p.length > 1 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toUpperCase()).join('+');
  });

  // 2. Convert spoken words like 'super plus m', 'control plus c'
  const patternSpoken = /\b(super|ctrl|control|alt|shift|cmd|command|win|windows|meta)\s+plus\s+([a-zA-Z0-9]+(?:\s+plus\s+[a-zA-Z0-9]+)*)\b/gi;
  t = t.replace(patternSpoken, (match) => {
    const words = match.split(/\s+plus\s+/i);
    return words.map(w => {
      const lower = w.toLowerCase();
      if (lower === 'control' || lower === 'ctrl') return 'Ctrl';
      if (['super', 'win', 'windows', 'meta', 'cmd', 'command', 'alt', 'shift', 'enter', 'space', 'tab', 'esc', 'escape'].includes(lower)) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return w.length === 1 ? w.toUpperCase() : w;
    }).join('+');
  });

  // Standardize Control+ to Ctrl+
  t = t.replace(/\bControl\+/g, 'Ctrl+');
  return t;
}

async function normalizeText(rawText) {
  return normalizeShortcuts(rawText);
}

module.exports = {
  normalizeText,
  normalizeShortcuts
};
