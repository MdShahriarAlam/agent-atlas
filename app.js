const L = window.LESSONS;
const $ = id => document.getElementById(id);
const svg = $('svg');
const done = new Set(JSON.parse(localStorage.getItem('atlas-done') || '[]'));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let cur, paused = false;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Lesson files use compact grid coordinates; spread them so labels have room. Object sizes stay the same.
const SPREAD = 1.2;
for (const l of L) {
  for (const nd of Object.values(l.nodes)) { nd.x *= SPREAD; nd.y *= SPREAD; }
  for (const z of Object.values(l.zones || {})) for (const k of ['x0', 'y0', 'x1', 'y1']) z[k] *= SPREAD;
}

// Self-check: every id a step references must exist in its lesson.
for (const l of L) for (const s of l.steps) {
  const ids = [...(s.show || []), ...(s.hide || []), ...Object.keys(s.state || {}), ...Object.keys(s.callouts || {}), ...(s.flows || []).flatMap(f => f.slice(0, 2))];
  for (const id of ids) console.assert(l.nodes[id] || l.zones?.[id], `${l.id}: unknown id "${id}"`);
  console.assert(s.short, `${l.id}: step "${s.title}" has no short label`);
}
// Every message and speech bubble must point at an object already on stage at that step.
for (const l of L) l.steps.forEach((s, i) => {
  const shown = new Set();
  for (const t of l.steps.slice(0, i + 1)) { (t.show || []).forEach(x => shown.add(x)); (t.hide || []).forEach(x => shown.delete(x)); }
  for (const id of [...(s.flows || []).flatMap(f => f.slice(0, 2)), ...Object.keys(s.callouts || {})])
    console.assert(shown.has(id), `${l.id} step ${i + 1}: "${id}" is used before it is shown`);
});
for (const l of L) for (const s of l.steps) for (const fl of s.flows || []) {
  console.assert(['req', 'res', 'hs'].includes(fl[2]), `${l.id}: bad flow kind in "${s.title}"`);
  console.assert(fl[4], `${l.id}: a message in "${s.title}" has no caption`);
}
for (const l of L) {
  console.assert(!l.noteSections || l.noteSections.length === l.steps.length, `${l.id}: noteSections must have one entry per step`);
  console.assert(!l.notePath || window.NOTES.includes(l.notePath), `${l.id}: notePath not in notes/manifest.js`);
}
for (const l of L) for (const q of l.quiz || []) console.assert(q.options[q.answer] !== undefined && q.why, `${l.id}: bad quiz item "${q.q}"`);

/* ---------- Isometric drawing ---------- */
const S = 30, C30 = 0.866;
const P = (x, y, z = 0) => [(x - y) * S * C30, (x + y) * S * 0.5 - z * S];
const f = n => n.toFixed(1);
const poly = (pts, cls) => `<polygon class="${cls}" points="${pts.map(p => f(p[0]) + ',' + f(p[1])).join(' ')}"/>`;

function box(x, y, z, w, d, h, cls = '') {
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - d / 2, y1 = y + d / 2, z1 = z + h;
  return `<g class="${cls}">` +
    poly([P(x1, y0, z), P(x1, y1, z), P(x1, y1, z1), P(x1, y0, z1)], 'fr') +
    poly([P(x0, y1, z), P(x1, y1, z), P(x1, y1, z1), P(x0, y1, z1)], 'fl') +
    poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], 'ft') + '</g>';
}

function hex(x, y, z, r, h) {
  const v = [...Array(6)].map((_, k) => [x + r * Math.cos(k * Math.PI / 3), y + r * Math.sin(k * Math.PI / 3)]);
  let out = '';
  for (let k = 0; k < 6; k++) {
    const n = k * Math.PI / 3 + Math.PI / 6, a = v[k], b = v[(k + 1) % 6];
    if (Math.cos(n) + Math.sin(n) <= 0) continue; // faces away from the viewer
    out += poly([P(a[0], a[1], z), P(b[0], b[1], z), P(b[0], b[1], z + h), P(a[0], a[1], z + h)], Math.cos(n) > Math.sin(n) ? 'fr' : 'fl');
  }
  return out + poly(v.map(p => P(p[0], p[1], z + h)), 'ft');
}

function cyl(x, y, z, r, h) {
  const [bx, by] = P(x, y, z), [tx, ty] = P(x, y, z + h), rx = 1.2247 * r * S, ry = 0.7071 * r * S;
  return `<path class="fl" d="M${f(bx - rx)},${f(by)} A${f(rx)},${f(ry)} 0 0 0 ${f(bx + rx)},${f(by)} L${f(tx + rx)},${f(ty)} A${f(rx)},${f(ry)} 0 0 1 ${f(tx - rx)},${f(ty)}Z"/>` +
    `<ellipse class="ft" cx="${f(tx)}" cy="${f(ty)}" rx="${f(rx)}" ry="${f(ry)}"/>`;
}

