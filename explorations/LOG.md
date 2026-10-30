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

## 2026-10-22 — `hitomezashi` · Hitomezashi

**Territory:** Japanese sashiko embroidery — hitomezashi, the "one-stitch" running-stitch rule (a textile
construction rule with a recent mathematical literature; not a tiling, knot, curve, maze, flow field, lathe
construction or plate mode).

**Idea.** Every grid line carries a single bit. Along the line the running stitch covers every other unit
segment, and the bit says which parity it starts on. Where lines cross, each lattice point ends up with exactly
one stitch in every direction, so on the square grid the stitches chain into forced staircase strands (every
lattice point is an L-turn, never a crossing) that close into loops or run off the board, and the regions they
bound are 2-colourable — the classic two-tone embroidery read: colour(i, j) = i·j + Σv + Σh + i + j (mod 2) flips
exactly where a stitch is crossed. On the triangular grid three line families meet at every lattice point, so the
strands branch into nets and the regions become a crazy paving of triangles, trapezia and hexagonal cells. The
bits come from a seeded coin with a chosen share of 1s, a mirrored coin (lines k and −k−1 share a bit, so the
pattern is symmetric about both board axes), a word (vowels = 1, as in Ayliean MacDonald's Numberphile
demonstration), or the digits of π (odd = 1).

