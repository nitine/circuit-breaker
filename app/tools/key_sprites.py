"""Key the flat green background out of generated sprites and trim them.
Usage: python3 tools/key_sprites.py <in.png> <out.png>
"""
import sys
from PIL import Image

def key(src, dst, tol=90):
    im = Image.open(src).convert("RGBA")
    px = im.load(); w, h = im.size
    # background reference: median of the four corners
    ref = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    rr = sorted(p[0] for p in ref)[1]; gg = sorted(p[1] for p in ref)[1]; bb = sorted(p[2] for p in ref)[1]
    def is_bg(p):
        r, g, b = p[0], p[1], p[2]
        return abs(r - rr) + abs(g - gg) + abs(b - bb) < tol and g > r + 40 and g > b + 40
    # flood fill from the edges so green inside the character survives
    from collections import deque
    seen = bytearray(w * h); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]): q.append((x, y)); seen[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]) and not seen[y * w + x]: q.append((x, y)); seen[y * w + x] = 1
    while q:
        x, y = q.popleft(); px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(px[nx, ny]):
                seen[ny * w + nx] = 1; q.append((nx, ny))
    # soften green fringe
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and g > r + 30 and g > b + 30 and g > 120:
                px[x, y] = (r, int((r + b) / 2), b, a)
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    im.save(dst)
    print(dst, im.size)

if __name__ == "__main__":
    key(sys.argv[1], sys.argv[2])
