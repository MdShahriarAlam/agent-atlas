// In-site reader for the course notes copied into notes/. A small markdown renderer
// for what these Obsidian notes use: headings, paragraphs, lists, tables, code, callouts,
// $$ math $$ (shown as monospace), ![[images]] and [[wikilinks]].
// shortcut: not a full CommonMark parser; if notes start using nested lists or HTML, swap in a library.

const slug = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
const escR = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function findNote(name) {
  return window.NOTES.find(p => p === name || p.split('/').pop() === name);
}

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`); // protect inline code
  s = escR(s)
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, f) => `<img src="notes/images/${encodeURI(f.trim())}" alt="${f}">`)
    .replace(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_, n, h, label) => {
      const p = findNote(n.trim());
      return p ? `<a href="#" data-note="${escR(p)}"${h ? ` data-h="${escR(h)}"` : ''}>${label || n}</a>` : (label || n);
    })
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    // inline math needs non-space next to both $ signs, so prices like "$5.00 vs $0.50" stay text
    .replace(/\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g, '<span class="m">$1</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escR(codes[i])}</code>`);
}

function renderMarkdown(md) {
  const lines = md.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\r/g, '').split('\n');
  let html = '', i = 0;
  const para = [];
  const flush = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para.length = 0; } };
  while (i < lines.length) {
    const ln = lines[i];
    let m;
    if (/^```/.test(ln)) {
      flush(); const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      html += `<pre><code>${escR(body.join('\n'))}</code></pre>`; i++; continue;
    }
    if (/^\s*\$\$/.test(ln)) {
      flush(); const body = [];
      for (i++; i < lines.length && !/^\s*\$\$/.test(lines[i]); i++) body.push(lines[i]);
      html += `<pre class="math">${escR(body.join('\n').trim())}</pre>`; i++; continue;
    }
    if ((m = ln.match(/^(#{1,6})\s+(.*)/))) {
      flush(); const lvl = Math.min(m[1].length + 1, 6), text = m[2];
      html += `<h${lvl} id="n-${slug(text)}">${inline(text)}</h${lvl}>`; i++; continue;
    }
    if (/^\|.*\|\s*$/.test(ln) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      flush(); const row = r => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => inline(c.trim().replace(/\\\|/g, '|')));
      html += `<table><tr>${row(ln).map(c => `<th>${c}</th>`).join('')}</tr>`;
      for (i += 2; i < lines.length && /^\|/.test(lines[i]); i++) html += `<tr>${row(lines[i]).map(c => `<td>${c}</td>`).join('')}</tr>`;
      html += '</table>'; continue;
    }
    if (/^>/.test(ln)) {
      flush(); const body = [];
      for (; i < lines.length && /^>/.test(lines[i]); i++) body.push(lines[i].replace(/^>\s?/, ''));
      const kind = (body[0].match(/^\[!(\w+)\]/) || [])[1];
      if (kind) body[0] = body[0].replace(/^\[!\w+\]\s*/, '');
      html += `<blockquote class="${kind ? 'callout ' + kind : ''}">${body.filter(Boolean).map(b => `<p>${inline(b)}</p>`).join('')}</blockquote>`; continue;
    }
    if ((m = ln.match(/^(\s*)([-*]|\d+\.)\s+(.*)/))) {
      flush(); const ordered = /\d/.test(m[2]), items = [];
      for (; i < lines.length; i++) {
        const mm = lines[i].match(/^\s*([-*]|\d+\.)\s+(.*)/);
        if (mm) items.push(mm[2]);
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1] += ' ' + lines[i].trim();
        else break;
      }
      html += `<${ordered ? 'ol' : 'ul'}>${items.map(t => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`; continue;
    }
    if (!ln.trim()) { flush(); i++; continue; }
    para.push(ln.trim()); i++;
  }
  flush();
  return html;
}

// self-check of the parser on a tiny sample
(() => {
  const h = renderMarkdown('---\na: 1\n---\n# Title\n\nSome **bold** and `x*y*z`.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- one\n- two\n');
  console.assert(h.includes('<h2 id="n-title">Title</h2>') && h.includes('<b>bold</b>') && h.includes('<code>x*y*z</code>') && h.includes('<td>2</td>') && h.includes('<li>two</li>') && !h.includes('a: 1'), 'reader: markdown self-check failed', h);
})();

const noteCache = {};
async function openNote(path, heading) {
  const box = document.getElementById('reader'), body = document.getElementById('reader-body');
  document.getElementById('reader-title').textContent = path.split('/').pop();
  box.hidden = false;
  document.body.classList.add('reader-open');
  if (box.dataset.path !== path) {
    body.innerHTML = '<p class="loading">Loading notes</p>';
    try {
      noteCache[path] ||= await fetch(`notes/${path.split('/').map(encodeURIComponent).join('/')}.md`).then(r => {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      });
      body.innerHTML = renderMarkdown(noteCache[path]);
      box.dataset.path = path;
    } catch (err) {
      body.innerHTML = `<p class="loading">Couldn't load this note (${escR(String(err.message))}).</p>`;
      return;
    }
  }
  const target = heading && document.getElementById('n-' + slug(heading));
  (target || body.firstElementChild)?.scrollIntoView({ block: 'start' });
  target?.classList.add('flash-h');
  setTimeout(() => target?.classList.remove('flash-h'), 1600);
}
function closeNote() {
  document.getElementById('reader').hidden = true;
  document.body.classList.remove('reader-open');
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-note]');
  if (!a) return;
  e.preventDefault();
  openNote(a.dataset.note, a.dataset.h);
});
