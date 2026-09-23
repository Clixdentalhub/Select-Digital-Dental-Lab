import { test, expect } from './fixtures.mjs';
import { PAGES, WIDTHS } from './helpers.mjs';

/* Words are grouped into REAL line boxes.
   Grouping by rect.top is wrong — a <small> or <strong> on the same visual
   line has a different top and reports one line as two — so rects are
   clustered by vertical overlap instead. */
const MEASURE = `
(() => {
  const BLOCKS = 'h1,h2,h3,h4,p,.tick span,figcaption,cite,.stat span,legend,.price-sub';
  const out = [];

  function wordRanges(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const words = [];
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent;
      const re = /\\S+/g;
      let m;
      while ((m = re.exec(t))) {
        const r = document.createRange();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        const rects = [...r.getClientRects()].filter(x => x.width > 0 && x.height > 0);
        if (rects.length) words.push({ text: m[0], rects });
      }
    }
    return words;
  }

  function toLines(words) {
    const lines = [];
    for (const w of words) {
      for (const rect of w.rects) {
        let line = lines.find(l => {
          const top = Math.max(l.top, rect.top);
          const bottom = Math.min(l.bottom, rect.bottom);
          const overlap = bottom - top;
          return overlap > 0.5 * Math.min(l.bottom - l.top, rect.height);
        });
        if (!line) { line = { top: rect.top, bottom: rect.bottom, words: [] }; lines.push(line); }
        line.top = Math.min(line.top, rect.top);
        line.bottom = Math.max(line.bottom, rect.bottom);
        if (!line.words.includes(w.text)) line.words.push(w.text);
      }
    }
    return lines.sort((a, b) => a.top - b.top);
  }

  for (const block of document.querySelectorAll(BLOCKS)) {
    if (block.closest('.sr-only') || block.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(block);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // Only leaf blocks. A block-level child is its own line box by
    // construction, and counting it as a wrapped line reports a widow that
    // isn't one — <cite>Name<span>Patient</span></cite> is the usual case.
    const hasBlockChild = [...block.querySelectorAll('*')].some((c) => {
      const d = getComputedStyle(c).display;
      return /block|flex|grid|list-item|table/.test(d);
    });
    if (hasBlockChild) continue;
    const words = wordRanges(block);
    if (words.length < 3) continue;
    const lines = toLines(words);
    if (lines.length < 2) continue;

    const label = block.tagName.toLowerCase() + ' — "' + block.textContent.trim().slice(0, 56) + '"';

    // a block whose last line holds a single word
    if (lines[lines.length - 1].words.length === 1) {
      out.push({ kind: 'widow', label, word: lines[lines.length - 1].words[0] });
    }

    // a hyphenated compound split across two lines
    for (const w of words) {
      if (!/[\\p{L}]-[\\p{L}]/u.test(w.text)) continue;
      const tops = new Set(w.rects.map(r => Math.round(r.top)));
      if (w.rects.length > 1 && tops.size > 1) out.push({ kind: 'hyphen-split', label, word: w.text });
    }
  }
  return out;
})()
`;

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`${path} @${width} — no widows, no split compounds`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForTimeout(300);

      const found = await page.evaluate(MEASURE);
      const lines = found.map((f) => `${f.kind}: [${f.word}] in ${f.label}`);
      expect(lines, `${lines.length} wrapping problem(s) at ${width}px`).toEqual([]);
    });
  }
}