**How the code realises it.** `generateBoard` returns an `evalFn` (implicit field) like Chladni. The grid is
centred on the board (square lines at (k + ½)·cell so the centre is a cell; triangular lines through the centre,
spaced cell·√3/2) and may be rotated; bit arrays are built per line family over the index range that covers the
board's corners, so rectangular boards work. The field is an exact distance to the stitch set: for a point only
the two nearest lines of each family matter, and on a line only the unit segment under the point and its two
neighbours (alternation guarantees one of them is a stitch). A polynomial smooth-min between the families
(`round`, mm) rounds the convex corners of every region, while the inset gap rounds the concave ones; the result
is clamped at zero so the two-colour read stays continuous across a stitch. Draw modes: regions of one colour
(g/2 − colour·d, with `swap` picking the other class; triangular grids fall back to every region since odd-degree
vertices can't be 2-coloured), every region inset (g/2 − d), or the strands themselves (d − w/2), optionally
broken into individual stitches by pulling each stitch end back by (gap + w)/(2·sin θ/2) so the clear distance
between round caps is exactly `stitchGap`. Field points widen the strands / gaps (`fieldGain`), and the plate's
rounded-rectangle outline is combined by smooth max.

**Params.** Grid: `grid` (square / triangle), `cell` (mm), `angle` · Stitch bits: `source` (random / mirror /
word / pi), `word`, `ratio`, `shift`, `seed` · Draw: `draw` (regions / cells / strands), `swap`, `gap`, `width`,
`stitchGap`, `round` · Board: `margin`, `edgeRound`, `fillet`, `fieldGain`.

**Presets.** Hitomezashi (seeded coin, 9 mm stitches, two-colour regions) · Vowel regions (bits from the word
HITOMEZASHI, 7.5 mm) · Running stitch (π digits, strands broken into 12 mm dashes with a 1.4 mm gap) · Mirrored
sashiko (mirrored coin, every region inset, symmetric) · Triangle net (triangular grid, branching strands).

**Inspiration.**
- https://numberphile.com/videos/hitomezashi-stitch-patterns (Ayliean MacDonald: the rule, bits from vowels and digits of π, the triangular-grid extension)
- https://arxiv.org/abs/2201.03461 (Defant & Kravitz, Loops and Regions in Hitomezashi Patterns: forced strands, 2-colourable regions, loop statistics)
- https://arxiv.org/abs/2208.14428 (Extensions of Hitomezashi Patterns: triangular grid, long-stitch variants)
- https://arxiv.org/abs/2208.12580 (Seaton & Hayes, Mathematical specification of hitomezashi designs: binary-word encoding and duality)
- https://archive.bridgesmathart.org/2024/bridges2024-227.pdf (Attainable symmetry in generalized hitomezashi patterns — the mirrored-bit construction)
- https://resources.wolframcloud.com/FunctionRepository/resources/HitomezashiStitchPattern/ (odd/even parity per line as a generator input)

---

## 2026-10-23 — `hyperbolic` · Hyperbolic

**Territory:** Hyperbolic geometry — regular {p, q} tilings of the Poincaré disc, the construction behind Escher's
Circle Limit woodcuts (a reflection-group rule; not a Euclidean tiling, knot, curve, maze or flow).

**Idea.** In the hyperbolic plane any regular polygon tiles with any vertex valence as long as (p − 2)(q − 2) > 4:
heptagons three to a vertex, pentagons four to a vertex, squares five or six to a vertex. Drawn in the Poincaré
disc, straight lines become circular arcs that meet the rim at right angles and congruent tiles shrink toward the
rim, so infinitely many fit in one circle. The construction is the (2, p, q) triangle group: one right triangle
with angles π/p (tile centre), π/q (tile vertex) and π/2 (edge midpoint) is reflected across its own sides, over
and over, and the copies tile the disc without gaps. Its hypotenuses are the tile edges, the centre–midpoint legs
are the dual tiling {q, p}, and all three sides together are the kaleidoscope. Triangles are 2-colourable by the
parity of the reflections that made them (Circle Limit IV's angels and devils); {p, q} tiles are 2-colourable when
q is even. A Möbius map moves the seed so the disc is centred on a tile, a vertex or an edge midpoint.

**How the code realises it.** `generateBoard` places the seed triangle from the hyperbolic law of cosines
(cosh OB = cot(π/p)·cot(π/q), cosh OC = cos(π/q)/sin(π/p), cosh BC = cos(π/p)/sin(π/q), Poincaré radius
tanh(d/2)), optionally re-centres it with z ↦ (z − a)/(1 − āz), rotates it, then breadth-first reflects it across
its sides (a circle inversion in the geodesic through two vertices, or a mirror when that geodesic is a diameter),
deduplicating by centroid and tracking three parities. Generation stops at the Euclidean radius where a cell's
inscribed circle would drop below `minEdge` mm (lengths scale by (1 − r²)/2), never below ~2 gaps, and one layer
beyond; everything outside that radius becomes a solid rim, so there are no hairlines or specks. Triangle sides
are deduplicated, then sides lying on the same geodesic are chained into one arc (keeping the parity per
half-edge, since cells alternate along a mirror line) so the corner rounding only fires between arcs on different
geodesics. The field is the exact distance to the arcs, found through a uniform grid of bins in which every arc
is registered wherever it can be within the distance cap; a polynomial smooth-min between arcs rounds the convex
corners of each cell and the inset gap or band width rounds the concave ones. The parity of the cell at a point
is read from the nearest arc (which always bounds the containing cell) and the side of it the point is on. Styles:
every cell inset by a gap, alternate cells (checkerboard; falls back to all cells when the colouring does not
exist), or the edges as bands. The disc is `min(w, h)/2 − margin`, so rectangular boards get a centred disc.

**Params.** Tiling: `p`, `q`, `draw` (tiles / dual / kaleidoscope), `centre` (tile / vertex / edge), `rotate` ·
Detail: `minEdge` (smallest tile, mm), `rim` (mm) · Draw: `style` (cells / alt / lines), `gap`, `width`, `round`
(mm) · Board: `margin`, `fillet`, `fieldGain` (points widen the gap or band).

**Presets.** Heptagon disc ({7, 3}, inset cells) · Circle limit ({6, 4} kaleidoscope, alternate triangles, centred
on a vertex) · Pentagon lattice ({5, 4} edges as bands, centred on an edge) · Square swarm ({4, 6} alternate
tiles, rotated 45°).

**Inspiration.**
- https://en.wikipedia.org/wiki/Circle_Limit_III (Escher's hyperbolic woodcuts: the Poincaré disc as finished artwork)
- https://www.d.umn.edu/~ddunham/dunbrid06.pdf (Douglas Dunham, families of Circle Limit III-style patterns from {p, q} tilings)
- https://en.wikipedia.org/wiki/Triangle_group (the (2, p, q) reflection group that generates a regular tiling)
- https://en.wikipedia.org/wiki/Uniform_tilings_in_hyperbolic_plane (Schläfli {p, q} and the (p − 2)(q − 2) > 4 condition)
- https://openprocessing.org/sketch/429029 (reflect each pixel in the mirror circles and colour by parity of the reflection count)
- https://dmitrybrant.com/?p=104 (hyperbolic tessellations by repeated circle inversion in the Poincaré disc)
- https://archive.bridgesmathart.org/2001/bridges2001-247.html (Hyperbolic Islamic Patterns: ornament carried into the hyperbolic plane)
- https://arxiv.org/pdf/2309.10844 (HyperTiling: {p, q} lattice generation and the first-shell radius formula)

---

## 2026-10-24 — `phyllotaxis` · Phyllotaxis

**Territory:** Botanical pattern formation — spiral phyllotaxis, the seed-head rule of sunflowers, daisies and pine
cones (a growth rule from biology, not a tiling, knot, curve, maze, flow field, quasicrystal, engine-turning, plate
mode, stitch rule or hyperbolic tiling).

**Idea.** Vogel's model: seed n sits at radius c·n^spread and angle n·α. With spread ½ and α the golden angle
(360°/φ² ≈ 137.508°) every seed owns the same area, the disc packs evenly, and the eye picks out two families of
secondary spirals (parastichies) winding opposite ways whose counts are consecutive Fibonacci numbers; the
visible pair changes with radius (8/13 → 13/21 → 21/34) exactly as it does on a real seed head. Other angles
give other families (99.5° gives Lucas numbers), and a near-rational angle collapses the head into straight arms.
Three numbers, the angle, the exponent and the count, are the whole genome; everything visible follows. The same
lattice is drawn four ways: seeds (discs), scales (tapered capsules pointing outward, around, or along a spiral
family, which gives pine cones and daisies), Voronoi cells (phyllotaxis is literally the Voronoi tiling of a
spiral lattice), and parastichy bands.

**How the code realises it.** `generateBoard` builds the lattice in unit scale, measures every seed's real
nearest-neighbour distance with a bin grid, and scales the lattice so the outermost seed plus its own reach just
fits the disc (or the board's half-diagonal when filling the whole board, so rectangular boards fill to the
corners). Seeds are blobs of radius `size × d/2`, clamped so neighbours never touch. Scales are two-point strokes
of length `elong × d` with radii `[half, half × taper]`, so the shared pipeline draws teardrops; orientation is
radial, tangential, or toward seed n + k. Cells return an `evalFn`: the nearest seed is found through a 5×5 bin
neighbourhood and the field is the soft-min of signed distances to the bisectors with every other nearby seed
(`round` is the soft-min radius, so corners round themselves), inset by half the gap and closed by the disc or
rectangle outline with a gap-wide margin. Parastichy bands connect seed n to n + k. In auto mode each seed's k is
its one or two shortest steps to a later seed (second not a multiple of the first, and no step longer than 1.8
neighbour distances, so the rim gets no chords), which follows the visible families as they change outward; a
fixed step draws one Fibonacci family (plus the next number up as its partner). Band half-width follows the
family's *lateral* spacing, (area of the seed's annular slice) / (step length), clamped to half that spacing, so
bands of one family never merge and a family fades where it stops being visible instead of filling solid.
Segments sharing an endpoint are chained into longer strokes. Nothing narrower than 0.6 mm is emitted; field
points scale seed size, scale size, band width or cell gap through `fieldGain`.

**Params.** Lattice: `angle` (divergence °), `count`, `spread` (growth exponent), `hole` (skip centre seeds),
`rotate`, `mirror` · Draw: `draw` (seeds / scales / cells / spirals), `size`, `elong`, `taper`, `orient`,
`gap`, `round`, `auto` (follow visible families), `step`, `both`, `width` · Board: `clip` (disc / whole board),
`margin`, `fillet`, `fieldGain`.

**Presets.** Sunflower (golden-angle seeds) · Pine cone (radial teardrop scales) · Seed cells (Voronoi tiling of
the lattice) · Fibonacci bands (one 13-family, fingerprint whorl) · Parastichy lattice (both visible families as
crossing bands) · Lucas daisy (99.5°, scales along the 18-family, filling the whole board).

**Inspiration.**
- https://en.wikipedia.org/wiki/Golden_angle (the golden angle and Vogel's planar model)
- https://algorithmicbotany.org/papers/abop/abop-ch4.pdf (Prusinkiewicz & Lindenmayer, *The Algorithmic Beauty of Plants*, ch. 4: phyllotaxis models)
- https://arxiv.org/pdf/1301.7568 (On geodesics of phyllotaxis: phyllotaxis as the Voronoi tiling of a spiral lattice; parastichy transitions)
- https://arxiv.org/pdf/1608.05824 (Phyllotaxis, disk packing and Fibonacci numbers)
- https://arxiv.org/pdf/1301.4190 (Pushed pattern-forming fronts and optimal packing: smooth parastichy transitions)
- https://openprocessing.org/sketch/6898/ (Fermat-spiral sketches on OpenProcessing, the generative-art angle)

---

## 2026-10-25 — `weave` · Weave

**Territory:** Textile structure — the handloom draft (threading, tie-up, treadling) and the binary drawdown
it produces. This is a cloth-construction rule, not a tiling, knot, curve, maze, flow field, quasicrystal,
engine-turning pass, plate mode, stitch rule, hyperbolic tiling or growth pattern.

**Idea.** A woven cloth is fully described by a draft. Warp thread i is drawn through shaft T(i), pick j presses
treadle R(j), and the tie-up U says which shafts each treadle lifts, so warp i is on top at pick j exactly when
U[R(j)][T(i)] is set (the matrix product F = R · Uᵀ · T). Some well-known structures fall out of small changes
to the three tables. Plain weave is two shafts. Twill is a circulant m-up/n-down tie-up on a straight draw.
Herringbone reverses the threading every few ends at a broken (offset) seam. Diamond / bird's-eye point-draws
both threading and treadling. Satin lifts one shaft per pick, stepping by a number coprime to the shaft count.
Basket groups the threads of plain weave in twos or threes. A random draft uses a seeded tie-up with
random-walk threading and treadling, as handweavers' networked drafts do. In the relief, each *float* (a run
where one thread stays on top) is a raised pillow, and the gaps where it dives under the crossing thread give
woven cloth its look.

