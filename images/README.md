# Chapter card imagery

Cards expect local, realistic construction photos using predictable filenames so the portal can load them without code changes.

## File naming
- Preferred: `images/ch-XX.jpg` where `XX` is the 2‑digit chapter number (e.g., `ch-01.jpg`, `ch-10.jpg`).
- Optional tag-based fallback: `images/<image_tag>.jpg` (e.g., `demolition.jpg`, `masonry.jpg`). The `image_tag` values live in `data.json`.
- JPEG is preferred; PNG is accepted. The loader will try `.jpg`, `.jpeg`, then `.png` for each name.

## How loading works
1. Try the chapter-specific filename (`ch-XX.*`).
2. If missing, try the tag filename (`<image_tag>.*`).
3. If no local file is found, a remote Unsplash fallback for that tag is used automatically.

## Guidelines for new photos
- Use realistic construction/renovation imagery only (no renders or illustrations).
- Keep files reasonably sized for mobile (`~1400px` wide is enough) and optimized for web.
- Aim for photos that clearly match the chapter scope (demolition, masonry, painting, electrical, plumbing, tiling, carpentry/windows, roofing, pool works, cleaning, safety, etc.).

After adding or replacing an image, commit it with the expected filename so GitHub Pages can serve it.
