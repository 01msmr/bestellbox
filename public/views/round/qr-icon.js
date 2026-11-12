// QR-Symbol; bei Hover/Fokus wächst es nach links oben zum echten, scanbaren QR-Code
import { t } from '/i18n.js';
import { h } from '/util.js';
import { qrMatrix } from '/qr.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};

// Archetyp: drei Suchmuster und ein paar Punkte, dick und rund
function glyph() {
  const frame = (x, y) => [svg('rect', { x, y, width: 8, height: 8, rx: 2.4, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4 }), svg('rect', { x: x + 2.8, y: y + 2.8, width: 2.4, height: 2.4, rx: 0.8, fill: 'currentColor' })];
  const dot = (x, y) => svg('rect', { x, y, width: 3.4, height: 3.4, rx: 1.1, fill: 'currentColor' });
  return svg('svg', { viewBox: '0 0 24 24', width: '100%', height: '100%', 'aria-hidden': 'true', class: 'qr-glyph' }, ...frame(2, 2), ...frame(14, 2), ...frame(2, 14), dot(14, 14), dot(19.6, 14), dot(14, 19.6), dot(19.6, 19.6));
}

function code(text) {
  const m = qrMatrix(text);
  const q = 2;
  const path = m.flatMap((row, y) => row.map((v, x) => (v ? `M${x + q} ${y + q}h1v1h-1z` : ''))).join('');
  return svg('svg', { viewBox: `0 0 ${m.length + 2 * q} ${m.length + 2 * q}`, class: 'qr-big', role: 'img', 'aria-label': t('QR-Code zum Bezahlen'), 'shape-rendering': 'crispEdges' }, svg('rect', { width: m.length + 2 * q, height: m.length + 2 * q, fill: '#fff' }), svg('path', { d: path, fill: '#000' }));
}

export function qrIcon(text) {
  return h('span', { class: 'qr-pop', tabindex: '0', title: t('QR-Code zum Bezahlen') }, glyph(), code(text));
}