**How the code realises it.** `generateBoard` builds the draft from `structure` and returns `up(i, j)`. The
draft is centred on the board so point and broken draws mirror about the middle. The grid is
floor(W / pitch) × floor(H / pitch) cells within the margin, so rectangular boards fill properly. Warp floats
are runs of up-cells in each column, and weft floats are runs of down-cells in each row. Each float is one
tapered stroke. Its round tips stop `gap` short of the edge of the crossing thread (or of an imagined one past
the cloth edge), and its radius rises from `pinch` × half-width at the tips to the full half-width over about
half a pitch (a smoothstep under a square root), which gives a pillow or lens. Thread half-width is capped at
(pitch − gap) / 2, so parallel threads never touch. Every float is therefore its own closed island: on every
test the shape count equalled the stroke count. Random drafts break floats longer than 6 cells. `ripple`
displaces the whole cloth through one smooth sine field, and its amplitude is capped at 4 % of the wavelength
so local strain stays ≤ 25 % and clearances stay ≥ 0.6 mm. Field points thicken or thin threads through
`fieldGain`, still capped by the room between threads. Nothing narrower than 0.6 mm is emitted.

**Params.** Draft: `structure` (plain / basket / twill / herringbone / diamond / satin / random draft), `up`,
`down`, `block` (reverse every n ends), `group` (basket), `shafts` (satin / random), `flip` (Z twill), `seed` ·
Threads: `pitch`, `width` (× room), `gap`, `pinch` (float end taper), `faces` (warp and weft / warp floats only
/ weft floats only) · Ripple: `ripple`, `rippleLen` · Board: `margin`, `fillet`, `fieldGain`.

