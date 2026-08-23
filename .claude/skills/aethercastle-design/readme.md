# Æthercastle — Aethercastle: Armored Alchemists design system

A retro-futuristic **steampunk × Anglo-Norman medieval** design system for *Æthercastle: Armored Alchemists* — a turn-based artillery game (a re-skin and expansion of the *Scorched Earth* lineage) where clockwork tanks, walker mechs and airship platforms lob aether-charged ordnance across destructible terrain at each other's keeps.

The fiction: guild alchemists have wired neon aether into brass siege engines. Every surface in the product is therefore either **riveted metal**, **castle stone**, or **parchment** — lit only by magenta/violet/cyan aether glow.

## Sources this system was built from

| Source | What it gave us |
| --- | --- |
| `https://github.com/awfmilton/scorched-earth` (branch `main`) | The ground-truth product: engine constants, the full weapon/item catalogue with costs, pack sizes, blast radii and damage, the four seeded biomes and their terrain ramps, the HUD field order, the setup/lobby/shop/summary screens, multiplayer share codes and room browser, economy rules. Reference copy of the single-file app is kept at `reference/scorched-earth-index.html`. |
| 3 pixel-art concept sheets (user-supplied, `assets/concept/`) | The visual identity: the five brand colours (verbatim hex), the uncial neon wordmark, gilded banner plates, aether rails, parchment sheets, and the expanded fiction (drones, Aether-Nuke, fortress defenses, crafting). |
| Design brief (chat) | The forward-looking surface list: chassis families, weather/physics modifiers, match structures, progression, accessibility, and the component inventory this system styles. |

**Explore those repositories further** — `awfmilton/scorched-earth` in particular — before designing new screens: the engine file is the only complete record of field order, stat ranges and turn flow, and reading it will make anything you build here far more faithful than working from these guidelines alone.

The original *Scorched Earth* look (DOS green-on-black `Courier`, `#00ff00` everything) is deliberately **not** reproduced. Æthercastle keeps the engine's information architecture and replaces its entire visual language.

## Index

