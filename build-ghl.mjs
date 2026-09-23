#!/usr/bin/env node
/* Builds ghl.html — one paste-ready fragment for a GoHighLevel custom-code block.

     node build-ghl.mjs

   A GHL page is already a document, so a second <!doctype html>/<html>/<head>/
   <body> cannot nest inside it. This emits the page content only: the font
   import, the stylesheets, the markup and the scripts.

   Three transformations matter:

   1. Everything is wrapped in .pdg and every `body` rule is rescoped to it, so
      the funnel cannot restyle the rest of the GHL page. `html` rules stay put
      because anchor scrolling resolves from them.

   2. A local assets/ path whose file EXISTS is kept — embed-images.py inlines
      it as a data URI afterwards, which is what makes the fragment a single
      paste-ready file. Only a local path with no file behind it is removed,
      along with its labelled slot: in this repo a missing file degrades to a
      slot naming what it wants, which is right while building — but pasted
      into a live builder it reads as a broken page.

   3. A section whose media is entirely missing is dropped whole, rather than
      shipped as a row of empty frames. What was dropped is printed. */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const src = await readFile('index.html', 'utf8');
const FONTS = (src.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/) || [])[1];

let styles = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
let body = src.match(/<body>([\s\S]*)<\/body>/)[1];
const scripts = [...body.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]);
body = body.replace(/<script[\s\S]*?<\/script>/g, '');
/* Inside GHL there is no thank-you.html at a relative path: the form's
   built-in confirmation panel stands instead. Point THANK_YOU at the
   funnel's own thank-you step to restore the redirect. */
scripts.forEach((s, i) => { scripts[i] = s.replace("var THANK_YOU = 'thank-you.html';", 'var THANK_YOU = null; // set to your GHL thank-you step path to redirect') });


/* 1 · rescope body → .pdg so the funnel cannot restyle the host page */
styles = styles
  .replace(/(^|\})\s*body\s*\{/g, '$1\n.pdg{')
  .replace(/([^a-zA-Z-])body\s+/g, '$1.pdg ');

/* a local path is "supplied" only when the file is really on disk */
const missing = (u) => u.startsWith('assets/') && !existsSync(u);

/* 2 · Drop a section whose media never arrived — decided by reading the
      section, not from a list kept by hand. A section counts as unusable
      when it has image slots and every one of them is a local path with
      no file behind it. */
const dropped = [];
for (const m of [...body.matchAll(/<section[^>]*id="([a-z-]+)"[\s\S]*?\n<\/section>/g)]) {
  const [block, id] = m;
  const imgs = [...block.matchAll(/<img[^>]+src="([^"]+)"/g)].map((x) => x[1]);
  if (imgs.length < 2 || !imgs.every(missing)) continue;
  body = body.replace(block, `\n<!-- section "${id}" omitted: ${imgs.length} images, none supplied -->\n`);
  dropped.push({ id, why: `${imgs.length} images, none supplied` });
}
/* and their nav links, so nothing points at a section that is gone */
for (const { id } of dropped) {
  body = body.replace(new RegExp(`\\s*<li><a href="#${id}">[^<]*</a></li>`, 'g'), '');
}

/* 3 · strip images whose local path has no file behind it, and their slots */
let stripped = 0;
body = body.replace(
  /(\s*)<div class="media[^"]*"( data-slot="[^"]*")?>\s*<img[^>]+src="(assets\/[^"]+)"[^>]*>\s*<\/div>/g,
  (whole, lead, _slot, path) => {
    if (!missing(path)) return whole;
    stripped += 1;
    return `${lead}<div class="media media-4x3" data-slot="${path.split('/').pop()}"></div>`;
  },
);
body = body.replace(/\s*<img[^>]+src="(assets\/[^"]+)"[^>]*>/g, (whole, path) => {
  if (!missing(path)) return whole;
  stripped += 1;
  return '';
});
body = body.replace(/<span class="card-photo-bg"[^>]*style="background-image:url\((assets\/[^)]*)\)"[^>]*><\/span>/g,
  (whole, path) => (missing(path) ? '' : whole));
body = body.replace(/\s*poster="(assets\/[^"]*)"/g, (whole, path) => (missing(path) ? '' : whole));
body = body.replace(/<source src="(assets\/[^"]*)"[^>]*>/g, (whole, path) => (missing(path) ? '' : whole));

const out = [
  `<!-- Dental implant funnel (template).`,
  `     Paste into a GoHighLevel custom-code block. Page content only - the`,
  `     document wrapper is omitted, because the GHL page already provides it. -->`,
  FONTS ? `<style>@import url("${FONTS}");</style>` : '',
  `<style>\n${styles}\n</style>`,
  `<div class="pdg">`,
  body.trim(),
  `</div>`,
  ...scripts,
].filter(Boolean).join('\n');

await writeFile('ghl.html', out);

const kb = (n) => (Buffer.byteLength(n) / 1024).toFixed(0) + ' KB';
console.log(`\nghl.html  ${kb(out)}`);
console.log(`  hosted images kept   : ${(out.match(/src="https:\/\//g) || []).length}`);
console.log(`  local images kept    : ${(out.match(/(?:src|poster)="assets\//g) || []).length + (out.match(/url\(assets\//g) || []).length}`);
console.log(`  missing images cut   : ${stripped}`);
for (const { id, why } of dropped) console.log(`  section dropped      : #${id} — ${why}`);
console.log(`\nRun embed-images.py on ghl.html to inline the kept local images.\n`);