const PAD_H = 0.22;
// Each kind: drawn height (grid units) and a draw function. Hex/cube carry their label on top.
const KINDS = {
  laptop: { h: 1.15, draw(x, y, z) {
    const y0 = y - 0.55;
    // a point on the tilted screen: u across (−1…1), v up (0…1)
    const S2 = (u, v) => P(x + u * 0.56, y0 - 0.03 - v * 0.17, z + 0.2 + v * 0.76);
    const bar = (u0, u1, v, cls) => poly([S2(u0, v), S2(u1, v), S2(u1, v + 0.07), S2(u0, v + 0.07)], cls);
    return box(x, y, z, 1.5, 1.1, 0.08, 'metal') +
      poly([P(x - 0.6, y - 0.42, z + 0.081), P(x + 0.6, y - 0.42, z + 0.081), P(x + 0.6, y + 0.12, z + 0.081), P(x - 0.6, y + 0.12, z + 0.081)], 'keys') +
      poly([P(x - 0.22, y + 0.2, z + 0.081), P(x + 0.22, y + 0.2, z + 0.081), P(x + 0.22, y + 0.42, z + 0.081), P(x - 0.22, y + 0.42, z + 0.081)], 'keys') +
      poly([P(x - 0.74, y0, z + 0.08), P(x + 0.74, y0, z + 0.08), P(x + 0.74, y0 - 0.22, z + 1.08), P(x - 0.74, y0 - 0.22, z + 1.08)], 'bezel') +
      poly([P(x - 0.63, y0 - 0.02, z + 0.17), P(x + 0.63, y0 - 0.02, z + 0.17), P(x + 0.63, y0 - 0.2, z + 0.99), P(x - 0.63, y0 - 0.2, z + 0.99)], 'display') +
      bar(-0.85, -0.2, 0.78, 'code c1') + bar(-0.7, 0.3, 0.6, 'code c2') + bar(-0.7, 0.05, 0.44, 'code c3') + bar(-0.85, 0.55, 0.27, 'code c2') + bar(-0.7, -0.1, 0.1, 'code c1');
  } },
  person: { h: 1.45, draw(x, y, z) {
    const [ax, ay] = P(x, y, z);
    return `<path class="person" d="M${f(ax - 13)},${f(ay)} q0,-28 13,-28 q13,0 13,28z"/><circle class="person" cx="${f(ax)}" cy="${f(ay - 37)}" r="9.5"/>`;
  } },
  cube: { h: 1.1, top: true, draw(x, y, z) {
    let out = box(x, y, z, 1.45, 1.45, 1.1);
    // a small network of "neurons" on the left face, stripes on the right face
    const nodes = [[-0.45, 0.3], [-0.45, 0.75], [0, 0.18], [0, 0.55], [0, 0.9], [0.45, 0.35], [0.45, 0.78]].map(([u, v]) => P(x + u, y + 0.726, z + v));
    for (const [a, b] of [[0, 2], [0, 3], [1, 3], [1, 4], [2, 5], [3, 5], [3, 6], [4, 6]])
      out += `<line class="synapse" x1="${f(nodes[a][0])}" y1="${f(nodes[a][1])}" x2="${f(nodes[b][0])}" y2="${f(nodes[b][1])}"/>`;
    for (const [nx, ny] of nodes) out += `<circle class="neuron" cx="${f(nx)}" cy="${f(ny)}" r="2.6"/>`;
    for (const v of [0.3, 0.55, 0.8]) out += poly([P(x + 0.726, y - 0.5, z + v), P(x + 0.726, y + 0.5, z + v), P(x + 0.726, y + 0.5, z + v + 0.06), P(x + 0.726, y - 0.5, z + v + 0.06)], 'stripe');
    return out;
  } },
  hex: { h: 0.6, top: true, draw(x, y, z) {
    const inner = [...Array(6)].map((_, k) => P(x + 0.78 * Math.cos(k * Math.PI / 3), y + 0.78 * Math.sin(k * Math.PI / 3), z + 0.6));
    return hex(x, y, z, 1.0, 0.6) + poly(inner, 'inner');
  } },
  db: { h: 1.0, draw(x, y, z) {
    let out = '';
    for (let k = 0; k < 3; k++) {
      out += cyl(x, y, z + k * 0.36, 0.75, 0.28);
      const [lx, ly] = P(x + 0.5, y + 0.5, z + k * 0.36 + 0.13);
      out += `<circle class="led" cx="${f(lx)}" cy="${f(ly)}" r="2.3"/>`;
    }
    return out;
  } },
  docs: { h: 0.45, draw(x, y, z) {
    let out = '';
    [[-0.12, 0.1], [0, 0], [0.12, -0.1]].forEach(([dx, dy], k) => { out += box(x + dx, y + dy, z + k * 0.12, 1.05, 1.3, 0.06, 'paper'); });
    const zt = z + 0.301;
    for (const r of [-0.35, -0.12, 0.11, 0.34]) out += poly([P(x - 0.3, y - 0.1 + r, zt), P(x + 0.45, y - 0.1 + r, zt), P(x + 0.45, y - 0.04 + r, zt), P(x - 0.3, y - 0.04 + r, zt)], 'ink-line');
    return out;
  } },
  rack: { h: 1.25, draw(x, y, z) {
    let out = '';
    for (let k = 0; k < 3; k++) {
      const zk = z + k * 0.42;
      out += box(x, y, zk, 1.25, 1.05, 0.34);
      const [lx, ly] = P(x - 0.3, y + 0.525, zk + 0.17);
      out += `<circle class="led" cx="${f(lx)}" cy="${f(ly)}" r="2.4"/>`;
      for (const v of [0.11, 0.21]) out += poly([P(x - 0.1, y + 0.526, zk + v), P(x + 0.5, y + 0.526, zk + v), P(x + 0.5, y + 0.526, zk + v + 0.035), P(x - 0.1, y + 0.526, zk + v + 0.035)], 'slot');
    }
    return out;
  } },
};