| Path | What's there |
| --- | --- |
| `styles.css` | Global entry point — `@import` list only. Consumers link this. |
| `tokens/` | `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `motion.css`, `base.css` |
| `components/core/` | `Button`, `IconButton`, `Input`, `Select`, `RadioGroup`, `Switch`, `Panel`, `SectionBanner`, `Badge`, `ShareCodeChip`, `IconTile` |
| `components/hud/` | `HudStrip`, `HudReadout`, `HpBar`, `WindGauge`, `WeaponSelector`, `TurnBanner`, `KillFeedToast` |
| `components/match/` | `WeaponCard`, `ShopRow`, `LobbySlot`, `RoomListRow`, `StandingsRow`, `Modal` |
| `ui_kits/aethercastle/` | Click-through recreation: landing → lobby → battle → forge → standings |
| `guidelines/*.card.html` | Foundation specimen cards (colour, type, spacing, brand, motion) |
| `assets/concept/` | The three pixel-art concept sheets (reference art) |
| `reference/` | Copy of the source engine's `index.html` |
| `SKILL.md` | Agent-skill entry point |

## Content fundamentals

**Voice: a guild quartermaster with a dry sense of humour.** Second person for instructions to the player ("Choose your chassis"), never first person; the game never says "I". Copy is terse, physical and a little medieval, but it never becomes fake-archaic ("thee", "prithee" — banned).

- **Titles and banners: upper case.** `FORTRESS DEFENSES`, `EXPANDED ARSENAL`, `MECHANICS`. Sentence case is used for body prose and helper text.
- **Nouns are compound and hyphenated**: Aether-Strike Missile, Aether-Forge Crafting, Brass-Plated Reinforcement, Multi-Terrain Tracks, Long-Range Aether-Radar. Prefix `Aether-` marks anything alchemically powered; `Clockwork` marks anything mechanical; `Void` marks tier-4 exotica.
- **Item descriptions are one sentence, effect first, flavour second.** "Collapses a pocket of aether; terrain falls inward instead of out." Not "This powerful weapon will…".
- **Numbers are always concrete**: `$10,000`, `45°`, `blast 30`, `×5`, `HP 74`. Never "lots of damage".
- **Verbs in the kill feed are past tense and understated**: *struck, buried, obliterated, shielded, salvaged, repaired.*
- **Roles instead of usernames** where possible: Sir Aldric, Dame Oriel, Provost Kell, Magister Vane, Brother Anselm. AI profiles keep the engine's names (Moron, Shooter, Poolshark, Cyborg) — they're canon and funny.
- **British-leaning spelling** in prose (*armoured*, *colour*), but the product name keeps its supplied form "Armored Alchemists".
- **No emoji.** The source engine uses a single 👑 for the lobby host; this system replaces it with a brass `Host` badge. Unicode is used only for functional glyphs the mono face carries well: `▶ ◀` (wind direction), `∞` (unlimited ammo), `▼` (select chevron), `✕` (close), `[ ]` (weapon cycle), `−` `+` (aim dials).
- **Never exclaim.** No "!" in UI copy. The tone is competent, not excited.

## Visual foundations

**Colour.** Five anchors, taken verbatim from the concept sheets: Stone Gray `#4A413C`, Electric Magenta `#D5007F`, Deep Violet `#4B0082`, Cyan/Blue Neon `#00BFFF`, Brass `#B5A642`. Around them: a void/ink ramp for the world behind everything, a stone ramp for panels, a parchment ramp for reading surfaces, brass for all trim. Magenta is the primary action and the damage semantic; cyan is telemetry, shields, guidance and focus; violet is void/exotic tier; brass is currency, trim and tier 1. Acid green and phosphorus orange appear only as reactive-alchemy accents (corrosive, fire, heal). At most two background colours on a screen: the void field and one surface.

**Type.** Four voices, no more. `Uncial Antiqua` for the wordmark and screen titles (never below 28px, never body). `Cinzel` (700/900, upper case, `.14em`–`.18em` tracking) for banners, section plates, buttons and labels — the Norman-inscription voice. `Spectral` for anything read at length, capped at 62ch, italic for lore asides. `Share Tech Mono` with `tabular-nums` for **every number the player reads** — angle, power, cash, HP, share codes, timers. HUD text floor is 12px; slide/marketing text never below 24px.

**Space and layout.** 4px base scale (2·4·6·8·12·16·20·24·32·40·48·64). Game chrome is dense: 12px HUD gutters, 16px panel padding, 24px parchment padding, 32px screen inset. Fixed elements: the HUD strip (56px) is pinned above the field; the turn banner (44px) sits directly under it; the aim bay is pinned to the bottom; toasts stack top-right (max 4); the roster panel floats top-left over the field. Rows and lobby slots never go below 44px — that's the touch floor.

**Backgrounds.** No photography, no illustration wallpaper, no purple-blue hero gradients. The world background is near-black `--void-900` with a biome sky gradient behind the terrain and a faint magenta ground-glow. Surfaces carry a 3px `--scanline` texture at low opacity — the only texture in the system. Terrain is a flat clipped silhouette with a lighter crust band and a dark core, per biome.

**Borders, radii, cards.** Metal is square: `--radius-plate` 2px is the largest radius on any control. Parchment sheets get 4px, chips get a pill. Hairline `1px` etch lines divide inside a panel; `2px` brass frames a panel; `3px double` brass frames a modal (inherited from the source engine's setup dialog); `1px dashed` marks an empty lobby seat. "Cards" in this system are riveted plates — never a rounded card with a coloured left border, and never a drop-shadowed white card.

**Shadow and glow.** Two systems, kept apart. *Bevels* describe metal: `--bevel-raised` (brass-lit top edge, void-shadowed bottom) for anything raised, `--bevel-inset` for anything recessed — inputs, wells, pressed buttons, progress tracks. *Glows* describe aether and are the only light source: `--glow-magenta`, `--glow-cyan`, `--glow-violet`. Nothing neutral glows; brass gets at most a faint `--glow-brass`. Drop shadows are hard and dark (`0 2px 0` + a wide soft pass), never soft grey.

**Transparency and blur.** Reserved for things floating over live gameplay: the modal scrim (`--surface-scrim` + 6px blur), the roster panel, kill-feed toasts. Never on a static page surface.

**Interaction states.** Hover: `brightness(1.1)` plus the variant's glow — never a colour change. Press: `translateY(1px)` and swap to `--bevel-inset` — never a scale. Focus: 2px cyan outline with 2px offset (`:focus-visible`), plus a cyan glow on fields. Disabled: 40% opacity, no glow, cursor `not-allowed`; unaffordable stock stays visible with a blood-red price and a `ghost` action.

**Motion.** Mechanical, never playful — nothing bounces or overshoots. `--ease-mech` for standard UI, `--ease-ratchet` for turn handoff and toggles (gear engagement), `--ease-fall` for terrain collapse and drops. Durations 90/140/220/380/620ms. Named animations: `ac-turn-sweep` (banner), `ac-toast-in` (kill feed), `ac-aether-pulse` (charge), `ac-gear-spin` (loading, stepped 6-frame), `ac-charge` (shield fill). `prefers-reduced-motion` collapses everything to 1ms.

**Imagery vibe.** Pixel art, warm brass and stone base, cool neon accents, high contrast, no grain, no photographic imagery anywhere.

## Iconography

**There is no icon set in the sources, and none has been invented here.** The engine draws its entire visual output on a `<canvas>` (tanks are literally a filled rect, an arc and a stroked barrel line) and ships no SVGs, sprite sheets, icon fonts or PNGs. The user-supplied concept sheets contain beautiful pixel-art icons, but they arrived as three ~7MB composite images — not per-sprite assets — and they cannot be decoded or served as runtime sprites in this environment.

So:

- **`IconTile` is a documented placeholder.** It renders a tier-framed tile carrying the sprite key's initials, and accepts `src` for real art the moment per-sprite PNGs exist. `SPRITE_KEYS` in `components/core/IconTile.jsx` is the agreed naming manifest (37 names across vehicles, ordnance, weapons, defenses, structures, meta) — deliver art against those names and every kit screen fills in automatically.
- **Nothing is hand-drawn as a substitute.** No SVG re-creations of the concept art, no emoji stand-ins.
- **Functional UI glyphs use the mono face**: `▶ ◀ ∞ ▼ ✕ [ ] − +`. If you need a broader functional icon set (settings, volume, close, chevrons), link **Lucide** from CDN (`https://unpkg.com/lucide@latest`) — *this is a substitution*, flagged here: Lucide's 2px-stroke geometry is neutral enough not to fight the brand, but it is not brand iconography.
- **The concept sheets stay in `assets/concept/`** as designer reference (open them directly; they are too heavy for page use) and are exposed as `--sheet-core-loop`, `--sheet-cataclysm`, `--sheet-arsenal` for print/large-format work only.
- **There is no logo file.** The wordmark is set in type (`Uncial Antiqua`, magenta with a magenta text-glow) wherever a mark would go — see `Wordmark` in `ui_kits/aethercastle/LandingScreen.jsx`.

## Fonts — substitution notice

No font binaries were supplied. All four families are Google Fonts matched by eye to the concept-sheet lettering and loaded from the Google CDN in `tokens/fonts.css`:

| Role | Substitute | Matching |
| --- | --- | --- |
| Display / wordmark | **Uncial Antiqua** | the neon uncial title lettering (incl. the Æ ligature) |
| Banners, labels, buttons | **Cinzel** | the Norman inscriptional caps on the gilded banner plates |
| Body / lore | **Spectral** | parchment body text |
| Numerics | **Share Tech Mono** | HUD readouts (the engine used `Courier New`) |

**If real brand fonts exist, send the files** and these four declarations are the only thing that needs to change.

## Intentional additions

- **`IconTile`** — an art wrapper the sources don't define, needed so ordnance and vehicles have one sanctioned image slot (and one honest placeholder) instead of ad-hoc `<img>` tags.
- **`Switch`** — the source engine only has radios and number inputs, but the brief's room rules (friendly fire, sudden death, reduced motion) are booleans; the switch is styled as a brass ratchet to stay in-world.
- **`SectionBanner`** — lifted directly from the concept sheets' gilded nameplates with aether rails; it isn't in the engine, but it's the strongest recurring motif in the brand art.
