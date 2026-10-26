/**
 * @param {Document} doc
 * @returns {object[]}
 */
export function readJsonLdObjects(doc) {
  const out = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent || '');
      if (Array.isArray(data)) out.push(...data);
      else out.push(data);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * @param {unknown} node
 * @param {(obj: Record<string, unknown>) => void} visit
 */
export function walkJson(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkJson(child, visit);
    return;
  }
  visit(node);
  for (const value of Object.values(node)) walkJson(value, visit);
}