**Presets.** 2/2 twill (the default diagonal cloth) · Herringbone (warp floats only, so the chevrons read
clearly) · Bird's-eye diamond (point-drawn 2/2) · Rippled basket (2×2 hopsack bent by a gentle ripple) ·
Satin floats (5-shaft satin, weft floats only: staggered long bars).

**Inspiration.**
- https://www.blackmountaincollege.org/journal/volume-15/blazejack/ (weaving drafts as notation: threading, tie-up, treadling and drawdown)
- https://www2.cs.arizona.edu/patterns/weaving/webdocs/mo/D/FabricAnalysis.pdf (Fabric analysis, from drawdown to draft: the tie-up loop as an algorithm)
- https://ulp.cs.arizona.edu/patterns/weaving/webdocs/gre_seqd.pdf (threading and treadling sequences as generative inputs)
- https://archive.bridgesmathart.org/2024/bridges2024-235.pdf (Bridges 2024: weaves as binary grids, twills as circulant matrices)
- https://pyweaving.readthedocs.io/en/latest/_modules/pyweaving/generators/twill.html (pyweaving's twill generator: rotating tie-up window)
- https://observablehq.com/@galopin/the-art-of-weaving (the (i + j) mod N rule for twill drawdowns)
- https://www.lumberjocks.com/posts/2025039 (hand-carved basket-weave relief, rounding the tops of the floats: the target look for a relief)

