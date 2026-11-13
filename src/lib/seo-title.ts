/** Page title that fits a search result (about 60 characters): "<name> | <suffix>" when it fits, else the name alone, cut at a word boundary. */
export function fitTitle(name: string, suffix = "Neo Forge Technology", max = 62): string {
  const full = `${name} | ${suffix}`; if (full.length <= max) return full;
  if (name.length <= max) return name;
  const cut = name.slice(0, max - 1).replace(/\s+\S*$/, ""); return `${cut}…`;
}

/** Meta description of at most `max` characters, cut at a word boundary with an ellipsis. */
export function fitDescription(text: string, max = 158): string {
  const t = text.replace(/\s+/g, " ").trim(); if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/[\s,;:.\-–—]+\S*$/, "").replace(/[\s,;:.\-–—]+$/, "") + "…";
}
