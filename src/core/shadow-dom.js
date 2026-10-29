/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function queryAllDeep(root, selector) {
  /** @type {Element[]} */
  const found = [];
  const visit = (node) => {
    if (!(node instanceof Element || node instanceof DocumentFragment)) return;
    if (node instanceof Element && node.matches?.(selector)) found.push(node);
    const scope = node instanceof Document ? node.documentElement : node;
    scope.querySelectorAll?.(selector).forEach((el) => {
      if (!found.includes(el)) found.push(el);
    });
    scope.querySelectorAll?.('*').forEach((el) => {
      if (el.shadowRoot) visit(el.shadowRoot);
    });
  };
  visit(root);
  return found;
}

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element | null}
 */
export function queryDeep(root, selector) {
  return queryAllDeep(root, selector)[0] ?? null;
}