---

## 2026-10-26 — `seigaiha` · Seigaiha

**Territory:** Japanese seigaiha ("blue ocean wave") and the Art Deco fish-scale fan: a *layering* rule, where
rows of identical scales overlap and each new row hides part of the one behind (not a tiling, knot, curve, maze,
weave or radial construction).

**Idea.** Identical scales sit on an offset grid. In the classic proportion the horizontal pitch is one diameter,
alternate rows shift by half a pitch, and rows sit R/2 apart. They are laid down row by row with each row in front
of the last, so every scale loses its lower part to the scales in front. What is left is a crest of nested arches
whose feet tuck under the two scales below. Fill each scale with concentric rings and you get the wave. Fill it
with radial ribs under a rim and you get the Deco fan. You can also mix the two by row, checkerboard or seeded
coin flip. The outline can be made taller or flatter and drawn up to a pointed ogee top, which turns the waves
into fish scales or roof tiles. A looser row step opens the overlap into separate scales.

**How the code realises it.** The occlusion is computed, not painted on. `generateBoard` lays out every scale
whose outline touches the margin rectangle, and gives each one a list of the scales in front of it (later rows
within reach). Each ring is the outline scaled about the centre. Each rib is a straight run along one outline
direction. Rings and ribs are sampled about every 1.2 mm. A sample survives only if it sits at least `gap` plus
its own half-width outside every scale in front (measured as signed distance to a 120-gon of that scale's
outline) and inside the margin. Run ends are refined by bisection, and each visible run is emitted as a
round-capped stroke. So cut ends stand exactly `gap` off the scale in front, and the board edge never leaves a
sliver. Runs shorter than a band width are dropped. Ring pitch and band half-width are linked so neighbouring
rings keep at least 0.6 mm between them in the outline's narrowest direction, and bands are never thinner than
0.6 mm. A solid centre is a circle of radius a/2 drawn with half-width a/2, so it gets cut like any ring. Ribs
start at the radius where neighbours are one band plus one gap apart, with fewer ribs if that radius is too far
out. Field points thicken or thin the bands, capped so the gaps still hold. "Fans open downward" mirrors the
whole build.

**Params.** Scales: `size` (radius mm), `pitch` (× diameter), `rowStep` (× radius), `aspect`, `point`, `flip` ·
Fill: `fill` (rings / ribs / alternate rows / checkerboard / random), `rings`, `ribs`, `hub`, `seed` · Bands:
`weight`, `gap` (tuck gap mm), `margin`, `fillet`, `fieldGain`.

**Presets.** Seigaiha waves (classic 5-ring wave) · Deco fans (16 ribs under a rim, looser rows) · Ogee scales
(tall pointed scales, rings and fans on alternate rows).

**Inspiration.**
- https://levelup.gitconnected.com/how-to-create-seigaiha-pattern-using-p5-js-code-b9061b28b81e (seigaiha as offset rows of concentric circles)
- https://www.toptal.com/designers/subtlepatterns/seigaiha/ (the classic proportions)
- https://inkscape.org/zh-hans/~Damry/%E2%98%85seamless-fish-scale-or-fan-pattern-in-inkscape (fish-scale/fan unit and its symmetry)
- https://design.tutsplus.com/tutorials/how-to-create-an-art-deco-pattern-in-illustrator--cms-107702 (Art Deco fish-scale fan construction)

---

## 2026-10-27 — `growth` · Growth

**Territory:** Generative simulation — differential line growth (a physical/biological growth rule, not a tiling,
knot, curve construction, flow field or reaction–diffusion).

