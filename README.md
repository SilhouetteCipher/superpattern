# Super Pattern

Field-based pattern generator that exports smooth, closed SVG curves for Plasticity/CAD.

Run: `python3 serve.py` in this folder, then open http://localhost:5173.

**How it works:** motif generators emit primitives (tapered strokes, bulbs, dots) → an implicit field blends them
(order-independent smooth union, clearance carve around dots) → sparse marching squares → vertices projected
onto the exact surface → G1 cubic Bézier fit (tolerance in mm) → SVG in mm units, absolute `M/C/Z` paths only.

**Controls:** double-click to drop a field point · drag point to move · drag the white grip to set radius ·
Delete removes · drag empty space to pan · scroll to zoom · R randomize · M mutate · N nodes · V field · F fit · ⌘Z / ⇧⌘Z.

Add new motifs in `js/generators.js` (registry: `SP.generators[id] = { schema, generate(p) }`); layout, field and export are shared.

**Generators:** Molecule · Dash Grid · Turing · Marble · Dot Grid · Carved · Polygon Ring · Line Paths ·
Glyph Grid · Op Art · Rays · Voronoi · Truchet · Halftone · Tile Grid · Shape Tiles · Capsule Grid · Knotwork ·
Spoke Ring · Line Hatch · Quad Grid · Tri Glyph. Presets are grouped by generator; "Coasters board" holds one preset per pin
(underlays in `ref/pins/`, kept local — they're other people's artwork). Sample exports: `exports/pins/`.

**Render** (any generator): *Outline* turns shapes into strokes of a set width; *Invert* cuts the pattern out of a
rectangular or circular blank (coaster-ready).

**Reference images** (`ref/`, used as underlays and pin thumbnails) aren't in the repo — they're other people's
artwork. The app works without them; drop your own images into `ref/pins/pinNN.jpg` to get the underlays back.
