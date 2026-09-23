#!/usr/bin/env python3
"""
embed-images.py — turn a page that references local images into ONE self-contained
HTML file, for pasting into a builder (GHL, Webflow embed, an email tool) that has
nowhere to host the image files.

    python3 embed-images.py index.html out.html

Every src="assets/x.webp", href="assets/x.png", poster="assets/x.jpg" and
url(assets/x.jpg) is replaced by a data: URI holding the file's bytes in base64.

Video is deliberately NOT inlined. A data: URI cannot be streamed - the browser
has to finish downloading the whole thing before the first frame plays - so a
background loop inlined this way stalls the page instead of decorating it. The
poster frame is inlined, the video keeps its URL, and the page shows the still
until the video arrives. Host the video.

Two things to know before you use it:

  * base64 costs about +33% in size. A 900KB folder of images becomes ~1.2MB of
    HTML. That is the price of having no external files.
  * A browser caches 13 separate images across visits. It cannot cache part of an
    HTML file, so every visitor re-downloads all of them on every page load. For
    anything you are paying to send traffic to, hosting the images properly and
    linking them is faster. Use this when you cannot host them, or for review
    copies you want to send as a single file.
"""
import base64, mimetypes, os, re, sys

def main(src, dst):
    root = os.path.dirname(os.path.abspath(src)) or '.'
    html = open(src, encoding='utf-8').read()
    cache, missing = {}, []

    def encode(rel):
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            missing.append(rel)
            return None
        if rel not in cache:
            mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
            with open(path, 'rb') as f:
                cache[rel] = 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())
        return cache[rel]

    def swap(m):
        rel = m.group(1)
        # leave anything already remote or already inlined alone
        if rel.startswith(('http://', 'https://', 'data:', '//')):
            return m.group(0)
        uri = encode(rel)
        return m.group(0) if uri is None else m.group(0).replace(rel, uri)

    # src="..." and href="..." pointing at a local file
    html = re.sub(r'(?:src|href|poster)="([^"]+\.(?:webp|png|jpe?g|gif|svg|avif))"', swap, html, flags=re.I)
    # CSS url(...) — bare, single- or double-quoted
    html = re.sub(r'url\(\s*["\']?([^"\')]+\.(?:webp|png|jpe?g|gif|svg|avif))["\']?\s*\)', swap, html, flags=re.I)

    open(dst, 'w', encoding='utf-8').write(html)

    print('%s -> %s' % (src, dst))
    print('  embedded : %d image(s)' % len(cache))
    print('  size     : %.2f MB' % (len(html) / 1048576))
    left = re.findall(r'(?:src|href|poster)="(?!http|data:|#|tel:|mailto:)([^"]+\.(?:webp|png|jpe?g|gif|svg|avif))"', html, flags=re.I)
    print('  external : %d image(s) remaining' % len(left))

    # Media that is not an image: left external on purpose, see the note above.
    media = re.findall(r'src="(?!http|data:)([^"]+\.(?:mp4|webm|mov|m4v|ogg|mp3|wav))"', html, flags=re.I)
    if media:
        print('  video/audio left external (cannot stream from a data: URI):')
        for u in sorted(set(media)):
            print('    ' + u)
    if missing:
        # A path in the HTML that is not on disk. Usually a typo, a case mismatch
        # on a case-sensitive filesystem, or a reference inside a commented-out block.
        print('  NOT FOUND (left as-is):')
        for m in sorted(set(missing)):
            print('    ' + m)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: python3 embed-images.py <input.html> <output.html>')
    main(sys.argv[1], sys.argv[2])