**Idea.** Differential growth as described by Anders Hoff (inconvergent) and Jason Webb: a closed line of nodes
is relaxed under three rules — each node is pulled toward the midpoint of its neighbours (smoothness), pushed
away from every node within a set radius (folds keep their distance), and any edge that grows too long is split
(new material). Material arrives faster than repulsion can spread it, so the loop buckles and folds into
brain-coral meanders that pack whatever boundary it is grown in. Hoff's "shepherding" adds extra random splits
weighted toward already-curved nodes, which pushes the growth into tighter lobes and fingers. Unlike Turing
(a field that is thresholded), the result is always a single unbroken band per seed, so it exports as one closed
ring of material with one hole per loop — ideal for a relief or a cut-out.

**How the code realises it.** `generateBoard` seeds loops (one small centre ring, scattered seed rings plus one per
field point, or one big ring just inside the boundary that can only buckle inward). Each step builds a
counting-sort uniform grid (cell = spacing), computes smoothing + repulsion + seeded jitter for every node with a
Jacobi update and a capped move, and pushes nodes back inside a signed-distance boundary (rounded rectangle or
ellipse fitted to the board's actual width and height). Edges longer than half a spacing are split, plus ~0.6 %
curvature-biased random splits per step. Growth stops when total line length reaches Fill × area ÷ spacing (or a
9000-node / 2500-step cap), then 40 non-growing steps settle the spacing. Each loop becomes a closed stroke whose
radius is limited by the nearest non-adjacent node minus the gap (so neighbouring folds never touch), optionally
tapered from oldest to newest nodes ("Swell"), smoothed and floored at 0.3 mm (0.6 mm bands). The whole result is
memoised on params + board + field points, so dragging render/export settings doesn't rerun the simulation
(0.1–1.7 s per run in Node depending on spacing and board size).

**Params.** Growth: Start from (centre / scattered seeds / boundary ring), Seeds, Fill, Spacing (mm), Curvature bias,
Wiggle, Seed · Bounds: Shape (rounded rectangle / ellipse), Margin · Band: Width (× spacing), Swell, Min gap, Fillet.

**Presets.** Brain coral (defaults) · Buckled frame (boundary ring, strong curvature bias, swell) · Coral colonies
(scattered seeds in an ellipse, 5 mm spacing).

**Inspiration.**
- https://inconvergent.net/2016/shepherding-random-growth
- https://medium.com/@jason.webb/exploring-2d-differential-growth-with-javascript-1843fd51b0ce
- https://docs.cycling74.com/learn/articles/geom-differential.growth
- https://www.raster.art/artwork/spaghetti-bones-by-joshua-bagley/about

## 2026-10-28 — `packing` · Circle Pack

**Territory:** Packing problems — greedy circle packing, the generative-art staple (Tyler Hobbs' QQL, endless
Processing sketches) and the Koebe–Thurston idea of a packing as a *tangency graph* (not a tiling, lattice, curve,
flow field or growth simulation).

**Idea.** Fill a region with non-overlapping circles by always taking the roomiest hole next: big circles claim the
open space first and smaller ones fill what's left, so the board packs densely Apollonian-style with a guaranteed
gap between every pair. The circles themselves are only the skeleton; the look comes from how they are read —
discs, rings, concentric targets, rings packed again inside with smaller rings, or a tangency network where every
ring is bridged to the neighbours it nearly touches, turning the packing into one connected froth (ideal for a
cut-out: it exports as a single piece).

**How the code realises it.** `generateBoard` runs a seeded best-of-24-candidates packer: each round samples points,
computes each one's largest feasible radius (signed distance to the board rectangle or disc, minus the distance to
every placed circle and the gap), caps it by a size profile (uniform, big centre, big edge, left→right or
top→bottom ramp, blended by strength and scaled by field points), and accepts the best one ≥ the minimum radius;
200 failed rounds in a row ends the packing. Rings are closed polylines of constant radius whose outer edge sits on
the circle; a circle too small to keep a ≥ 0.6 mm hole becomes a disc instead. Concentric steps inward by band +
spacing and finishes with a centre dot when one fits. Nested packs each ring's interior once more (up to 80
children, radius ≤ half the free interior). Network bridges every pair within 1.6× the gap, centreline to
centreline, then ties any circle left without a bridge to its nearest neighbour. Defaults pack 93 circles on a
200 mm board in a few ms; the default network exports as one path with 122 loops.

**Params.** Packing: Max circles, Largest radius, Smallest radius, Gap, Size profile, Profile strength, Seed ·
Draw: Draw (discs / rings / concentric / nested / network), Band width, Ring spacing, Bridge width ·
Board: Fill (whole board / disc), Margin, Merge, Points → grow.

