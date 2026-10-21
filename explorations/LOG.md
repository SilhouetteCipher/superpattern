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

---

## 2026-10-16 — `spacefill` · Space Fill

**Territory:** Space-filling curves / Lindenmayer systems (fractal curve construction, not a tiling or knot).

**Idea.** The classic space-filling curves (Hilbert, Moore, Peano, and Gosper's hexagonal "flowsnake"),
each defined as an L-system rewrite rule and walked by a turtle on a unit grid, then drawn as one wide,
winding band. The Moore curve is the closed-loop relative of Hilbert's, so its band is a single closed ring
that splits the board into two interlocking combs. That gives the figure/ground ambiguity explored in Bridges
papers on Peano tilings, and it works well as an inlay or a cut-out. Corners are rounded so the meander reads
as one smooth groove, not a staircase. Optional parallel tracks double the band into a channel. Seeded
breaks cut it into runs, which suits the flowsnake.

**How the code realises it.** `generateBoard` rewrites the axiom `order` times (capped per curve: Hilbert 6,
Moore 5, Peano 3, Gosper 4 so the pitch stays printable). A turtle turns 90° (60° for Gosper) and emits
unit-step vertices. The path is rotated and scaled so the curve plus half a pitch fits the board minus the
margin. Each corner is replaced by a quadratic blend whose control point is the corner, cut back
`corner × ½ pitch` along both legs (G1 with the straight legs; corner = 1 turns every U-turn into a smooth
arch). Repeated points are dropped so offsets stay defined. Closed curves wrap the first and last corner.
Seeded breaks remove single steps; runs shorter than `minRun` are dropped, so there are no tiny islands.
Tracks are miter-offset copies, with spacing limited so the outer tracks stay clear of the next run. When a
track would come out under ~0.6 mm, the generator falls back to fewer tracks. Width is a fraction of the
pitch, scaled by a linear gradient and by field points. Radius never drops below 0.3 mm (0.6 mm wide). Output
is strokes only.

**Params.** Curve: `curve` (hilbert / moore / peano / gosper), `order`, `rotate`, `margin` · Band: `width`
(× pitch), `corner`, `tracks`, `trackGap`, `fillet` · Breaks: `breaks`, `minRun`, `seed` · Swell: `grad`,
`gradAngle`, `fieldWidth`.

**Presets.** Moore loop (order 4, one closed band) · Hilbert tracks (order 4, twin parallel tracks, fully
rounded) · Flowsnake runs (Gosper order 3, broken into runs, width swelling upward).

**Inspiration.**
- https://archive.bridgesmathart.org/2008/bridges2008-123.html (Peano-curve tilings with Escher-like foreground/background ambiguity)
- https://archive.bridgesmathart.org/2024/bridges2024-319.html (The Art of Space-Filling Domino Curves)
- https://arxiv.org/pdf/1311.2868 (the complete set of homogeneous 2D Hilbert curves: variants and textures)
- https://hackage-origin.haskell.org/package/spacefill (Hilbert / Moore / Peano / Gosper generators; Moore as the closed variant)
- https://creators.vice.com/en/article/53wye5/machine-draws-famous-mathematicians-with-the-math-they-invented (Will Gallia's pen-plotted space-filling portraits)

---

## 2026-10-17 — `maze` · Maze

**Territory:** Mazes and labyrinths (graph-carving algorithms on square and polar grids, not a tiling, knot or curve).

**Idea.** A perfect maze is a spanning tree of a grid of cells: there is exactly one route between any two
cells. Jamis Buck's "growing tree" carver covers a family of algorithms with one rule. Keep a list of active
cells, take one, carve into a random unvisited neighbour, and drop the cell when it has none. Always taking
the newest cell gives the recursive backtracker (long, winding corridors). Taking a random one gives a
Prim-like maze (short, bushy dead ends). The same carver runs on a circular *theta* grid: concentric rings
whose cell counts double outward whenever the cells grow about twice as wide as they are tall, so cells
stay roughly square. Braiding knocks dead ends through into loops. For relief work the useful property is
that the walls of a perfect maze form one tree hanging off the frame, so the wall relief is one connected
piece. Drawn the other way round, the passage tree itself becomes a branching, coral-like shape.

**How the code realises it.** `generateBoard` builds a neighbour graph (square: E/S/W/N; theta: cw/out/ccw/in,
with ring counts `n_i = n_{i-1}·round(2πi / n_{i-1})`) and runs the growing tree with a seeded RNG.
`branch` is the chance of picking a random active cell instead of the newest. `straight` is the chance of
carving on in the direction the cell was entered. `braid` links a fraction of dead ends to a neighbour,
preferring another dead end. In *Walls* mode, square walls are merged into collinear runs along each grid
line (with per-cell vertices so width can vary). Theta walls become arc runs on each ring radius (sampled at
≤2 mm chords; a fully closed ring becomes one closed loop) plus radial walls on each cell's ccw side. The
round stroke caps give rounded wall ends, and the field's smooth union fillets the T-junctions. *Passages*
mode draws the carved links between cell centres; theta links run along ring midlines and drop radially to
the parent ring. Doors open the left and right frame (square) or one outer cell (theta, with the centre as
the goal). Wall radius is `width × cell / 2`, swelled by field points, clamped to 0.85 of the cell (so
corridors never close) and to at least 0.3 mm. Output is strokes only.

**Params.** Grid: `grid` (square / theta), `cols`, `rows` (rings for theta), `margin` · Carve: `branch`,
`straight`, `braid`, `doors`, `seed` · Draw: `draw` (walls / passages), `width` (× cell), `fillet`,
`fieldWidth`.

**Presets.** Maze (15×15 square, backtracker-ish, walls with entrance and exit) · Theta maze (10 rings,
straighter corridors) · Maze coral (18×18 passages, branchy, lightly braided, thick filleted tree).

**Inspiration.**
- https://educative.io/courses/mazes-for-programmers/understanding-polar-grids (Buck's polar/theta grid subdivision)
- https://rubyevents.org/talks/twisty-little-passages (Jamis Buck, "Twisty Little Passages": hex, polar and other cell shapes)
- https://pypi.org/project/the-maze-py/ (port of the Mazes for Programmers algorithms and grids)
- https://history.siggraph.org/?p=115338 (Xu & Kaplan, Image-guided maze construction: mazes as tone and texture)
- https://pzwiki.wdka.nl/mediadesign/User:Alessia/Pen_plot_this_maze!‧ (plottable maze generator, the mazes-as-artefacts angle)

---

## 2026-10-18 — `streamlines` · Streamlines

**Territory:** Flow fields / scientific flow visualisation (evenly spaced streamline placement, not a tiling, knot, curve or maze).

**Idea.** Tyler Hobbs-style flow fields drawn with Jobard & Lefer's 1997 evenly-spaced-streamlines algorithm,
so the curves never overlap and are spaced evenly across the board. The vector field is designed, not
random: a uniform drift plus a few seeded singularities. Each singularity is a source or sink rotated by a
*spin* angle toward a vortex, so 0° gives magnet-style field lines, 90° gives whirlpools and anything in
between gives spirals. A smooth noise field twists the direction on top. Lines start and stop where the flow
converges or diverges, which gives the fingerprint and wood-grain look. Field points add extra vortices you
can drag around. For relief work, each line is a band that thins wherever a neighbour comes close, so there
is always a minimum gap between bands, and the free ends taper like brush strokes.

**How the code realises it.** `generateBoard` builds `vel(x, y)` = drift + Σ singularities (radial unit
vector rotated by spin, magnitude `s·L / (r + core) `) + field-point vortices, then rotates it by
`noise·π·n(x, y)` (seeded quintic gradient noise). The greedy Jobard–Lefer loop goes like this. Trace a
streamline both ways from a seed with midpoint RK2 (step ≤ 1 mm). Stop at the margin, near a singularity,
within `test × spacing` of another line (uniform-grid lookup), or on self-approach. If a line returns to its
own start with the same heading, it closes into a ring. New seeds are tried one spacing to either side of
every finished line. When the queue drains, the board is scanned in seeded random order for holes to restart
from. Lines shorter than 2.5 spacings are dropped. Band radius per point is
`min(width·spacing/2, (d_nearest − gap)/2)`, lightly smoothed and never above that bound. Open ends get a
sine taper over `taper` mm. Points thinner than 0.3 mm radius (0.6 mm wide) are trimmed, splitting the band
there, and short leftovers are discarded, so there are no hairlines or specks. Centrelines stay inside
margin + band radius, so nothing is clipped. Output is strokes only.

**Params.** Flow: `field` (mixed / swirl / dipoles / noise), `count`, `spin`, `flow` (drift), `angle`,
`noise`, `seed` · Lines: `spacing` (mm), `test` (stop distance × spacing), `margin` · Band: `width`
(× spacing), `taper` (mm), `gap` (min mm), `fillet` · Field points: `fieldSpin` (points → vortex strength).

**Presets.** Streamlines (three mixed singularities with spin 70°: fingerprint whorls in a drift) · Flow drift
(noise only: Hobbs-style combed grain with long tapers) · Magnet lines (two dipole pairs, spin 0°: iron-filing
field lines).

**Inspiration.**
- https://www.tylerxhobbs.com/words/flow-fields (Tyler Hobbs, Flow Fields: the generative-art technique)
- https://www.cg.tuwien.ac.at/courses/Visualisierung1/2015W/exercises/Streamlines_Jobard&Lefer.pdf (Jobard & Lefer, evenly spaced streamlines)
- https://github.com/The-Erebor-Foundry/lefer (library for non-overlapping, evenly spaced flow-field curves)
- https://se.mathworks.com/matlabcentral/fileexchange/59476-evenly-spaced-streamlines (tapered evenly spaced streamline styles)
- https://infiniteimages.toledomuseum.org/?p=431 (Fidenza: flow-field curves as finished artwork)

---

## 2026-10-19 — `multigrid` · Multigrid

**Territory:** Quasicrystal / aperiodic rhombus tilings (de Bruijn's multigrid dual method; the quasi-periodic
cousin of the periodic strapwork in Hankin Stars, built by a wholly different rule).

**Idea.** N. G. de Bruijn showed that a Penrose rhombus tiling is the dual of a *pentagrid*: five families of
equally spaced parallel lines at 72° to each other, each shifted by an offset γ. Every crossing of two lines is
one rhombus, and the four cells round the crossing are its four corners. Because the construction only needs
the star of line directions, the same rule gives the whole family of n-fold quasicrystal tilings: 4 families
at 45° give the Ammann–Beenker squares and 45° rhombi, 6 at 30° the twelvefold tiling, 7 and 9 the odd-fold
ones, and 3 at 60° the periodic rhombille as a sanity check. Equal offsets of ½ give an exact 2n-fold centre
(the classic Penrose "cartwheel" look); other equal offsets give the generalised Penrose tilings, and a little
seeded scatter breaks the symmetry into an irregular but still matched pattern. The angle class of each
rhombus (which pair of families made it) is known, so fat-only, thin-only or alternate-class selections pick
out the stars and rings that are hidden in the full tiling. For relief work every tile is inset by half a gap
and its corners rounded, so the result is a field of closed convex pads; the edge mode draws the same tiling
as one strapwork lattice.

**How the code realises it.** `generateBoard` builds n unit vectors e_m at angles 2π·m/s (n = s for odd s,
s/2 for even s), draws offsets γ_m = shift + scatter·(seeded ±½), and for every family pair (i, j) and every
line pair (k_i, k_j) within reach solves the 2×2 system for the crossing z. The rhombus corners are
Σ_{m≠i,j} ⌈z·e_m − γ_m⌉·e_m + (k_i + a)·e_i + (k_j + b)·e_j for a, b ∈ {0, 1}, scaled by the edge length and
placed about the (movable) tiling centre. The reach uses f(z) ≈ (n/2)·z to cover the board's farthest corner.
*Tiles* mode keeps the chosen classes (or a seeded fraction), insets each rhombus by gap/2 plus the field
shrink, drops any whose remaining inradius is under 0.5 mm, and makes its SDF as an exact convex-polygon
distance of the shrunk core minus the corner radius (a tile the radius swallows becomes a disc). Tiles are
binned by edge length so the field evaluation looks at ≤ 9 bins, and the whole set is clipped to a rounded
board rectangle or a circle with a soft max. *Edges* mode dedupes the rhombus edges by rounded endpoints and
emits each as a band of constant radius, clipped by the shared margin rectangle or trimmed to the circle.

**Params.** Grid: `fold` (5 Penrose / 6 rhombille / 7 / 8 Ammann–Beenker / 9 / 11 / 12 / 16), `size` (edge mm),
`rotate`, `shift` (grid offset), `scatter`, `centreX`, `centreY`, `seed` · Tiles: `draw` (tiles / edges),
`select` (all / fat / thin / alternate / random), `fill`, `gap`, `round`, `width` (band mm), `fillet` ·
Board: `outline` (board / circle), `margin`, `edgeRound`, `fieldShrink`.

**Presets.** Penrose tiles (5-fold, offset ½: tenfold cartwheel of rounded rhombi) · Ammann stars (8-fold,
thin rhombi only in a circle: eight-point stars) · Twelvefold strapwork (12-fold edge lattice) · Sevenfold
scatter (random offsets, 70 % of tiles kept, soft corners: a pebble mosaic).

**Inspiration.**
- https://ar5iv.labs.arxiv.org/html/2004.10128 (multigrid construction of n-fold rhombus tilings; offset conditions for regularity and global symmetry)
- https://www.ams.org/featurecolumn/archive/ribbons.html (AMS feature column: Penrose tilings and de Bruijn's pentagrid duality)
- https://physics.emory.edu/~weeks/software/exquasi.html (Eric Weeks' generalised dual method program and pictures)
- https://physicsworld.com/a/islamic-quasicrystals-predate-penrose-tiles/ (Lu & Steinhardt: girih tiles and Penrose-like patterns at Darb-i Imam)
- https://mathematicians.org.uk/projects/penrose-tiles/ (laser-cut Penrose tiles in oak and walnut: the relief/cut-out angle)
- https://github.com/jesusfreke/pynrose (pynrose: Penrose tilings as SVG for laser and CNC)

---

## 2026-10-20 — `guilloche` · Guilloché

**Territory:** Guilloché / rose-engine "engine turning" (ornamental-turning craft rule; concentric but built by a
phased-cam construction, unlike the radial Rays/Spokes/Polygon Ring motifs or the concentric Op Art stripes).

**Idea.** A rose engine rocks the workpiece against a *rosette* cam while it turns, so the cutter traces a lobed
circle r(θ) = R + A·cos(n·θ + φ). The pattern is cut one pass at a time: each pass steps the radius out by one
*pitch* and the index plate shifts the rosette's phase by a fraction of a lobe. The whole look comes from how
that phase is indexed. Advancing it by a fixed fraction every pass twists the lobes into spirals; alternating by
half a lobe makes neighbouring passes bulge into each other so the space between them breaks into the lattice
of grains called *barleycorn* (grain d'orge); cutting every pass twice, phased a little either side of the
barleycorn phase, chains lenses along each ring for a *basketweave*. Deeper cams toward the rim are a linear
amplitude ramp, and the eccentric offset-circle guilloché of watch dials is a centre that walks across the
passes.

**How the code realises it.** `generateBoard` counts the passes that fit (inscribed circle inside the margin,
or out to the far corner with the margin rectangle as `clip` for board fill) and emits each pass as one closed
polyline of constant radius `width / 2` (chords ≤ 0.7 mm, ≥ 16 samples per lobe). Lobe shaping is
sign(c)·|c|^q with q = e^(1.2·sharp), which keeps the zero crossings and extrema in place while pointing or
squaring the lobes. The amplitude of each pass is `amp × pitch` times the ramp, capped at 0.3 of the lobe's arc
length so the innermost passes stay gently waved instead of folding into a spiky knot; field points scale it
locally. Phases: phased = k·step·2π, barleycorn = (k mod 2)·π, crossed = barleycorn ± step·2π. The band is
capped at 0.8 pitch so passes never weld into a disc, and the centre drift is capped so the bunched side keeps
≥ 0.8 mm between bands. Output is strokes only, so the field's smooth union fillets every crossing and the
G1 Bézier fit gives closed curves.

**Params.** Rosette: `pattern` (phased / barleycorn / crossed), `lobes`, `amp` (× pitch), `sharp`,
`phaseStep` (lobes per pass), `rotate` · Passes: `pitch` (mm), `rIn`, `fit` (circle / board), `margin`,
`ampRamp`, `drift` (mm) · Band: `width` (mm), `fillet` · Field points: `fieldAmp`.

**Presets.** Barleycorn (12 lobes, half-lobe alternation: the grain lattice) · Rose engine twist (8 pointed
lobes phased 0.07 lobe per pass with the amplitude ramping outward) · Basketweave (16 lobes cut twice at
±0.14 lobe, filling the board) · Eccentric dial (6 soft lobes alternating, centre drifting 14 mm).

**Inspiration.**
- https://en.wikipedia.org/wiki/Rose_engine_lathe (rosette cam + rocking headstock = Spirograph in metal)
- https://barringtonwatchwinders.com/pages/guilloche (rosette count, amplitude, click-plate indexing between passes)
- https://www.the-sot.org/Forum/Q.A._RoseEngine_Basketweave_Barleycorn.pdf (Society of Ornamental Turners: phase the rosette by a half, quarter or third of a bump between rows for basketweave and barleycorn)
- https://MathWorld.Wolfram.com/GuillochePattern.html (guilloché as nested sinusoids between inner and outer envelopes)
- https://www.creighton.edu/fileadmin/user/archives/docs/RiggeSJCuspidalRosettes.pdf (Rigge 1919, the rosette as the polar curve a + b·sin nθ with an initial phase)
- https://community.carbide3d.com/t/guilloche-spirograph-vector-generator/20227 (CNC makers hunting for a vector guilloché generator: the cut-out/relief angle)

---

## 2026-10-21 — `chladni` · Chladni

**Territory:** Acoustics / cymatics — the sand figures of a vibrating plate (a physics rule: nodal lines of
standing-wave modes; not a tiling, knot, curve, maze, flow field or lathe construction).

**Idea.** Bow a plate dusted with sand and the grains hop off the moving antinodes and settle along the nodal
lines, the still curves of the standing wave. For a rectangular plate the (n, m) mode is a product of cosines
(free edges) or sines (pinned edges), and the classic centre-driven Chladni figures are the *difference* of a
mode and its transpose: cos(nπx/W)·cos(mπy/H) − cos(mπx/W)·cos(nπy/H) = 0. One `mix` knob slides from that
difference (−1) through the single mode (0, a plain grid of cells) to the sum (+1). A circular plate clamped at
its rim has modes J_n(z·r/R)·cos(nθ) with z the m-th zero of the Bessel function J_n — n nodal diameters and
m − 1 nodal circles — mixed with the transposed (m, n) mode the same way. The figure is drawn three ways: the
nodal *lines* as sand ridges of a set width, the *plates* between the lines inset by a set gap, or every other
plate (one sign of the mode).

**How the code realises it.** `generateBoard` returns an `evalFn` (implicit field) rather than primitives.
The mode f(x, y) is evaluated on the plate inside the margin (so the plate's own edges are the board outline:
a rounded rectangle or the inscribed circle). J_n is computed by Bessel's integral with a midpoint rule
(spectrally convergent, sample count ∝ n + x), the zeros by scan-and-bisect, and the radial profile is
tabulated on 1024 samples and interpolated so the marching grid stays cheap. Dividing f by its numerical
gradient, f/|∇f| (central differences, 0.04 mm step, capped at ±60 mm), gives an approximate signed distance
in mm to the nodal set; lines are |d| − w/2, plates are g/2 − |d|, alternate plates g/2 − d. Near a crossing
f ≈ x·y so this pseudo-distance rounds every plate corner and band junction on its own; the outline is
combined by smooth max with the `fillet`, and field points add to f (`fieldWarp`) to bend the nodal lines
locally. Degenerate inputs are clamped: n = m drops the mix (the difference form would vanish everywhere),
pinned edges force n, m ≥ 1, and the (0, 0) flat plate becomes (0, 1).

**Params.** Plate: `plate` (free / pinned / circle), `n`, `m`, `mix`, `rotate` (circle) · Draw: `draw`
(plates / lines / alt), `width` (mm), `gap` (mm), `fillet` · Board: `margin`, `edgeRound`, `fieldWarp`.

**Presets.** Chladni plates (free 5 × 2 difference, plates with a 2.6 mm gap) · Sand lines (7 × 2 difference
as 2.4 mm nodal ridges) · Drumhead (circle, 6 diameters and 4 rings, alternate plates: a dartboard of wedges)
· Pinned lattice (sin modes 4 × 6 summed, plates with a 3 mm gap and 12 mm board corners).

**Inspiration.**
- https://paulbourke.net/geometry/chladni/ (square-plate difference equation, free-plate product form, circular plate J_n(Kr)·cos nθ with K = Z_nm/R)
- https://barbegenerativediary.com/en/tutorials/how-to-create-a-chladni-figure-with-processing/ (the cos·cos − cos·cos nodal equation as a generative sketch)
- https://en.wikipedia.org/wiki/Cymatics (sand settling on the nodal lines; plate shape and frequency set the figure)
- https://www.raster.art/artwork/interference-by-phaust/about (Interference: a generative series built on the Chladni equations)
- https://vbn.aau.dk/en/publications/the-chladni-wall (The Chladni Wall: 2D Chladni patterns turned into relief sculpture)
- https://elysiatools.com/en/visualizations/chladni-cymatics-plate (interactive square/circular plate explorer)
