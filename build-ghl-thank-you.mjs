#!/usr/bin/env node
/* Builds ghl-thank-you.html — the thank-you step as a paste-ready fragment
   for a GoHighLevel custom-code block, by the same rules as build-ghl.mjs:
   page content only, body rules rescoped to .pdg. The page has no local
   media beyond the logo, which embed-images.py inlines afterwards. */
import { readFile, writeFile } from 'node:fs/promises';

const src = await readFile('thank-you.html', 'utf8');
const FONTS = (src.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/) || [])[1];

let styles = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
let body = src.match(/<body>([\s\S]*)<\/body>/)[1];
const scripts = [...body.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]);
body = body.replace(/<script[\s\S]*?<\/script>/g, '');

styles = styles
  .replace(/(^|\})\s*body\s*\{/g, '$1\n.pdg{')
  .replace(/([^a-zA-Z-])body\s+/g, '$1.pdg ');

const out = [
  `<!-- Dental funnel — thank-you step (template).`,
  `     Paste into a GoHighLevel custom-code block on the thank-you page.`,
  `     Page content only - the document wrapper is omitted. -->`,
  FONTS ? `<style>@import url("${FONTS}");</style>` : '',
  `<style>\n${styles}\n</style>`,
  `<div class="pdg">`,
  body.trim(),
  `</div>`,
  ...scripts,
].filter(Boolean).join('\n');

await writeFile('ghl-thank-you.html', out);
const kb = (n) => (Buffer.byteLength(n) / 1024).toFixed(0) + ' KB';
console.log(`ghl-thank-you.html  ${kb(out)}`);
console.log(`Run embed-images.py on it to inline the logo.`);