// Label placement: every label reserves a rect; flow labels try spots along/around their curve until one is free.
let occupied = [], nodeText = '';
const hits = (r, m = 3) => occupied.some(o => r[0] < o[0] + o[2] + m && r[0] + r[2] + m > o[0] && r[1] < o[1] + o[3] + m && r[1] + r[3] + m > o[1]);
const reserve = r => { occupied.push(r); return r; };

function nodeSVG(id, nd, st, fresh) {
  const k = KINDS[nd.kind], z = PAD_H;
  const [bx, by] = P(nd.x + 1.1, nd.y + 1.1, 0); // front corner of the pad
  const sh = [P(nd.x - 1.0, nd.y - 0.9), P(nd.x + 1.35, nd.y - 0.9), P(nd.x + 1.35, nd.y + 1.45), P(nd.x - 1.0, nd.y + 1.45)];
  const tip = nd.info ? ` tabindex="0" role="button" aria-label="About ${esc(nd.label)}"` : '';
  let out = `<g class="node ${st}${fresh ? ' new' : ''}${nd.info ? ' has-info' : ''}" data-id="${id}"${tip} style="--c:${nd.color || 'var(--n-default)'}">` +
    poly(sh, 'shadow') + box(nd.x, nd.y, 0, 2.2, 2.2, PAD_H, 'pad') + k.draw(nd.x, nd.y, z);
  const [ox, oy] = P(nd.x, nd.y, z);
  reserve([ox - 42, oy - k.h * S - 6, 84, k.h * S + 14]); // the object itself
  // All text goes to the top layer (nodeText) so an object drawn later can never cover it.
  if (k.top) {
    const [tx, ty] = P(nd.x, nd.y, z + k.h);
    nodeText += `<g class="ntop-g" data-id="${id}"><text class="ntop" x="${f(tx)}" y="${f(ty + (nd.sub ? -1 : 4))}">${esc(nd.label)}</text>` +
      (nd.sub ? `<text class="ntop-sub" x="${f(tx)}" y="${f(ty + 11)}">${esc(nd.sub)}</text>` : '') + '</g>';
    const w = Math.max(nd.label.length * 7.5, (nd.sub || '').length * 6.2) + 10;
    reserve([tx - w / 2, ty - 12, w, 28]);
  } else {
    const txt = nd.sub ? `${nd.label} · ${nd.sub}` : nd.label, w = txt.length * 6.8 + 20;
    nodeText += `<g class="tag-pill${nd.info ? ' has-info' : ''}" data-id="${id}"><rect x="${f(bx - w / 2)}" y="${f(by + 4)}" width="${f(w)}" height="20" rx="10"/><text x="${f(bx)}" y="${f(by + 18)}">${esc(txt)}</text></g>`;
    reserve([bx - w / 2, by + 4, w, 20]);
  }
  if (st) {
    const word = { hot: 'overloaded', warn: 'at risk', down: 'offline', ok: 'ok' }[st] || st, sy = by + (k.top ? 18 : 40);
    nodeText += `<text class="nstate ${st}" x="${f(bx)}" y="${f(sy)}">● ${word}</text>`;
    reserve([bx - 45, sy - 11, 90, 14]);
  }
  return out + '</g>';
}

function callout(nd, text) {
  const [x, y] = P(nd.x, nd.y, PAD_H + KINDS[nd.kind].h + 0.55), w = text.length * 6.9 + 26;
  reserve([x - w / 2, y - 24, w, 31]);
  return `<g class="callout"><rect x="${f(x - w / 2)}" y="${f(y - 24)}" width="${f(w)}" height="24" rx="12"/>` +
    `<path d="M${f(x - 6)},${f(y)} L${f(x)},${f(y + 7)} L${f(x + 6)},${f(y)}"/><text x="${f(x)}" y="${f(y - 8)}">${esc(text)}</text></g>`;
}