**Presets.** Bubble froth (defaults: tangency network) · Target pack (concentric rings, big in the centre) ·
Nested bubbles (nested rings in a disc).

**Inspiration.**
- https://www.tylerxhobbs.com/words (Tyler Hobbs' essays; QQL's circle-packing algorithm)
- https://www.holo.mg/?p=48083 (QQL: Analogs — paintings from Hobbs' circle-packing outputs)
- https://talk.observablehq.com/t/packing-circles-into-polygons/5612 (packing circles into polygons, after Hobbs)
- https://kxvin.pages.dev/experiments-in-circle-packing (generative variations: grow-until-touching, nested packings)
- https://www.r-bloggers.com/2015/07/graph-based-circle-packing/ (packings as tangency graphs, Koebe–Thurston / Collins–Stephenson)
- https://www.mpda.upc.edu/s/MPDA_Master_Thesis_-_Weston_Porter_-_Generation_and_Assembly_of_Polymorphic_Fixed_Radius_Circle_Pack.pdf (tangent connections realised as physical bridges)

---

## 2026-10-29 — `meander` · Meander

**Territory:** Classical border ornament — the Greek key (meander fret) and the Aegean Bronze-Age running spiral /
Vitruvian "running dog" scroll (a frieze construction rule, not a tiling, knot, maze or space-filling curve).

**Idea.** A classic Greek key is a *double spiral*: the line winds in, turns back at the centre and winds out again
between its own coils, so each unit is symmetric under a half-turn about its centre. That makes the square key and
the round running spiral the same structure, one with square corners and one with round ones. Units chain along a
band in two ways: *alternate* (every other unit mirrored, joined by short links along the top and bottom, as in
the classic frieze) or *running* (all units the same way round, joined by a drop between keys or an S-wave between
spirals, the "running dog"). Bands stack to fill the board, edged with rails if wanted.

**How the code realises it.** On a unit grid the inward half of a key is a turtle walk with leg lengths n, n−1, …, 1,
turning clockwise each time (n = Key legs). One more half step reaches the half-turn centre, and the outward half is
the inward half rotated 180° about it. Every pair of parallel legs ends up exactly one unit apart, entering bottom-left
and leaving top-right for any n ≥ 2. Corners are optionally replaced by quarter arcs (≤ ½ unit). The round unit uses two
Archimedean arms, 2 units of radius per turn and interleaved half a turn apart, so neighbouring coils stay 1 unit
apart. They join through a cubic S at the eye, and the outer ends always sit at top and bottom so links run
horizontally. Alternate chains reverse every other spiral's handedness and join them with straight top or bottom
links. Running chains join top-to-bottom with a cubic S-wave, pitch 2R + 1.5 units. `generateBoard` fits as many units
as the band length allows (width is linear in the count), stacks rows top to bottom with a row gap (mixing key and
spiral rows if chosen), centres everything, and can reverse or flip alternate rows or turn bands vertical for tall
boards. Each band is one long round-capped stroke and each rail one more, so the export is a handful of long closed
outlines: the default board exports as 12 paths. Half-width is clamped so lines are ≥ 0.6 mm wide with ≥ 0.6 mm between
them. The harness measured a worst-case gap of 1.3 mm across 25 random sets and 27 targeted variants on square,
wide and tall boards.

**Params.** Key: Style (Greek key / running spiral / alternate rows), Key legs, Spiral turns, Chain (alternate /
running), Spread, Corner round · Line: Grid unit, Line weight · Rows: Rails, Row gap, Alternate rows (same / run the
other way / upside down), Vertical bands · Board: Margin, Merge, Points → weight.

**Presets.** Greek key frieze (defaults: 4-leg alternate key with rails) · Running dog (running spiral wave) · Key
and spiral courses (key rows alternating with spiral rows, every other row reversed).

**Inspiration.**
- https://theedkins.co.uk/jo/greekkey/turns.htm (Jo Edkins: Greek keys as double spirals; "turns" belong to the generator)
- https://theedkins.co.uk/jo/greekkey/intro.htm (Greek key styles and generators)
- https://homepages.math.uic.edu/~kauffman/Meander.pdf (Kappraff, Radović & Jablan: key patterns derived from a prototile and op-tile)
- https://www.designingbuildings.co.uk/wiki/Vitruvian_scroll (the running dog / Vitruvian wave as a frieze motif)
- https://www.britannica.com/art/running-dog-pattern (running-dog pattern)

