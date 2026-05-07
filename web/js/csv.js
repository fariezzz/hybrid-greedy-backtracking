export function parseCsvObjects(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    return [];
  }
  const header = rows[0];
  return rows.slice(1).map((values) => {
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = values[idx] ?? "";
    });
    return obj;
  });
}

export function parseCsvRows(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return [];
  }
  return cleaned.split(/\r?\n/).map((line) => parseCsvLine(line));
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}
