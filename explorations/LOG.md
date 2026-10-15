# Explorations log

Generators added by the scheduled `superpattern-explorations` task. One per run; each lives in `js/<id>.js`
and appears under the **Explorations** tab. Sample exports: `explorations/<id>.svg`.

---

## 2026-10-14 — `knotwork` · Knotwork

**Territory:** Celtic knotwork (pattern tradition / grid construction rules).

**Idea.** The grid-and-breaks construction for Celtic plaits (George & Iain Bain's method, as explained by
Andrew Glassner and taught via Andy Sloss's grid). A lattice of crossing sites sits at the midpoints between
primary grid dots; strands run diagonally from site to site. At each site the two strands either cross, or a
*break* — a wall along a grid line, horizontal or vertical — turns both strands back on themselves. The
board edge is always a wall, so every strand closes into a loop. Over/under alternates along every strand:
the column parity of the site decides which diagonal family is on top, and walls on grid lines preserve the
alternation. In the relief, the under-strand is cut back around each crossing so the bands read as woven
with a real gap.

**How the code realises it.** `generateBoard` builds the site lattice (i+j odd on a 2·cols × 2·rows integer
grid, so corners are never sites), assigns a wall to each site from the chosen break pattern (random breaks,
panels, nested rings, or a plain plait, mirrored for symmetry; field points add extra breaks), then traces
each strand as a permutation cycle over (site, port) states. Crossings are straight diagonals; turns are a
single symmetric cubic between link midpoints with handles along the diagonals (G1 with the straight runs),
its depth capped so the apex stays half a strand plus half the gap off the wall. Under-crossings are removed
by arc length (strand width + gap), splitting each loop into round-capped strokes; uncrossed loops stay
closed. Output is strokes only, so the shared field/contour/Bézier pipeline gives clean closed outlines.

**Params.** Grid: `cols`, `rows`, `margin` · Breaks: `pattern` (random / panels / rings / plait),
`density`, `period` (panel size), `doors` (gaps in panel/ring walls), `hBias`, `symmetry`
(none / mirror / quad), `seed` · Strand: `width` (× strand spacing), `gap` (mm at crossings and walls),
`sharp` (turn sharpness), `fillet` · Field points: `fieldBreak`, `fieldWidth`.

**Presets.** Knotwork (random breaks, quad symmetry) · Knot panels (8×8, walled 2×2 panels with doors) ·
Knot rings (nested rectangular walls with doors, softer turns).

**Inspiration.**
- https://www.thinkythings.org/knotwork/knotwork-sloss.html (Andy Sloss' grid-tile method)
- https://parabola.unsw.edu.au/sites/default/files/2024-02/vol58_no1_7.pdf (Bain grid method, as explained by Glassner)
- https://dspace.zcu.cz/bitstream/11025/10604/1/Doyle.pdf (Celtic Canvas: computational knotwork)
- https://woodworkersinstitute.com/?p=58350 (Celtic relief carving: the target look for a relief)

---

## 2026-10-15 — `hankin` · Hankin Stars

**Territory:** Islamic geometric star patterns / girih strapwork (construction rule, not knotwork).

**Idea.** E. H. Hankin's "polygons in contact" method, as formalised by Craig Kaplan. Start from a tiling
by regular polygons. From the midpoint of every edge, send two rays into each adjacent tile, each leaning
away from the edge by a *contact angle* θ. Each ray stops where it meets its partner from the neighbouring
edge of the same tile, so every tile corner grows one star point; then the tiling is erased. Because both
tiles use the same θ at a shared midpoint, the rays continue straight across the edge, and the bands run
unbroken through the lattice: squares give 8-fold stars, 4.8.8 gives the classic octagon stars, 4.6.12 and
3.12.12 give 12-fold rosettes. Kaplan's *contact offset* δ splits each midpoint into two points so a tile's
two rays from one edge cross in an X (doubled, interlaced-looking strapwork). Sweeping θ across the board
gives a Huff-style parquet deformation that morphs one star family into another.

**How the code realises it.** `generateBoard` places six periodic tilings (square, hex, 4.8.8, 3.6.3.6,
4.6.12, 3.12.12), each defined as lattice vectors plus regular polygons (n, centre, rotation) at edge length
1, scaled to `size` mm, rotated, and repeated to cover the board. For each tile corner it intersects the two
inward rays (θ evaluated at each edge midpoint from base angle + linear sweep + field points); if the rays
are near-parallel or miss, it falls back to the closed-form meeting point on the corner bisector,
`d = (1+δ)·(L/2)·sin θ / sin(θ + α/2)`. Each star point becomes one 3-point stroke (S1 → P → S2) of constant
band radius; optional tile edges are deduped and added as thinner strokes. The shared field smooth-unions
crossings and joins, and the margin rectangle clips the board edge flat.

**Params.** Tiling: `tiling`, `size` (edge mm), `rotate`, `margin` · Stars: `angle` (contact angle),
`delta` (contact offset), `sweep` (θ change across board), `sweepDir` · Bands: `width` (mm), `frame`
(keep tile edges), `frameW`, `fillet` · Field points: `fieldAngle`.

**Presets.** Hankin stars (4.8.8, θ 67.5°) · Rosette lattice (4.6.12 dodecagon rosettes) · Star sweep (hex,
offset 0.22, θ sweeping 52° ± 16° left→right).

**Inspiration.**
- https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf (Kaplan, Islamic Star Patterns from Polygons in Contact)
- https://archive.bridgesmathart.org/2008/bridges2008-21.html (Hankin's polygons-in-contact grid method, Bridges 2008)
- https://arxiv.org/pdf/1809.09270 (Next Generation of Star Patterns — limits of the method)
- https://en.wikipedia.org/wiki/Islamic_geometric_patterns (girih and carved strapwork traditions)