---

## 2026-10-30 — `tracery` · Tracery

**Territory:** Gothic architecture — window tracery, the mason's compass-and-straightedge setting-out of the
window head (a European medieval construction rule; not a tiling, knot, curve, maze, flow field, lathe, plate,
stitch, growth, packing or frieze rule, and unlike Hankin Stars it is built from arcs struck off a springing line,
not from polygons in contact).

**Idea.** A Gothic window is a two-centred pointed arch over n lights: both arcs are struck with one radius from
centres on the springing line (radius = span gives the equilateral arch), and the whole head is built from the same
compass settings. Three historical heads are read as rules. *Intersecting / Y-tracery* (c. 1300): every mullion and
jamb branches into two arcs of the same radius as a j-light arch, so the bars cross in lozenges and run on to the
window edge — j = lights gives the classic intersecting head, j = 1 the Y-tracery lancets. *Reticulated* (early
14th c.): the net of ogee-ended lozenges — a honeycomb of pointed hexagons one light wide whose vertical sides
continue the mullions and whose upper sides are S-curves meeting in a point. *Perpendicular panel* tracery: mullions
run straight up to the arch, transoms cross them, and every panel is capped with a small pointed head. Then the
geometrical-tracery step: wherever a pocket in the head is large enough, a foiled roundel is set into it, tangent to
its neighbours.

**How the code realises it.** `generateBoard` divides the board into `windows` arches of span W. The arch radius is
`arch`·W (clamped so the rise fits the board; a square head keeps the same springing height and is cut flat by the
lintel). `sdWin` is the window's signed distance (rectangle below the springing, the two arch discs above) and
every bar is a polyline clipped against it, with run ends bisected onto the exact boundary. Intersecting bars are
24-point arcs of radius j·s (s = light width) from each mullion foot, drawn for 60° so partner arcs meet in a point
or leave the window. The reticulated net stacks rows of height `vert`·s + 0.29·s, every other row offset half a
light; each upper side is one cubic from the vertical's top (vertical tangent) to the apex (arriving 17° off
vertical), which gives the reverse curve. Panels get transoms at `transom`·s pitch and equilateral heads under each
transom. Roundels are found by a largest-empty-circle search: distance to the frame and every bar segment is
sampled on a grid, strict local maxima are refined by pattern search, plateaus (tall lights, oblong panels) and
circles that would sit below the springing are rejected, and overlapping finds are deduped. Each surviving pocket
gets a ring plus 3–6 lobes tangent inside it; the lobes are 12% larger than the tangent-lobe radius so neighbours
overlap and the cusps are sharp, and each lobe's outer arc runs cusp to cusp so the foil is one closed stroke.
Field points scale bar weight. Bars are round-capped strokes ≥ 0.6 mm; the default board exports as 31 closed paths.

**Params.** Window: Windows across, Lights, Arch radius (× span), Head (pointed / square), Margin · Tracery: Style
(intersecting / reticulated / panels), Branch span (lights), Lozenge height, Panel height · Foils: Roundels (none,
ring, trefoil … sexfoil), Smallest pocket (mm) · Bars: Bar width, Mullion width, Merge, Points → weight.

**Presets.** Intersecting tracery (3 lights, full intersecting head, quatrefoils) · Reticulated net (4 lights,
trefoil-foiled lozenges) · Perpendicular panels (4 lights, cinquefoil panels under a low arch).

**Inspiration.**
- https://en.wikipedia.org/wiki/Tracery (plate, bar, geometrical, intersecting, reticulated, curvilinear and panel tracery)
- https://en.wikipedia.org/wiki/Reticulated_tracery (the touching-circle grid and ogee lozenges)
- https://www.lookingatbuildings.org.uk/styles/medieval/walls-and-windows/gothic-windows-and-tracery/decorated-tracery.html (intersecting mullions: same radius, different centres)
- https://makezine.com/article/craft/fine-art/follow-this-process-to-create-the-perfect-gothic-arch-or-reuleaux-triangle/ (two-centred arch construction)
- https://fridlington.co.uk/how-to-draw-a-trefoil (trefoil in a circle: three lobe circles on an equilateral triangle)
