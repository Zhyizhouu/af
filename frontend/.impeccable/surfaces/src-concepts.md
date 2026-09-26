---
version: 1
slug: "src-concepts"
primary_target: "src/concepts"
related_targets: []
---

# Surface brief: redesign concepts (whole app shell + public pages)

Scope: six frontend-only redesign concepts, switchable with `?concept=<id>`, compared on `/concepts.html`. Mode: Operate (app), with landing/sign-in inheriting each world. Copy, content, routes and behaviour are untouched. User asked for six equal directions and no favourite, so the decision page and pick card are replaced by building all six; seed key 614af4f8 (assigned grounded index 3; challengers 2, 4, 5, 6 fused; 1 and 3 declined: ascii render and tensegrity cannot carry an Operate task).

## Direction contract

### console (assigned, grounded #3: Braun/Rams appliance)
THESIS: the app as a well-made desk appliance; refuses the glowing dark dashboard.
OWN-WORLD: warm plastic grey #e9e7e2, panels #f5f4f1, graphite ink, one Braun orange key for the primary action, a green lamp for active/ok. Tactile keys with a pressed state, ruled groups instead of cards. Hanken Grotesk, tabular numerals.
STORY: the user reads state at a glance and presses exactly one obvious key.
FIRST VIEWPORT: control strip left with lamp on the active program; dashboard modules on a ruled grid; orange key top right.
FORM: grounded #3, seed 614af4f8. Raise from split-flap: every number sits in a fixed tabular cell.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

### concourse (challenger: split-flap concourse board)
THESIS: the schedule as a departure board read from across the hall; refuses cards.
OWN-WORLD: brushed-steel frame, matte black flap faces with a centre seam, white condensed caps (Barlow Condensed), amber row lamp for today/active/primary, dim red for destructive.
STORY: the user scans rows, finds the lit one, acts.
FIRST VIEWPORT: steel nav frame, board of ruled rows, big flap numerals on stats, amber lamp on today.
FORM: challenger 2, seed 614af4f8. Signature: numerals flap in on mount.

### coupon (challenger: jet-age ticket wallet)
THESIS: each record is a coupon in a wallet; refuses soft rounded cards.
OWN-WORLD: carrier navy drenched nav, crisp white coupon stock on blue-grey desk, red stamp for the primary action and checked state, carbon purple for filled figures. Archivo expanded caps on coupon heads, perforated dividers.
STORY: the user sees what remains in the wallet and stamps it done.
FIRST VIEWPORT: navy wallet spine left, current program as a white tab bleeding into the content, coupons with perforated heads.
FORM: challenger 6, seed 614af4f8.

### dawn (challenger: theatre cyclorama at dawn)
THESIS: a calm night-to-day stage that follows the real hour; refuses flat black.
OWN-WORLD: depthless cyc dark, a low cobalt horizon band, rose gathering above it, soft ink not pure white. Saira with Saira Stencil cue heads. Phase (night, first light, dawn, day) set from the clock.
STORY: the user plans in a space that is easy on the eyes and quietly tells the time.
FIRST VIEWPORT: content floating on dark bands above a horizon glow along the bottom edge.
FORM: challenger 4, seed 614af4f8. Signature: horizon phase shifts with the hour.

### manual (challenger: boxed-software manual, acetate over tab board)
THESIS: each program is a coloured section of one manual; refuses one-colour chrome.
OWN-WORLD: every program owns a full-strength hue board; content on milk acetate leaves; the nav is a stepped tab rail in those hues. Source Serif 4 for reading, Public Sans for controls. Motion is 90ms steps(2), never eased.
STORY: the user always knows which section they are in by colour alone.
FIRST VIEWPORT: tab rail left, current section's hue as the page board, acetate panels over it.
FORM: challenger 5, seed 614af4f8.

### sheet (grounded #2: OMR answer sheet)
THESIS: the proctor's own paper: an optically read answer sheet; refuses decoration.
OWN-WORLD: white paper, dropout-green ruled fields and labels, graphite for everything the user entered, timing marks down the nav edge, checkboxes as ovals that fill in pencil. Sofia Sans and Sofia Sans Condensed.
STORY: the user fills bubbles and the sheet reads itself.
FIRST VIEWPORT: timing-marked nav edge, boxed green field grid, filled graphite bubbles for done items.
FORM: grounded #2, seed 614af4f8.
