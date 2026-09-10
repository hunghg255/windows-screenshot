import { validateImageSize } from '../../shared/image-import';
const elements = new Set('svg g defs path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask use symbol'.split(' '));
const attributes = new Set('id xmlns viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity clip-path clip-rule mask gradientUnits gradientTransform offset stop-color stop-opacity fx fy fr spreadMethod preserveAspectRatio href font-family font-size font-weight font-style text-anchor dominant-baseline dx dy rotate letter-spacing word-spacing xml:space version'.split(' '));
export function svgSource(bytes: Uint8Array) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (source.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG is too complex or contains unsupported XML declarations.');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Invalid SVG image.');
  const nodes = Array.from(root.querySelectorAll('*'));
  if (nodes.length > 2000) throw new Error('SVG has too many elements.');
  const ids = new Map<string, Element>();
  for (const element of [root, ...nodes]) {
    if (!elements.has(element.localName) || element.namespaceURI !== root.namespaceURI) throw new Error(`Unsupported SVG element: ${element.localName}. Use a static, self-contained SVG.`);
    let depth = 0; for (let p = element.parentElement; p; p = p.parentElement) depth++;
    if (depth > 32) throw new Error('SVG nesting is too deep.');
    if (element.id) { if (ids.has(element.id)) throw new Error('SVG contains duplicate IDs.'); ids.set(element.id, element); }
    for (const attr of Array.from(element.attributes)) {
      if (attr.name === 'xmlns' || attr.name === 'xmlns:xlink' || attr.name === 'xml:space') continue;
      if (attr.name === 'style') {
        // Accept ordinary presentation styles, then serialize them as attributes.
        for (const declaration of attr.value.split(';').filter(v => v.trim())) {
          const colon = declaration.indexOf(':'), key = declaration.slice(0, colon).trim(), value = declaration.slice(colon + 1).trim();
          if (colon < 0 || !attributes.has(key) || ['href', 'id', 'xmlns'].includes(key)) throw new Error('Unsupported SVG style.');
          checkValue(key, value); element.setAttribute(key, value);
        }
        element.removeAttribute('style'); continue;
      }
      if (!attributes.has(attr.localName)) throw new Error(`Unsupported SVG attribute: ${attr.name}.`);
      checkValue(attr.localName, attr.value);
    }
  }
  // Bound expanded <use> trees, including references back to an ancestor.
  let visits = 0;
  const visit = (element: Element, ancestors: Set<Element>) => {
    if (++visits > 10000 || ancestors.has(element)) throw new Error('SVG references are cyclic or too complex.');
    const next = new Set(ancestors).add(element);
    for (const child of element.children) visit(child, next);
    if (element.localName === 'use') {
      const href = element.getAttribute('href') ?? element.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      const target = href && ids.get(href.slice(1));
      if (!target) throw new Error('SVG contains a missing reference.');
      visit(target, next);
    }
  };
  visit(root, new Set());
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0)) throw new Error('Invalid SVG viewBox.');
  const length = (name: string, fallback?: number) => {
    const value = root.getAttribute(name);
    if (!value || value.endsWith('%')) return fallback ?? 0;
    const match = /^([\d.+-]+)(px|in|cm|mm|pt|pc)?$/.exec(value.trim());
    return match ? Number(match[1]) * ({ px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 }[match[2] || 'px'] ?? 1) : 0;
  };
  const width = length('width', vb?.[2]), height = length('height', vb?.[3]);
  validateImageSize(width, height);
  root.setAttribute('width', String(width)); root.setAttribute('height', String(height));
  return { source: new XMLSerializer().serializeToString(root), width, height };
}
function checkValue(name: string, value: string) {
  if (value.length > 200000 || /[\\<>]|@|\/\*/.test(value)) throw new Error('Unsupported SVG value.');
  if (name === 'href' && !/^#[\w.-]+$/.test(value)) throw new Error('SVG must not reference external resources.');
  const withoutLocalUrls = value.replace(/url\(\s*['"]?#[\w.-]+['"]?\s*\)/gi, '');
  if (/url\s*\(|(?:https?|file|data|javascript):/i.test(withoutLocalUrls)) throw new Error('SVG must not reference external resources.');
}