function drawDiagram(lesson, i) {
  const step = lesson.steps[i], N = lesson.nodes, Z = lesson.zones || {};
  occupied = []; nodeText = '';
  $('info').hidden = true;
  const shown = new Set();
  for (const s of lesson.steps.slice(0, i + 1)) { (s.show || []).forEach(id => shown.add(id)); (s.hide || []).forEach(id => shown.delete(id)); }
  const state = [...lesson.steps.slice(0, i + 1)].reverse().find(s => s.state)?.state || {};
  const fresh = new Set(step.show || []);
  const anchor = id => P(N[id].x, N[id].y, PAD_H + KINDS[N[id].kind].h * 0.6);

  let out = `<defs><filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>${['req', 'res', 'hs'].map(k => `<marker id="m-${k}" class="mk ${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z"/></marker>`).join('')}</defs>`;

  for (const [id, z] of Object.entries(Z)) if (shown.has(id)) {
    const [lx, ly] = P(z.x0, z.y0);
    reserve([lx - z.label.length * 5, ly - 20, z.label.length * 10, 16]);
    out += `<g class="zone${fresh.has(id) ? ' new' : ''}${z.info ? ' has-info' : ''}" data-id="${id}"${z.info ? ` tabindex="0" role="button" aria-label="About ${esc(z.label)}"` : ''}>${poly([P(z.x0, z.y0), P(z.x1, z.y0), P(z.x1, z.y1), P(z.x0, z.y1)], 'zone-floor')}<text x="${f(lx)}" y="${f(ly - 8)}">${esc(z.label)}</text></g>`;
  }
  for (const [a, b] of lesson.links || []) if (shown.has(a) && shown.has(b)) {
    const p = P(N[a].x, N[a].y), q = P(N[b].x, N[b].y);
    out += `<line class="link" x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}"/>`;
  }
  // painter's order: back to front
  for (const id of [...shown].filter(id => N[id]).sort((a, b) => (N[a].x + N[a].y) - (N[b].x + N[b].y)))
    out += nodeSVG(id, N[id], state[id] || '', fresh.has(id));

  let labels = nodeText;
  for (const [id, text] of Object.entries(step.callouts || {})) if (N[id] && shown.has(id)) labels += callout(N[id], text);
  // Flows play one at a time (see the timeline below). Only the live flow's label shows,
  // so labels avoid objects and callouts but may share space with each other.
  const flows = step.flows || [], fixed = occupied.length, flowRects = [];
  flows.forEach(([a, b, kind, label], k) => {
    const p = anchor(a), q = anchor(b), dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    const bend = 22 + len * 0.12, cx = (p[0] + q[0]) / 2 - dy / len * bend, cy = (p[1] + q[1]) / 2 + dx / len * bend;
    const trim = (s, t) => { const ex = t[0] - s[0], ey = t[1] - s[1], l = Math.hypot(ex, ey) || 1; return [s[0] + ex / l * 20, s[1] + ey / l * 20]; };
    const s0 = trim(p, [cx, cy]), s1 = trim(q, [cx, cy]);
    const d = `M${f(s0[0])},${f(s0[1])} Q${f(cx)},${f(cy)} ${f(s1[0])},${f(s1[1])}`;
    out += `<g class="flow ${kind}" data-k="${k}"><path class="trail" d="${d}" marker-end="url(#m-${kind})"/><circle class="pkt" r="6.5" cx="${f(s0[0])}" cy="${f(s0[1])}"/></g>`;
    if (label) {
      const w = label.length * 6.3 + 18, nx = -dy / len, ny = dx / len;
      const at = t => [(1 - t) ** 2 * s0[0] + 2 * (1 - t) * t * cx + t * t * s1[0], (1 - t) ** 2 * s0[1] + 2 * (1 - t) * t * cy + t * t * s1[1]];
      // first free spot wins; if none is free, take the spot that overlaps the fewest labels
      let best, bestN = Infinity;
      const overlaps = r => occupied.slice(0, fixed).filter(o => r[0] < o[0] + o[2] + 3 && r[0] + r[2] + 3 > o[0] && r[1] < o[1] + o[3] + 3 && r[1] + r[3] + 3 > o[1]).length;
      search: for (const off of [0, 18, -18, 36, -36, 56, -56, 78, -78, 100, -100])
        for (const t of [0.5, 0.38, 0.62, 0.28, 0.72]) {
          const [px, py] = at(t), r = [px + nx * off - w / 2, py + ny * off - 10, w, 20], n = overlaps(r);
          if (n < bestN) { best = r; bestN = n; }
          if (!n) break search;
        }
      flowRects.push(best);
      labels += `<g class="flabel ${kind}" data-k="${k}"><rect x="${f(best[0])}" y="${f(best[1])}" width="${f(w)}" height="20" rx="10"/><text x="${f(best[0] + w / 2)}" y="${f(best[1] + 14)}">${esc(label)}</text></g>`;
    }
  });

  // Camera: fit what this step shows (objects, zones and every label), with a minimum size so it never zooms in too far.
  const pts = [...occupied, ...flowRects].flatMap(r => [[r[0], r[1]], [r[0] + r[2], r[1] + r[3]]]);
  for (const id of shown) {
    if (N[id]) pts.push(P(N[id].x - 1.1, N[id].y + 1.1), P(N[id].x + 1.1, N[id].y - 1.1), P(N[id].x - 1.1, N[id].y - 1.1), P(N[id].x + 1.1, N[id].y + 1.1));
    if (Z[id]) { const z = Z[id]; pts.push(P(z.x0, z.y0), P(z.x1, z.y1), P(z.x1, z.y0), P(z.x0, z.y1)); }
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  // extra room at the bottom for the message caption that overlays the stage
  let x0 = Math.min(...xs) - 24, x1 = Math.max(...xs) + 24, y0 = Math.min(...ys) - 18, y1 = Math.max(...ys) + 56;
  const MINW = 520, MINH = 300;
  if (x1 - x0 < MINW) { const c = (x0 + x1) / 2; x0 = c - MINW / 2; x1 = c + MINW / 2; }
  if (y1 - y0 < MINH) { const c = (y0 + y1) / 2; y0 = c - MINH / 2; y1 = c + MINH / 2; }

  svg.innerHTML = out + labels;
  // Size every label box to its real text width (the estimates above are only for placement).
  for (const g of svg.querySelectorAll('.tag-pill, .flabel, .callout')) {
    const r = g.querySelector('rect'), t = g.querySelector('text'), pad = g.classList.contains('callout') ? 26 : 20;
    const w = t.getComputedTextLength() + pad, cx = +t.getAttribute('x');
    r.setAttribute('width', f(w)); r.setAttribute('x', f(cx - w / 2));
  }
  moveCamera([x0, y0, x1 - x0, y1 - y0]);
  setupBeats(flows.map((fl, k) => ({
    a: fl[0], b: fl[1], el: svg.querySelector(`.flow[data-k="${k}"]`), lab: svg.querySelector(`.flabel[data-k="${k}"]`),
    caption: captionOf(lesson, fl),
  })));
}

const captionOf = (lesson, [a, b, , label, note]) => note || `${lesson.nodes[a].label} → ${lesson.nodes[b].label}${label ? ': ' + label : ''}`;

/* ---------- Timeline: one message at a time ---------- */
const BEAT = 1500, TRAVEL = 1000, REST = 1200, MIN_DWELL = 6000;
let beats = [], clock = 0, lastNow = null, lastK = -1, speed = 1, autoplay = false;
function setupBeats(list) {
  beats = list.map(b => ({ ...b, path: b.el.querySelector('.trail'), pkt: b.el.querySelector('.pkt') }));
  beats.forEach(b => { b.len = b.path.getTotalLength(); });
  for (const g of svg.querySelectorAll('.node[data-id]')) g.classList.remove('active');
  lastK = -1;
  $('beat').hidden = !beats.length;
  replay();
  if (reduceMotion) { clock = TRAVEL; togglePause(true); }
}
// Voice: read each caption aloud with the browser's speech engine; the timeline waits at the
// end of a message's trip until its sentence has finished.
let voice = false, speaking = false;
function say(text) {
  if (!voice || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = Math.min(speed, 1.6);
  u.onend = u.onerror = () => { speaking = false; };
  speaking = true;
  speechSynthesis.speak(u);
}
function setVoice(on) {
  voice = on && !!window.speechSynthesis;
  $('voice').setAttribute('aria-pressed', voice);
  $('voice').textContent = voice ? '🔊 Voice on' : '🔈 Voice';
  if (!voice) { window.speechSynthesis?.cancel(); speaking = false; } else lastK = -1; // re-announce the current message
}
function frame(now) {
  const holding = voice && speaking && beats.length && (clock % (beats.length * BEAT + REST)) - lastK * BEAT >= TRAVEL;
  if (lastNow !== null && !paused && !holding) clock += (now - lastNow) * speed;
  lastNow = now;
  // Autoplay: once every message of this step has played (and the reader had MIN_DWELL), move on.
  if (autoplay && !paused && !cur.quiz && clock >= Math.max(beats.length * BEAT + REST, MIN_DWELL, cur.readMs)) {
    if (cur.i < cur.lesson.steps.length - 1) go(cur.i + 1); else setAutoplay(false);
    clock = 0;
  }
  if (beats.length) {
    const cycle = beats.length * BEAT + REST, t = clock % cycle;
    const k = Math.min(Math.floor(t / BEAT), beats.length - 1), p = Math.min((t - k * BEAT) / TRAVEL, 1);
    const b = beats[k], pt = b.path.getPointAtLength(p * b.len);
    b.pkt.setAttribute('cx', f(pt.x)); b.pkt.setAttribute('cy', f(pt.y));
    if (k !== lastK) {
      lastK = k;
      beats.forEach((x, j) => {
        x.el.classList.toggle('live', j === k); x.el.classList.toggle('past', j < k);
        x.lab?.classList.toggle('live', j === k);
      });
      for (const g of svg.querySelectorAll('.node[data-id]')) g.classList.toggle('active', g.dataset.id === b.a || g.dataset.id === b.b);
      $('beat-text').innerHTML = `<b>${k + 1}/${beats.length}</b> ${esc(b.caption)}`;
      if (!paused) say(b.caption);
      document.querySelectorAll('#beatlist li').forEach((li, j) => { li.classList.toggle('live', j === k); li.classList.toggle('past', j < k); });
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function stepBeat(d) {
  if (beats.length) jumpBeat(((lastK + d) % beats.length + beats.length) % beats.length);
}
function jumpBeat(k) {
  clock = k * BEAT + TRAVEL; // land at the end of that message's trip
  togglePause(true);
}
function setAutoplay(on) {
  autoplay = on;
  $('auto').setAttribute('aria-pressed', on);
  $('auto').innerHTML = on ? '❚❚ Stop autoplay' : '▶ Autoplay';
  if (on) togglePause(false);
}

// Smoothly pan/zoom the viewBox; jump when motion is reduced or on first draw.
let camera, camAnim;
function moveCamera(to) {
  cancelAnimationFrame(camAnim);
  const from = camera;
  camera = to;
  const set = v => svg.setAttribute('viewBox', v.map(f).join(' '));
  if (!from || reduceMotion) return set(to);
  const t0 = performance.now(), D = 550;
  const tick = now => {
    const t = Math.min((now - t0) / D, 1), e = 1 - (1 - t) ** 3;
    set(from.map((a, i) => a + (to[i] - a) * e));
    if (t < 1) camAnim = requestAnimationFrame(tick);
  };
  camAnim = requestAnimationFrame(tick);
}

/* ---------- Page ---------- */
function route() {
  const m = location.hash.match(/^#\/([\w-]+)(?:\/(\d+|quiz))?/);
  const lesson = L.find(l => l.id === m?.[1]) || L[0];
  const quiz = m?.[2] === 'quiz' && !!lesson.quiz;
  const i = quiz ? lesson.steps.length - 1 : Math.min(Math.max((+m?.[2] || 1) - 1, 0), lesson.steps.length - 1);
  // time to read the step's text and key idea at ~250 words/min, used by autoplay
  const words = (lesson.steps[i].text + ' ' + (lesson.steps[i].key || '')).replace(/<[^>]+>/g, ' ').split(/\s+/).length;
  cur = { lesson, i, quiz, readMs: words / 250 * 60000 };
  if (i === lesson.steps.length - 1) { done.add(lesson.id); localStorage.setItem('atlas-done', JSON.stringify([...done])); }
  render(lesson, i);
  if (quiz) renderQuiz(lesson);
  openDrawer(false);
}
const go = i => { if (i >= 0 && i < cur.lesson.steps.length) location.hash = `#/${cur.lesson.id}/${i + 1}`; };

function render(lesson, i) {
  const step = lesson.steps[i], n = lesson.steps.length;
  const same = L.filter(l => l.track === lesson.track), pos = same.indexOf(lesson);
  document.title = `${lesson.code} · ${lesson.title} · Agent Atlas`;
  $('crumb').textContent = `${lesson.track} / ${lesson.code} · ${pos + 1} of ${same.length}`;
  $('title').textContent = lesson.title;
  $('summary').textContent = lesson.summary;
  $('chips').innerHTML = `<span class="chip time">◷ ${lesson.minutes} min</span><span class="chip level">${lesson.level}</span><span class="chip steps">${n} steps</span>`;

  const vals = Object.assign({}, ...lesson.steps.slice(0, i + 1).map(s => s.metrics || {}));
  $('metrics').innerHTML = lesson.metrics.map(([k, icon]) =>
    `<div class="metric${step.metrics && k in step.metrics ? ' fresh' : ''}"><span class="mi" aria-hidden="true">${icon}</span><span class="mk-name">${esc(k)}</span><b>${esc(vals[k] ?? '—')}</b></div>`).join('');

  drawDiagram(lesson, i);

  const q = cur.quiz;
  $('rail').innerHTML = lesson.steps.map((s, k) => {
    const past = k < i || q, now = k === i && !q;
    return `<li class="${past ? 'past' : ''}${now ? ' now' : ''}"><button data-step="${k}" title="${esc(s.title)}" aria-label="Step ${k + 1}: ${esc(s.title)}"${now ? ' aria-current="step"' : ''}>${past ? '✓' : k + 1}</button>${now ? `<span>${esc(s.short)}</span>` : ''}</li>`;
  }).join('') + (lesson.quiz ? `<li class="quiz-dot${q ? ' now' : ''}"><a href="#/${lesson.id}/quiz" title="Quiz" aria-label="Quiz"${q ? ' aria-current="step"' : ''}>?</a>${q ? '<span>Quiz</span>' : ''}</li>` : '');
  $('railpos').textContent = q ? 'Quiz' : `Step ${i + 1} of ${n}`;

  const all = L, li = all.indexOf(lesson), nextLesson = all[li + 1];
  const next = i < n - 1
    ? `<button class="primary" data-step="${i + 1}">Next: ${esc(lesson.steps[i + 1].short)} <span aria-hidden="true">→</span></button>`
    : lesson.quiz ? `<a class="primary" href="#/${lesson.id}/quiz">Take the quiz <span aria-hidden="true">→</span></a>`
    : nextLesson ? `<a class="primary" href="#/${nextLesson.id}/1">Next: ${esc(nextLesson.code)} <span aria-hidden="true">→</span></a>`
    : `<a class="primary" href="#/${all[0].id}/1">Start over ↺</a>`;
  $('panel').innerHTML = `
    <div class="step-head"><span class="step-no">Step ${i + 1} / ${n}</span><span class="tag ${step.tag}">${step.tag}</span></div>
    <h2>${esc(step.title)}</h2>
    <div class="body">${step.text}</div>
    ${step.flows?.length ? `<h3 class="beats-h">What happens</h3><ol class="beats" id="beatlist">${step.flows.map((fl, k) =>
      `<li class="${fl[2]}"><button data-beat="${k}">${esc(captionOf(lesson, fl))}</button></li>`).join('')}</ol>` : ''}
    ${step.key ? `<div class="key"><span class="key-icon" aria-hidden="true">✦</span><div><strong>Key idea</strong><p>${step.key}</p></div></div>` : ''}
    ${step.deep ? `<details class="deep"><summary>Deep dive</summary><div>${step.deep}</div></details>` : ''}
    ${lesson.notePath ? `<a class="note-link" href="#" data-note="${esc(lesson.notePath)}"${lesson.noteSections?.[i] ? ` data-h="${esc(lesson.noteSections[i])}"` : ''}>📖 Read the full notes${lesson.noteSections?.[i] ? `: <span>${esc(lesson.noteSections[i])}</span>` : ''}</a>` : ''}
    <div class="panel-foot"><div class="btns"><button data-step="${i - 1}"${i === 0 ? ' disabled' : ''}>← Back</button>${next}</div>
    <p class="hint"><kbd>←</kbd><kbd>→</kbd> step · <kbd>[</kbd><kbd>]</kbd> message · <kbd>R</kbd> replay · <kbd>Space</kbd> pause</p></div>`;
  $('panel').scrollTop = 0;
  markTerms(document.querySelectorAll('#panel .body, #panel .key p, #panel .deep > div'), lesson.glossary || {});

  $('learn').innerHTML = `<h3>You'll learn</h3><ul>${lesson.learn.map(([t, at]) =>
    `<li class="${i >= at ? 'got' : ''}"><span class="box" aria-hidden="true">${i >= at ? '✓' : ''}</span>${esc(t)}</li>`).join('')}</ul>`;

  renderDrawer(lesson);
}

/* ---------- Glossary: underline the first use of each term in a step ---------- */
function markTerms(roots, glossary) {
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  if (!terms.length) return;
  const rx = new RegExp(`\\b(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(s|es)?\\b`, 'i');
  const seen = new Set();
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement.closest('code, .formula, .term, th') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let node of nodes) {
      let m;
      while (node && (m = rx.exec(node.data))) {
        const term = terms.find(t => t.toLowerCase() === m[1].toLowerCase());
        const after = node.splitText(m.index);
        node = after.splitText(m[0].length);
        if (seen.has(term)) continue;
        seen.add(term);
        const span = document.createElement('span');
        span.className = 'term'; span.tabIndex = 0; span.dataset.term = term;
        span.setAttribute('aria-describedby', 'tip');
        after.replaceWith(span); span.append(after);
      }
    }
  }
}
const tip = $('tip');
function showTip(el) {
  const def = cur.lesson.glossary?.[el.dataset.term];
  if (!def) return;
  tip.innerHTML = `<b>${esc(el.dataset.term)}</b> ${esc(def)}`;
  tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  tip.style.top = (r.bottom + h + 12 > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
}
document.addEventListener('mouseover', e => { const t = e.target.closest?.('.term'); if (t) showTip(t); });
document.addEventListener('mouseout', e => { if (e.target.closest?.('.term')) tip.hidden = true; });
document.addEventListener('focusin', e => { if (e.target.classList?.contains('term')) showTip(e.target); });
document.addEventListener('focusout', e => { if (e.target.classList?.contains('term')) tip.hidden = true; });

/* ---------- Object info cards ---------- */
function showInfo(id) {
  const box = $('info'), l = cur?.lesson, it = id && (l.nodes[id] || l.zones?.[id]);
  if (!it || !it.info) { box.hidden = true; return; }
  box.innerHTML = `<button class="icon-btn sm" id="info-close" aria-label="Close">✕</button><h4>${esc(it.label)}${it.sub ? ` <small>${esc(it.sub)}</small>` : ''}</h4><p>${it.info}</p>`;
  box.hidden = false;
  $('info-close').onclick = () => showInfo(null);
}

/* ---------- Quiz ---------- */
const quizState = {};
const best = JSON.parse(localStorage.getItem('atlas-quiz') || '{}');

function renderQuiz(lesson) {
  const Q = lesson.quiz, n = Q.length, st = quizState[lesson.id] ||= { k: 0, picks: [] };
  const li = L.indexOf(lesson), nextLesson = L[li + 1];
  const back = `<a href="#/${lesson.id}/${lesson.steps.length}">← Lesson</a>`;
  if (st.k >= n) {
    const score = Q.filter((q, k) => st.picks[k] === q.answer).length;
    if (score > (best[lesson.id] ?? -1)) { best[lesson.id] = score; localStorage.setItem('atlas-quiz', JSON.stringify(best)); }
    $('panel').innerHTML = `
      <div class="step-head"><span class="step-no">Quiz · results</span><span class="tag insight">${score} / ${n}</span></div>
      <h2>${score === n ? 'Perfect score.' : score >= n * 0.7 ? 'Solid. Review the misses.' : 'Worth another pass.'}</h2>
      <ol class="quiz-review">${Q.map((q, k) => `<li class="${st.picks[k] === q.answer ? 'ok' : 'miss'}"><span aria-hidden="true">${st.picks[k] === q.answer ? '✓' : '✗'}</span><span class="rq">${q.q}</span></li>`).join('')}</ol>
      <p class="hint">Best score: ${best[lesson.id]} / ${n}</p>
      <div class="panel-foot"><div class="btns"><button data-quiz="retry">↺ Retry</button>${nextLesson ? `<a class="primary" href="#/${nextLesson.id}/1">Next: ${esc(nextLesson.code)} →</a>` : back}</div></div>`;
    return;
  }
  const q = Q[st.k], pick = st.picks[st.k], answered = pick !== undefined;
  $('panel').innerHTML = `
    <div class="step-head"><span class="step-no">Quiz · ${st.k + 1} / ${n}</span><span class="tag technique">check yourself</span></div>
    <h2 class="quiz-q">${q.q}</h2>
    <div class="options" role="group" aria-label="Answers">${q.options.map((o, k) =>
      `<button data-opt="${k}" class="opt${answered && k === q.answer ? ' right' : ''}${answered && k === pick && k !== q.answer ? ' wrong' : ''}"${answered ? ' disabled' : ''}><b>${'ABCD'[k]}</b><span>${o}</span></button>`).join('')}</div>
    ${answered ? `<div class="key ${pick === q.answer ? 'good' : 'bad'}"><span class="key-icon" aria-hidden="true">${pick === q.answer ? '✓' : '✗'}</span><div><strong>${pick === q.answer ? 'Correct' : 'Not quite'}</strong><p>${q.why}</p></div></div>` : ''}
    <div class="panel-foot"><div class="btns">${back}${answered ? `<button class="primary" data-quiz="next">${st.k + 1 < n ? 'Next question →' : 'See results →'}</button>` : '<button class="primary" disabled>Pick an answer</button>'}</div></div>`;
}

function renderDrawer(lesson) {
  const tracks = [...new Set(L.map(l => l.track))];
  $('drawer').innerHTML = `<div class="drawer-head"><b>Course</b><span>${L.length} lessons</span><button class="icon-btn sm" id="close" aria-label="Close menu">✕</button></div>` +
    tracks.map(t => {
      const ls = L.filter(l => l.track === t), d = ls.filter(l => done.has(l.id)).length;
      return `<details open><summary><span class="folder" aria-hidden="true"></span>${esc(t)}<small>${d}/${ls.length}</small></summary><ul>${ls.map(l =>
        `<li><a href="#/${l.id}/1"${l === lesson ? ' aria-current="page"' : ''}><span class="dot${done.has(l.id) ? ' done' : ''}"></span><b>${l.code}</b> ${esc(l.title)}</a></li>`).join('')}</ul></details>`;
    }).join('') +
    `<div class="drawer-foot"><span>Progress</span><div class="bar"><i style="width:${done.size / L.length * 100}%"></i></div><b>${done.size} / ${L.length}</b></div>`;
  $('close').onclick = () => openDrawer(false);
}

function openDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  $('scrim').hidden = !open;
  $('menu').setAttribute('aria-expanded', open);
}

const PAUSE = '<svg viewBox="0 0 20 20" width="14" height="14"><path d="M6 4v12M14 4v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const PLAY = '<svg viewBox="0 0 20 20" width="14" height="14"><path d="M6 4l10 6-10 6z" fill="currentColor"/></svg>';
function replay() { clock = 0; lastK = -1; window.speechSynthesis?.cancel(); speaking = false; togglePause(false); }
function togglePause(p = !paused) {
  paused = p;
  if (p) { window.speechSynthesis?.cancel(); speaking = false; }
  $('pause').innerHTML = p ? PLAY : PAUSE;
  $('pause').setAttribute('aria-label', p ? 'Play animation (Space)' : 'Pause animation (Space)');
}

/* ---------- Search ---------- */
const q = $('q'), results = $('results');
q.oninput = () => {
  const t = q.value.trim().toLowerCase();
  const hits = t ? L.filter(l => (l.code + ' ' + l.title + ' ' + l.summary + ' ' + l.steps.map(s => s.title).join(' ')).toLowerCase().includes(t)) : [];
  results.innerHTML = hits.map(l => `<li><a href="#/${l.id}/1"><b>${l.code}</b> ${esc(l.title)}</a></li>`).join('') || (t ? '<li class="none">No matches</li>' : '');
  results.hidden = !t;
};
q.onkeydown = e => {
  if (e.key === 'Enter') results.querySelector('a')?.click();
  if (e.key === 'Escape') { q.value = ''; q.oninput(); q.blur(); }
};
q.onblur = () => setTimeout(() => { results.hidden = true; }, 150);

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-step]');
  if (b && !b.disabled) go(+b.dataset.step);
  const bt = e.target.closest('[data-beat]');
  if (bt) jumpBeat(+bt.dataset.beat);
  const nd = e.target.closest('.node[data-id], .zone[data-id], .tag-pill[data-id], .ntop-g[data-id]');
  if (nd) showInfo(nd.dataset.id); else if (!e.target.closest('#info')) showInfo(null);
  const opt = e.target.closest('[data-opt]'), qa = e.target.closest('[data-quiz]');
  if ((opt && !opt.disabled) || qa) {
    const st = quizState[cur.lesson.id];
    if (opt) st.picks[st.k] = +opt.dataset.opt;
    else if (qa.dataset.quiz === 'next') st.k++;
    else Object.assign(st, { k: 0, picks: [] });
    renderQuiz(cur.lesson);
  }
  if (e.target.closest('#results a')) { q.value = ''; results.hidden = true; }
});
$('replay').onclick = replay;
$('auto').onclick = () => setAutoplay(!autoplay);
$('voice').onclick = () => setVoice(!voice);
if (!window.speechSynthesis) $('voice').hidden = true;
$('speed').onclick = () => {
  speed = { 1: 1.5, 1.5: 2, 2: 0.75, 0.75: 1 }[speed];
  $('speed').textContent = speed + '×';
};
svg.addEventListener('keydown', e => {
  const nd = e.target.closest?.('[data-id]');
  if (nd && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); showInfo(nd.dataset.id); }
});
$('beat-prev').onclick = () => stepBeat(-1);
$('beat-next').onclick = () => stepBeat(1);
$('pause').onclick = () => togglePause();
$('menu').onclick = () => openDrawer(!document.body.classList.contains('drawer-open'));
$('scrim').onclick = () => openDrawer(false);
$('theme').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
};
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (cur.quiz && /^Arrow(Left|Right)$/.test(e.key)) { if (e.key === 'ArrowLeft') go(cur.i); return; }
  if (e.key === 'ArrowRight') go(cur.i + 1);
  else if (e.key === 'ArrowLeft') go(cur.i - 1);
  else if (e.key === 'r' || e.key === 'R') replay();
  else if (e.key === '[') stepBeat(-1);
  else if (e.key === ']') stepBeat(1);
  else if (e.key === ' ' && !/^(BUTTON|A|SUMMARY)$/.test(e.target.tagName)) { e.preventDefault(); togglePause(); }
  else if (e.key === 'Escape') { openDrawer(false); showInfo(null); closeNote(); }
});
addEventListener('hashchange', route);
route();
