const allowedTags = new Set([
  'p', 'h1', 'h2', 'h3', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'br', 'div',
]);

const droppedTags = new Set(['script', 'style', 'iframe', 'object', 'embed']);

const allowedProtocols = new Set(['http:', 'https:', 'mailto:']);

function clean(parent: Node): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      parent.removeChild(child);
      continue;
    }
    const element = child as Element;
    const tag = element.localName;
    if (droppedTags.has(tag)) {
      parent.removeChild(element);
      continue;
    }
    clean(element);
    if (allowedTags.has(tag)) {
      for (const name of element.getAttributeNames()) element.removeAttribute(name);
    } else {
      element.replaceWith(...Array.from(element.childNodes));
    }
  }
}

export function sanitizeBody(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  clean(doc.body);
  return doc.body.innerHTML;
}

export function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  try {
    return allowedProtocols.has(new URL(trimmed).protocol) ? trimmed : null;
  } catch {
    return null;
  }
}
