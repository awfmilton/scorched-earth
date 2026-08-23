/* @ds-bundle: {"format":4,"namespace":"AethercastleDesignSystem_42f734","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"ShareCodeChip","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"SPRITES","sourcePath":"components/core/IconTile.jsx"},{"name":"SPRITE_KEYS","sourcePath":"components/core/IconTile.jsx"},{"name":"IconTile","sourcePath":"components/core/IconTile.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Select","sourcePath":"components/core/Input.jsx"},{"name":"Panel","sourcePath":"components/core/Panel.jsx"},{"name":"SectionBanner","sourcePath":"components/core/Panel.jsx"},{"name":"RadioGroup","sourcePath":"components/core/RadioGroup.jsx"},{"name":"Switch","sourcePath":"components/core/RadioGroup.jsx"},{"name":"HudReadout","sourcePath":"components/hud/HudReadout.jsx"},{"name":"HpBar","sourcePath":"components/hud/HudReadout.jsx"},{"name":"WindGauge","sourcePath":"components/hud/HudReadout.jsx"},{"name":"HudStrip","sourcePath":"components/hud/HudStrip.jsx"},{"name":"TurnBanner","sourcePath":"components/hud/TurnBanner.jsx"},{"name":"KillFeedToast","sourcePath":"components/hud/TurnBanner.jsx"},{"name":"WeaponSelector","sourcePath":"components/hud/WeaponSelector.jsx"},{"name":"LobbySlot","sourcePath":"components/match/LobbySlot.jsx"},{"name":"RoomListRow","sourcePath":"components/match/LobbySlot.jsx"},{"name":"StandingsRow","sourcePath":"components/match/LobbySlot.jsx"},{"name":"Modal","sourcePath":"components/match/Modal.jsx"},{"name":"WeaponCard","sourcePath":"components/match/WeaponCard.jsx"},{"name":"ShopRow","sourcePath":"components/match/WeaponCard.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"8b7bf60f760e","components/core/Button.jsx":"121b9939ec8d","components/core/IconButton.jsx":"aa0a362dba59","components/core/IconTile.jsx":"6be0a6af9eb9","components/core/Input.jsx":"00fc5d4dd5b5","components/core/Panel.jsx":"b57a0c639b9a","components/core/RadioGroup.jsx":"999f325c7d37","components/hud/HudReadout.jsx":"bd04f5045549","components/hud/HudStrip.jsx":"084dca17cd8f","components/hud/TurnBanner.jsx":"cfae674f9181","components/hud/WeaponSelector.jsx":"544382c4299c","components/match/LobbySlot.jsx":"2a1dacb346e5","components/match/Modal.jsx":"aff188808216","components/match/WeaponCard.jsx":"d0820ab90587","ui_kits/aethercastle/ArmoryScreen.jsx":"05889c79bef5","ui_kits/aethercastle/BattleScreen.jsx":"cce1408fc2a2","ui_kits/aethercastle/LandingScreen.jsx":"c56e53edaf42","ui_kits/aethercastle/LobbyScreen.jsx":"6596ef0fba40","ui_kits/aethercastle/data.jsx":"3e36917cecd6"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AethercastleDesignSystem_42f734 = window.AethercastleDesignSystem_42f734 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
const TONE = {
  brass: ['var(--brass-500)', 'var(--brass-200)'],
  magenta: ['var(--magenta-600)', 'var(--magenta-400)'],
  cyan: ['var(--cyan-600)', 'var(--cyan-400)'],
  violet: ['var(--violet-600)', 'var(--violet-500)'],
  acid: ['var(--acid-500)', 'var(--acid-400)'],
  blood: ['var(--blood-600)', 'var(--blood-500)'],
  stone: ['var(--stone-500)', 'var(--stone-300)']
};
const TIER_TONE = {
  1: 'brass',
  2: 'cyan',
  3: 'magenta',
  4: 'violet'
};
function Badge({
  tone = 'brass',
  tier,
  solid,
  pill,
  children,
  style
}) {
  const key = tier ? TIER_TONE[tier] : tone;
  const [edge, text] = TONE[key] || TONE.brass;
  return /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: '3px var(--space-4)',
      background: solid ? edge : 'rgba(8,7,10,.55)',
      color: solid ? 'var(--void-900)' : text,
      border: `var(--border-hair) solid ${edge}`,
      borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-plate)',
      whiteSpace: 'nowrap',
      ...style
    }
  }, tier ? `T${tier} ` : null, children);
}

/** The shareable 4-letter room code, presented as a gilded chip. */
function ShareCodeChip({
  code = 'ABCD',
  onCopy,
  label = 'Share code',
  style
}) {
  const [copied, setCopied] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-6)',
      padding: 'var(--space-4) var(--space-6)',
      background: 'var(--surface-inset)',
      border: 'var(--border-brass-double)',
      borderRadius: 'var(--radius-plate)',
      boxShadow: 'var(--bevel-inset)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)'
    }
  }, label), /*#__PURE__*/React.createElement("strong", {
    style: {
      font: 'var(--type-readout-lg)',
      letterSpacing: '.32em',
      color: 'var(--cyan-400)',
      textShadow: 'var(--glow-text-cyan)'
    }
  }, code), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setCopied(true);
      onCopy && onCopy(code);
    },
    className: "ac-label",
    style: {
      background: 'transparent',
      border: `var(--border-hair) solid var(--brass-700)`,
      color: copied ? 'var(--acid-400)' : 'var(--brass-300)',
      padding: '4px var(--space-4)',
      cursor: 'pointer',
      borderRadius: 'var(--radius-plate)',
      transition: 'var(--transition-control)'
    }
  }, copied ? 'Copied' : 'Copy'));
}
Object.assign(__ds_scope, { Badge, ShareCodeChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const KIND = {
  primary: {
    bg: 'linear-gradient(180deg,var(--magenta-500) 0%,var(--magenta-600) 55%,var(--magenta-700) 100%)',
    fg: 'var(--parchment-100)',
    edge: 'var(--magenta-500)',
    glow: 'var(--glow-magenta)'
  },
  secondary: {
    bg: 'linear-gradient(180deg,var(--cyan-500) 0%,var(--cyan-600) 55%,var(--cyan-700) 100%)',
    fg: 'var(--void-900)',
    edge: 'var(--cyan-400)',
    glow: 'var(--glow-cyan)'
  },
  gild: {
    bg: 'var(--brass-rail)',
    fg: 'var(--void-900)',
    edge: 'var(--brass-300)',
    glow: 'var(--glow-brass)'
  },
  plate: {
    bg: 'var(--plate)',
    fg: 'var(--text-on-plate)',
    edge: 'var(--brass-500)',
    glow: 'none'
  },
  ghost: {
    bg: 'transparent',
    fg: 'var(--brass-300)',
    edge: 'var(--brass-700)',
    glow: 'none'
  },
  danger: {
    bg: 'linear-gradient(180deg,var(--blood-500) 0%,var(--blood-600) 100%)',
    fg: 'var(--parchment-100)',
    edge: 'var(--blood-500)',
    glow: 'none'
  }
};
const SIZE = {
  sm: {
    h: 'var(--control-height-sm)',
    px: 'var(--space-5)',
    fs: 'var(--text-2xs)'
  },
  md: {
    h: 'var(--control-height)',
    px: 'var(--space-7)',
    fs: 'var(--text-xs)'
  },
  lg: {
    h: 'var(--control-height-lg)',
    px: 'var(--space-9)',
    fs: 'var(--text-sm)'
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  block,
  disabled,
  icon,
  children,
  style,
  ...rest
}) {
  const k = KIND[variant] || KIND.primary;
  const s = SIZE[size] || SIZE.md;
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setDown(false);
    },
    onMouseDown: () => setDown(true),
    onMouseUp: () => setDown(false),
    style: {
      display: block ? 'flex' : 'inline-flex',
      width: block ? '100%' : 'auto',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-4)',
      height: s.h,
      padding: `0 ${s.px}`,
      fontSize: s.fs,
      fontFamily: 'var(--font-heading)',
      fontWeight: 900,
      letterSpacing: 'var(--tracking-label)',
      textTransform: 'uppercase',
      background: k.bg,
      color: k.fg,
      border: `var(--border-plate) solid ${k.edge}`,
      borderRadius: 'var(--radius-plate)',
      boxShadow: down ? 'var(--bevel-inset)' : hover ? `var(--bevel-raised), ${k.glow}` : 'var(--bevel-raised)',
      transform: down ? 'var(--press-offset)' : 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      filter: hover && !disabled ? 'brightness(1.1)' : 'none',
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), icon, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IconButton({
  label,
  glyph,
  variant = 'plate',
  size = 32,
  active,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const tone = variant === 'primary' ? 'var(--magenta-500)' : variant === 'secondary' ? 'var(--cyan-500)' : 'var(--brass-400)';
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    title: label,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: size,
      height: size,
      display: 'grid',
      placeItems: 'center',
      background: active ? 'var(--void-800)' : 'var(--plate)',
      color: active || hover ? tone : 'var(--stone-300)',
      border: `var(--border-hair) solid ${active || hover ? tone : 'var(--border-brass-dim)'}`,
      borderRadius: 'var(--radius-plate)',
      cursor: 'pointer',
      padding: 0,
      boxShadow: active ? 'var(--bevel-inset)' : 'var(--bevel-raised)',
      transition: 'var(--transition-control)',
      ...style
    }
  }, rest), glyph);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/IconTile.jsx
try { (() => {
/* SPRITE MANIFEST.
   The brand's art is pixel-art. The three concept sheets in assets/concept/ are
   the reference, but they are single 7MB composites — not runtime sprites — so
   IconTile renders a framed PLACEHOLDER until real per-sprite PNGs are supplied.
   Pass `src` once art exists (e.g. src="assets/sprites/void-bomb.png").
   Keys below are the agreed sprite names, grouped as they appear on the sheets. */
const SPRITES = {
  vehicles: ['clockwork-tank', 'walker-mech', 'airship-platform', 'brass-plated-tank', 'aether-field-tank', 'scout-drone', 'drone-bay', 'submersible', 'hover-skiff', 'siege-platform'],
  ordnance: ['steam-mortar', 'lightning-lance', 'clockwork-harpoon', 'aether-strike-missile', 'sonic-disruptor', 'void-bomb', 'acid-rounds', 'void-balls', 'tesla-cores', 'phosphorus-shell', 'aether-nuke', 'dirt-clod'],
  weapons: ['acid-sprayer', 'phosphorus-cannon', 'tesla-coil-cannon', 'void-rift-projector', 'pike-ram', 'net-gun'],
  defenses: ['oil-vats', 'portcullis', 'scorpion-crossbow', 'shield-dome', 'aether-radar', 'repair-bay', 'missile-silo'],
  structures: ['norman-castle', 'keep-gatehouse', 'aether-forge'],
  meta: ['siege-loot', 'guild-expedition', 'fusion-bottle', 'aetherium-shard', 'clockwork-gears', 'powdered-sapphire']
};
const SPRITE_KEYS = Object.values(SPRITES).flat();
function abbrev(key = '') {
  const parts = String(key).split('-').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 3).map(p => p[0]).join('').toUpperCase();
}
function IconTile({
  sprite,
  src,
  size = 48,
  tier,
  framed = true,
  glow,
  label,
  fit = 'cover',
  style
}) {
  const edge = tier ? `var(--tier-${tier})` : 'var(--brass-600)';
  const glowShadow = glow === 'magenta' ? 'var(--glow-magenta)' : glow === 'cyan' ? 'var(--glow-cyan)' : glow === 'violet' ? 'var(--glow-violet)' : 'none';
  const w = fit === 'contain' ? Math.round(size * 1.45) : size;
  return /*#__PURE__*/React.createElement("span", {
    role: "img",
    "aria-label": label || sprite,
    title: label || sprite,
    "data-sprite": sprite,
    style: {
      position: 'relative',
      display: 'inline-grid',
      placeItems: 'center',
      width: w,
      height: size,
      flex: '0 0 auto',
      overflow: 'hidden',
      background: 'var(--void-800)',
      backgroundImage: src ? 'none' : 'var(--scanline)',
      border: framed ? `var(--border-hair) solid ${edge}` : 'none',
      borderRadius: 'var(--radius-icon)',
      boxShadow: glowShadow,
      ...style
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: fit === 'contain' ? 'contain' : 'cover',
      imageRendering: 'pixelated'
    }
  }) : /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    className: "ac-readout",
    style: {
      fontSize: Math.max(9, Math.round(size * 0.28)),
      color: tier ? edge : 'var(--brass-400)',
      letterSpacing: '.06em',
      opacity: .9
    }
  }, abbrev(sprite)));
}
Object.assign(__ds_scope, { SPRITES, SPRITE_KEYS, IconTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconTile.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const field = (focus, invalid, mono) => ({
  height: 'var(--control-height)',
  width: '100%',
  padding: '0 var(--space-5)',
  background: 'var(--surface-inset)',
  color: mono ? 'var(--text-numeric)' : 'var(--text-on-plate)',
  font: mono ? 'var(--type-readout)' : 'var(--type-body-sm)',
  border: `var(--border-hair) solid ${invalid ? 'var(--blood-500)' : focus ? 'var(--cyan-500)' : 'var(--border-brass-dim)'}`,
  borderRadius: 'var(--radius-plate)',
  boxShadow: focus ? 'var(--bevel-inset), var(--glow-cyan)' : 'var(--bevel-inset)',
  outline: 'none',
  transition: 'var(--transition-control)'
});
function Input({
  label,
  hint,
  invalid,
  mono,
  code,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      display: 'block',
      color: 'var(--brass-300)',
      marginBottom: 'var(--space-3)'
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...field(focus, invalid, mono || code),
      ...(code ? {
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '.5em',
        fontSize: 'var(--text-md)'
      } : null)
    }
  }, rest)), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      font: 'var(--type-body-sm)',
      color: invalid ? 'var(--blood-500)' : 'var(--text-on-plate-muted)',
      marginTop: 'var(--space-3)'
    }
  }, hint));
}
function Select({
  label,
  options = [],
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      display: 'block',
      color: 'var(--brass-300)',
      marginBottom: 'var(--space-3)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...field(focus, false, false),
      appearance: 'none',
      paddingRight: 'var(--space-9)',
      cursor: 'pointer'
    }
  }, rest), options.map(o => typeof o === 'string' ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      right: 'var(--space-5)',
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--brass-400)',
      font: 'var(--type-readout-sm)',
      pointerEvents: 'none'
    }
  }, "\u25BC")));
}
Object.assign(__ds_scope, { Input, Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Panel.jsx
try { (() => {
/** Riveted plate panel, or a parchment sheet when surface="parchment". */
function Panel({
  title,
  kicker,
  actions,
  surface = 'plate',
  accent = 'brass',
  pad = true,
  children,
  style
}) {
  const parchment = surface === 'parchment';
  const edge = accent === 'magenta' ? 'var(--magenta-600)' : accent === 'cyan' ? 'var(--cyan-500)' : accent === 'violet' ? 'var(--violet-600)' : 'var(--brass-500)';
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: parchment ? 'var(--parchment)' : 'var(--plate)',
      color: parchment ? 'var(--text-on-parchment)' : 'var(--text-on-plate)',
      border: `var(--border-plate) solid ${parchment ? 'var(--brass-600)' : edge}`,
      borderRadius: parchment ? 'var(--radius-sheet)' : 'var(--radius-plate)',
      boxShadow: parchment ? 'var(--shadow-sheet)' : 'var(--shadow-panel), var(--bevel-raised)',
      backgroundImage: parchment ? 'var(--parchment)' : `var(--scanline), var(--plate)`,
      overflow: 'hidden',
      ...style
    }
  }, (title || actions) && /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-6)',
      padding: 'var(--space-5) var(--gutter-panel)',
      background: parchment ? 'transparent' : 'var(--banner-fill)',
      borderBottom: `var(--border-hair) solid ${parchment ? 'var(--border-rule-ink)' : edge}`
    }
  }, /*#__PURE__*/React.createElement("div", null, kicker && /*#__PURE__*/React.createElement("div", {
    className: "ac-label",
    style: {
      color: parchment ? 'var(--text-on-parchment-muted)' : 'var(--brass-400)',
      marginBottom: 2
    }
  }, kicker), title && /*#__PURE__*/React.createElement("h2", {
    className: "ac-banner",
    style: {
      margin: 0,
      color: parchment ? 'var(--text-on-parchment)' : 'var(--parchment-100)'
    }
  }, title)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-4)',
      alignItems: 'center'
    }
  }, actions)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: pad ? parchment ? 'var(--gutter-parchment)' : 'var(--gutter-panel)' : 0
    }
  }, children));
}

/** Brass-framed section banner: the little gilded nameplate between blocks. */
function SectionBanner({
  children,
  accent = 'magenta',
  style
}) {
  const rail = accent === 'cyan' ? 'var(--cyan-500)' : accent === 'brass' ? 'var(--brass-500)' : 'var(--magenta-600)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-5)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      height: 2,
      flex: 1,
      background: `linear-gradient(90deg,transparent,${rail})`,
      boxShadow: accent === 'cyan' ? 'var(--glow-cyan)' : 'var(--glow-magenta)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "ac-banner",
    style: {
      padding: 'var(--space-3) var(--space-7)',
      background: 'var(--banner-fill)',
      border: `var(--border-hair) solid var(--brass-600)`,
      color: 'var(--parchment-100)',
      borderRadius: 'var(--radius-plate)',
      whiteSpace: 'nowrap'
    }
  }, children), /*#__PURE__*/React.createElement("span", {
    style: {
      height: 2,
      flex: 1,
      background: `linear-gradient(270deg,transparent,${rail})`,
      boxShadow: accent === 'cyan' ? 'var(--glow-cyan)' : 'var(--glow-magenta)'
    }
  }));
}
Object.assign(__ds_scope, { Panel, SectionBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Panel.jsx", error: String((e && e.message) || e) }); }

// components/core/RadioGroup.jsx
try { (() => {
function RadioGroup({
  label,
  name,
  options = [],
  value,
  onChange,
  inline = true,
  style
}) {
  return /*#__PURE__*/React.createElement("fieldset", {
    style: {
      border: 0,
      margin: 0,
      padding: 0,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("legend", {
    className: "ac-label",
    style: {
      color: 'var(--brass-300)',
      padding: 0,
      marginBottom: 'var(--space-4)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: inline ? 'row' : 'column',
      gap: 'var(--space-6)',
      flexWrap: 'wrap'
    }
  }, options.map(o => {
    const opt = typeof o === 'string' ? {
      value: o,
      label: o
    } : o;
    const on = value === opt.value;
    return /*#__PURE__*/React.createElement("label", {
      key: opt.value,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        cursor: 'pointer',
        font: 'var(--type-body-sm)',
        color: on ? 'var(--parchment-100)' : 'var(--stone-300)'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "radio",
      name: name,
      value: opt.value,
      checked: on,
      onChange: () => onChange && onChange(opt.value),
      style: {
        position: 'absolute',
        opacity: 0,
        width: 0,
        height: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        width: 16,
        height: 16,
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
        background: 'var(--surface-inset)',
        border: `var(--border-hair) solid ${on ? 'var(--cyan-500)' : 'var(--border-brass-dim)'}`,
        boxShadow: on ? 'var(--glow-cyan)' : 'var(--bevel-inset)',
        transition: 'var(--transition-control)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        background: on ? 'var(--cyan-500)' : 'transparent'
      }
    })), opt.label);
  })));
}
function Switch({
  label,
  checked,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-5)',
      cursor: 'pointer',
      font: 'var(--type-body-sm)',
      color: 'var(--text-on-plate)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    role: "switch",
    "aria-checked": !!checked,
    onClick: () => onChange && onChange(!checked),
    style: {
      width: 44,
      height: 22,
      flex: '0 0 auto',
      position: 'relative',
      background: 'var(--surface-inset)',
      border: `var(--border-hair) solid ${checked ? 'var(--magenta-500)' : 'var(--border-brass-dim)'}`,
      boxShadow: checked ? 'var(--glow-magenta)' : 'var(--bevel-inset)',
      transition: 'var(--transition-control)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      left: checked ? 23 : 2,
      width: 17,
      height: 16,
      background: checked ? 'var(--brass-rail)' : 'var(--plate)',
      borderLeft: '1px solid var(--brass-300)',
      borderRight: '1px solid var(--brass-700)',
      transition: `left var(--dur-fast) var(--ease-ratchet)`
    }
  })), label);
}
Object.assign(__ds_scope, { RadioGroup, Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/RadioGroup.jsx", error: String((e && e.message) || e) }); }

// components/hud/HudReadout.jsx
try { (() => {
/** One HUD cell: brass label + mono value. The atom the battle strip is built from. */
function HudReadout({
  label,
  value,
  unit,
  tone = 'cyan',
  size = 'md',
  emphasis,
  style
}) {
  const color = tone === 'magenta' ? 'var(--magenta-500)' : tone === 'brass' ? 'var(--brass-300)' : tone === 'acid' ? 'var(--acid-400)' : tone === 'blood' ? 'var(--blood-500)' : 'var(--cyan-400)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      minWidth: 62,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)',
      fontSize: 'var(--text-2xs)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color,
      fontSize: size === 'lg' ? 'var(--text-lg)' : size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)',
      textShadow: emphasis ? tone === 'magenta' ? 'var(--glow-text-magenta)' : 'var(--glow-text-cyan)' : 'none'
    }
  }, value, unit && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--stone-400)',
      fontSize: '.7em',
      marginLeft: 2
    }
  }, unit)));
}

/** Hull-integrity bar. Fill colour steps acid → fire → blood as HP falls; shield rides on top. */
function HpBar({
  hp = 100,
  max = 100,
  shield = 0,
  shieldMax = 0,
  width = 160,
  compact,
  label,
  style
}) {
  const pct = Math.max(0, Math.min(1, hp / max));
  const fill = pct > .6 ? 'var(--hp-full)' : pct > .3 ? 'var(--hp-mid)' : 'var(--hp-low)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      ...style
    }
  }, !compact && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)'
    }
  }, label || 'Hull'), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      fontSize: 'var(--text-2xs)',
      color: 'var(--text-on-plate-muted)'
    }
  }, hp, "/", max)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: compact ? 6 : 10,
      background: 'var(--surface-inset)',
      border: 'var(--border-hair) solid var(--border-brass-dim)',
      boxShadow: 'var(--bevel-inset)',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      width: `${pct * 100}%`,
      background: fill,
      transition: `width var(--dur-base) var(--ease-mech)`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--scanline)',
      opacity: .5
    }
  })), shieldMax > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      marginTop: 2,
      background: 'var(--surface-inset)',
      border: 'var(--border-hair) solid var(--cyan-700)',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      width: `${Math.max(0, Math.min(1, shield / shieldMax)) * 100}%`,
      background: 'var(--shield-charge)',
      boxShadow: 'var(--glow-cyan)'
    }
  })));
}

/** Wind gauge: brass dial with a cyan needle. Direction is the sign of `value`. */
function WindGauge({
  value = 0,
  maxValue = 60,
  width = 132,
  style
}) {
  const dir = value === 0 ? 0 : value > 0 ? 1 : -1;
  const mag = Math.min(1, Math.abs(value) / maxValue);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)'
    }
  }, "Wind"), /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height: 14,
      position: 'relative',
      background: 'var(--surface-inset)',
      border: 'var(--border-hair) solid var(--border-brass-dim)',
      boxShadow: 'var(--bevel-inset)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: '50%',
      top: 0,
      bottom: 0,
      width: 1,
      background: 'var(--brass-600)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      bottom: 2,
      background: 'var(--wind-marker)',
      boxShadow: 'var(--glow-cyan)',
      left: dir >= 0 ? '50%' : `${50 - mag * 50}%`,
      width: `${mag * 50}%`,
      transition: `all var(--dur-base) var(--ease-mech)`
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: 'var(--cyan-400)',
      fontSize: 'var(--text-sm)',
      minWidth: 46
    }
  }, dir === 0 ? '—' : dir > 0 ? '▶' : '◀', " ", Math.abs(value)));
}
Object.assign(__ds_scope, { HudReadout, HpBar, WindGauge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/hud/HudReadout.jsx", error: String((e && e.message) || e) }); }

// components/hud/TurnBanner.jsx
try { (() => {
/** Full-width turn handoff banner. Sweeps in on the player's colour. */
function TurnBanner({
  player = 'Player 1',
  color = 'var(--player-1)',
  subtitle,
  timer,
  phase = 'turn',
  style
}) {
  const label = phase === 'turn' ? 'Now firing' : phase === 'intermission' ? 'Intermission' : phase === 'round' ? 'Round begins' : 'Standings';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-7)',
      height: 'var(--banner-height)',
      padding: '0 var(--gutter-panel)',
      background: 'var(--banner-fill)',
      borderTop: `var(--border-hair) solid var(--brass-700)`,
      borderBottom: `var(--border-plate) solid ${color}`,
      boxShadow: `0 2px 0 rgba(8,7,10,.6), inset 0 0 24px -8px ${color}`,
      animation: `ac-turn-sweep var(--dur-slow) var(--ease-ratchet)`,
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      alignSelf: 'stretch',
      background: color,
      boxShadow: `0 0 12px ${color}`
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)'
    }
  }, label), /*#__PURE__*/React.createElement("strong", {
    className: "ac-banner",
    style: {
      color,
      textShadow: `0 0 10px ${color}`
    }
  }, player), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      color: 'var(--text-on-plate-muted)'
    }
  }, subtitle), timer !== undefined && /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      marginLeft: 'auto',
      color: timer <= 5 ? 'var(--blood-500)' : 'var(--cyan-400)',
      fontSize: 'var(--text-lg)'
    }
  }, "0:", String(timer).padStart(2, '0')));
}

/** Kill-feed / event toast. Stack top-right during a round. */
function KillFeedToast({
  actor,
  actorColor = 'var(--player-1)',
  verb = 'obliterated',
  target,
  targetColor = 'var(--player-2)',
  weapon,
  damage,
  tone = 'damage',
  style
}) {
  const edge = tone === 'heal' ? 'var(--heal)' : tone === 'info' ? 'var(--cyan-500)' : 'var(--damage)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)',
      padding: 'var(--space-4) var(--space-6)',
      background: 'rgba(15,13,20,.92)',
      borderLeft: `3px solid ${edge}`,
      border: 'var(--border-hair) solid var(--stone-600)',
      borderLeftWidth: 3,
      boxShadow: 'var(--shadow-toast)',
      font: 'var(--type-body-sm)',
      color: 'var(--text-on-plate)',
      animation: `ac-toast-in var(--dur-base) var(--ease-mech)`,
      backdropFilter: 'var(--blur-glass)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: actorColor
    }
  }, actor), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-on-plate-muted)'
    }
  }, verb), target && /*#__PURE__*/React.createElement("strong", {
    style: {
      color: targetColor
    }
  }, target), weapon && /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)'
    }
  }, weapon), damage !== undefined && /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: edge,
      fontSize: 'var(--text-sm)'
    }
  }, "\u2212", damage));
}
Object.assign(__ds_scope, { TurnBanner, KillFeedToast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/hud/TurnBanner.jsx", error: String((e && e.message) || e) }); }

// components/hud/WeaponSelector.jsx
try { (() => {
/** In-battle weapon carousel: current ordnance plus ammo, with cycle affordances. */
function WeaponSelector({
  weapons = [],
  index = 0,
  onCycle,
  style
}) {
  const w = weapons[index] || {};
  const cyc = d => onCycle && onCycle((index + d + weapons.length) % weapons.length);
  const arrow = (glyph, d) => /*#__PURE__*/React.createElement("button", {
    onClick: () => cyc(d),
    className: "ac-label",
    "aria-label": d > 0 ? 'Next weapon' : 'Previous weapon',
    style: {
      width: 24,
      alignSelf: 'stretch',
      background: 'var(--plate)',
      color: 'var(--brass-300)',
      border: 'var(--border-hair) solid var(--border-brass-dim)',
      cursor: 'pointer',
      fontSize: 'var(--text-sm)'
    }
  }, glyph);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      gap: 0,
      background: 'var(--surface-inset)',
      border: `var(--border-hair) solid var(--brass-600)`,
      boxShadow: 'var(--bevel-inset)',
      ...style
    }
  }, arrow('[', -1), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-5)',
      padding: 'var(--space-3) var(--space-6)',
      minWidth: 208
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconTile, {
    sprite: w.sprite,
    size: 32,
    tier: w.tier,
    glow: w.tier >= 3 ? 'magenta' : undefined
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)'
    }
  }, "Ordnance"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-section)',
      color: 'var(--parchment-100)',
      lineHeight: 1
    }
  }, w.name)), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      marginLeft: 'auto',
      padding: '2px var(--space-4)',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--void-800)',
      border: 'var(--border-hair) solid var(--brass-700)',
      color: w.ammo === Infinity ? 'var(--acid-400)' : 'var(--cyan-400)',
      fontSize: 'var(--text-sm)'
    }
  }, w.ammo === Infinity ? '∞' : `×${w.ammo}`)), arrow(']', 1));
}
Object.assign(__ds_scope, { WeaponSelector });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/hud/WeaponSelector.jsx", error: String((e && e.message) || e) }); }

// components/hud/HudStrip.jsx
try { (() => {
/** The battle strip: active commander, instruments, ordnance, net state, key legend. */
function HudStrip({
  player = {},
  weapons = [],
  weaponIndex = 0,
  onCycle,
  wind = 0,
  netState,
  legend = 'L/R Angle · U/D Power · Space Fire · [ ] Ordnance · Shift Coarse',
  style
}) {
  const color = player.color || 'var(--player-1)';
  const net = {
    live: 'var(--acid-500)',
    connecting: 'var(--fire-500)',
    reconnecting: 'var(--fire-500)',
    lost: 'var(--blood-500)'
  }[netState];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--gutter-hud)',
      minHeight: 'var(--hud-height)',
      padding: '0 var(--gutter-panel)',
      background: 'var(--plate-dark)',
      borderBottom: `var(--border-plate) solid var(--brass-600)`,
      boxShadow: 'var(--shadow-panel)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      minWidth: 168
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-banner",
    style: {
      color,
      fontSize: 'var(--text-sm)',
      textShadow: `0 0 8px ${color}`
    }
  }, player.name), /*#__PURE__*/React.createElement(__ds_scope.HpBar, {
    hp: player.hp,
    max: 100,
    shield: player.shield,
    shieldMax: player.shieldMax,
    width: 168,
    compact: true
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      alignSelf: 'stretch',
      background: 'var(--stone-600)'
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.HudReadout, {
    label: "Angle",
    value: player.angle,
    unit: "\xB0",
    emphasis: true
  }), /*#__PURE__*/React.createElement(__ds_scope.HudReadout, {
    label: "Power",
    value: player.power,
    emphasis: true
  }), /*#__PURE__*/React.createElement(__ds_scope.HudReadout, {
    label: "Cash",
    value: `$${(player.cash || 0).toLocaleString()}`,
    tone: "brass"
  }), /*#__PURE__*/React.createElement(__ds_scope.WindGauge, {
    value: wind
  }), /*#__PURE__*/React.createElement(__ds_scope.WeaponSelector, {
    weapons: weapons,
    index: weaponIndex,
    onCycle: onCycle,
    style: {
      marginLeft: 'auto'
    }
  }), netState && /*#__PURE__*/React.createElement(__ds_scope.HudReadout, {
    label: "Net",
    value: netState.toUpperCase(),
    size: "sm",
    tone: netState === 'live' ? 'acid' : netState === 'lost' ? 'blood' : 'brass',
    style: {
      minWidth: 88,
      color: net
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--stone-400)',
      maxWidth: 260,
      lineHeight: 1.4,
      letterSpacing: '.08em'
    }
  }, legend));
}
Object.assign(__ds_scope, { HudStrip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/hud/HudStrip.jsx", error: String((e && e.message) || e) }); }

// components/match/LobbySlot.jsx
try { (() => {
/** One of four lobby slots: filled, empty, or an AI seat. */
function LobbySlot({
  index = 1,
  name,
  color = 'var(--player-1)',
  chassis,
  chassisSprite,
  kind = 'empty',
  host,
  ready,
  you,
  onInvite,
  style
}) {
  const empty = kind === 'empty';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-6)',
      minHeight: 'var(--slot-height)',
      padding: 'var(--space-5) var(--gutter-panel)',
      background: empty ? 'var(--surface-inset)' : 'var(--plate)',
      border: `var(--border-hair) ${empty ? 'dashed' : 'solid'} ${empty ? 'var(--stone-500)' : color}`,
      borderLeft: `4px solid ${empty ? 'var(--stone-600)' : color}`,
      borderRadius: 'var(--radius-plate)',
      boxShadow: empty ? 'var(--bevel-inset)' : `var(--bevel-raised), inset 0 0 26px -12px ${color}`,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: empty ? 'var(--stone-500)' : color,
      fontSize: 'var(--text-lg)',
      width: 24
    }
  }, index), empty ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-sm)',
      fontStyle: 'italic',
      color: 'var(--stone-400)'
    }
  }, "Seat open \u2014 awaiting a commander"), onInvite && /*#__PURE__*/React.createElement("button", {
    onClick: onInvite,
    className: "ac-label",
    style: {
      marginLeft: 'auto',
      background: 'transparent',
      border: 'var(--border-hair) solid var(--brass-700)',
      color: 'var(--brass-300)',
      padding: '5px var(--space-5)',
      cursor: 'pointer'
    }
  }, "Add AI")) : /*#__PURE__*/React.createElement(React.Fragment, null, chassisSprite && /*#__PURE__*/React.createElement(__ds_scope.IconTile, {
    sprite: chassisSprite,
    size: 40,
    fit: "contain"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    className: "ac-banner",
    style: {
      color,
      fontSize: 'var(--text-sm)'
    }
  }, name), you && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "cyan"
  }, "You"), host && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "brass"
  }, "Host"), kind === 'ai' && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "violet"
  }, "AI")), /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--stone-300)'
    }
  }, chassis)), /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: ready ? 'acid' : 'stone',
    solid: ready
  }, ready ? 'Ready' : 'Standing by')));
}

/** Public room browser row. */
function RoomListRow({
  host,
  players = 1,
  maxPlayers = 4,
  biome,
  rounds,
  onJoin,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const full = players >= maxPlayers;
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-6)',
      minHeight: 'var(--row-height)',
      padding: '0 var(--space-6)',
      background: hover ? 'rgba(0,191,255,.06)' : 'transparent',
      borderBottom: 'var(--border-dashed-etch)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      font: 'var(--type-body-sm)',
      fontWeight: 600,
      color: 'var(--parchment-100)'
    }
  }, host, "\u2019s keep"), /*#__PURE__*/React.createElement("div", {
    className: "ac-label",
    style: {
      color: 'var(--stone-400)',
      marginTop: 1
    }
  }, biome, " \xB7 ", rounds, " rounds")), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: full ? 'var(--blood-500)' : 'var(--cyan-400)',
      fontSize: 'var(--text-sm)'
    }
  }, players, "/", maxPlayers), /*#__PURE__*/React.createElement("button", {
    onClick: onJoin,
    disabled: full,
    className: "ac-label",
    style: {
      background: full ? 'transparent' : 'linear-gradient(180deg,var(--cyan-500),var(--cyan-700))',
      color: full ? 'var(--stone-400)' : 'var(--void-900)',
      border: `var(--border-hair) solid ${full ? 'var(--stone-500)' : 'var(--cyan-400)'}`,
      padding: '6px var(--space-6)',
      cursor: full ? 'not-allowed' : 'pointer',
      borderRadius: 'var(--radius-plate)'
    }
  }, full ? 'Full' : 'Join'));
}

/** Round-end / leaderboard row. Rank 1–3 gets a gilded rank plate. */
function StandingsRow({
  rank = 1,
  name,
  color = 'var(--player-1)',
  hp,
  kills = 0,
  cash = 0,
  damage,
  eliminated,
  variant = 'standings',
  style
}) {
  const gild = rank <= 3;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-6)',
      minHeight: 'var(--row-height)',
      padding: '0 var(--space-6)',
      background: rank % 2 ? 'rgba(8,7,10,.25)' : 'transparent',
      borderLeft: `3px solid ${eliminated ? 'var(--stone-600)' : color}`,
      borderBottom: 'var(--border-etch-line)',
      opacity: eliminated ? .6 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      width: 30,
      height: 24,
      display: 'grid',
      placeItems: 'center',
      fontSize: 'var(--text-sm)',
      background: gild ? 'var(--brass-rail)' : 'var(--void-800)',
      color: gild ? 'var(--void-900)' : 'var(--stone-300)',
      border: `var(--border-hair) solid ${gild ? 'var(--brass-300)' : 'var(--stone-600)'}`
    }
  }, rank), /*#__PURE__*/React.createElement("strong", {
    className: "ac-banner",
    style: {
      color,
      fontSize: 'var(--text-sm)',
      flex: 1,
      minWidth: 0
    }
  }, name), variant === 'standings' && hp !== undefined && /*#__PURE__*/React.createElement(__ds_scope.HpBar, {
    hp: hp,
    width: 92,
    compact: true
  }), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: 'var(--magenta-500)',
      fontSize: 'var(--text-sm)',
      minWidth: 44
    }
  }, kills, " K"), damage !== undefined && /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: 'var(--cyan-400)',
      fontSize: 'var(--text-sm)',
      minWidth: 62
    }
  }, damage, " dmg"), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: 'var(--cash)',
      fontSize: 'var(--text-sm)',
      minWidth: 78,
      textAlign: 'right'
    }
  }, "$", cash.toLocaleString()));
}
Object.assign(__ds_scope, { LobbySlot, RoomListRow, StandingsRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/match/LobbySlot.jsx", error: String((e && e.message) || e) }); }

// components/match/Modal.jsx
try { (() => {
/** Scrimmed modal over the battlefield: shop, settings, standings, forfeit confirm. */
function Modal({
  open = true,
  title,
  kicker,
  surface = 'plate',
  width = 'var(--width-sheet)',
  onClose,
  footer,
  children,
  style
}) {
  if (!open) return null;
  const parchment = surface === 'parchment';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 'var(--z-modal)',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--surface-scrim)',
      backdropFilter: 'var(--blur-glass)',
      padding: 'var(--gutter-screen)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    style: {
      width,
      maxWidth: '100%',
      maxHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: parchment ? 'var(--parchment)' : 'var(--plate)',
      color: parchment ? 'var(--text-on-parchment)' : 'var(--text-on-plate)',
      border: 'var(--border-brass-double)',
      borderRadius: parchment ? 'var(--radius-sheet)' : 'var(--radius-plate)',
      boxShadow: 'var(--shadow-modal)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-6)',
      padding: 'var(--space-6) var(--gutter-parchment)',
      background: parchment ? 'transparent' : 'var(--banner-fill)',
      borderBottom: `var(--border-plate) solid ${parchment ? 'var(--border-rule-ink)' : 'var(--brass-600)'}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, kicker && /*#__PURE__*/React.createElement("div", {
    className: "ac-label",
    style: {
      color: parchment ? 'var(--text-on-parchment-muted)' : 'var(--brass-400)'
    }
  }, kicker), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: 'var(--type-title)',
      fontSize: 'var(--text-xl)',
      color: parchment ? 'var(--text-on-parchment)' : 'var(--parchment-100)'
    }
  }, title)), onClose && /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      width: 30,
      height: 30,
      background: 'transparent',
      color: parchment ? 'var(--text-on-parchment-muted)' : 'var(--brass-300)',
      border: `var(--border-hair) solid ${parchment ? 'var(--border-rule-ink)' : 'var(--brass-700)'}`,
      cursor: 'pointer',
      font: 'var(--type-readout)'
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: parchment ? 'var(--gutter-parchment)' : 'var(--gutter-panel)',
      overflow: 'auto',
      flex: 1
    }
  }, children), footer && /*#__PURE__*/React.createElement("footer", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 'var(--space-5)',
      padding: 'var(--space-6) var(--gutter-parchment)',
      borderTop: `var(--border-plate) solid ${parchment ? 'var(--border-rule-ink)' : 'var(--brass-600)'}`
    }
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/match/Modal.jsx", error: String((e && e.message) || e) }); }

// components/match/WeaponCard.jsx
try { (() => {
/** Armory catalogue card: sprite, tier, ballistic stats, price, buy action. */
function WeaponCard({
  name,
  sprite,
  tier = 1,
  family,
  cost = 0,
  packSize = 1,
  owned = 0,
  blast,
  damage,
  description,
  affordable = true,
  onBuy,
  selected,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const edge = `var(--tier-${tier})`;
  return /*#__PURE__*/React.createElement("article", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)',
      padding: 'var(--gutter-panel)',
      background: 'var(--plate)',
      backgroundImage: 'var(--scanline), var(--plate)',
      border: `var(--border-plate) solid ${selected || hover ? edge : 'var(--stone-600)'}`,
      borderRadius: 'var(--radius-plate)',
      width: 268,
      boxShadow: selected || hover ? `var(--bevel-raised), 0 0 14px -2px ${edge}` : 'var(--bevel-raised), var(--shadow-panel)',
      transition: 'var(--transition-control)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      gap: 'var(--space-5)',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconTile, {
    sprite: sprite,
    size: 52,
    tier: tier,
    glow: tier >= 3 ? tier === 4 ? 'violet' : 'magenta' : undefined
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      font: 'var(--type-section)',
      color: 'var(--parchment-100)',
      lineHeight: 1.15,
      minHeight: '2.3em'
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      marginTop: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tier: tier
  }, family), (owned === Infinity || owned > 0) && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "stone"
  }, "Held \xD7", owned === Infinity ? '∞' : owned)))), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body-sm)',
      color: 'var(--text-on-plate-muted)',
      textWrap: 'pretty'
    }
  }, description), /*#__PURE__*/React.createElement("dl", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 'var(--space-4)',
      margin: 0,
      paddingTop: 'var(--space-4)',
      borderTop: 'var(--border-etch-line)'
    }
  }, [['Blast', blast], ['Damage', damage], ['Pack', `×${packSize}`]].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k
  }, /*#__PURE__*/React.createElement("dt", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)'
    }
  }, k), /*#__PURE__*/React.createElement("dd", {
    className: "ac-readout",
    style: {
      margin: 0,
      color: 'var(--cyan-400)',
      fontSize: 'var(--text-sm)'
    }
  }, v === undefined || v === null ? '—' : v)))), /*#__PURE__*/React.createElement("footer", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: affordable ? 'var(--cash)' : 'var(--blood-500)',
      fontSize: 'var(--text-md)'
    }
  }, "$", cost.toLocaleString()), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    variant: affordable ? 'gild' : 'plate',
    disabled: !affordable,
    onClick: onBuy,
    style: affordable ? null : {
      opacity: .75
    }
  }, affordable ? 'Forge' : 'Short')));
}

/** Dense catalogue row — the armory's list mode, sits flush inside a parchment sheet. */
function ShopRow({
  name,
  sprite,
  tier = 1,
  cost = 0,
  packSize = 1,
  owned = 0,
  affordable = true,
  onBuy,
  style
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'grid',
      gridTemplateColumns: '2.2fr .8fr .7fr .7fr auto',
      alignItems: 'center',
      gap: 'var(--space-6)',
      minHeight: 'var(--row-height)',
      padding: '0 var(--space-6)',
      background: hover ? 'rgba(43,33,21,.10)' : 'transparent',
      borderBottom: 'var(--border-ink-rule)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-5)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconTile, {
    sprite: sprite,
    size: 28,
    tier: tier
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      fontWeight: 600,
      color: 'var(--text-on-parchment)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, name)), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: affordable ? '#5C4A12' : 'var(--blood-600)',
      fontSize: 'var(--text-sm)'
    }
  }, "$", cost.toLocaleString()), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: 'var(--text-on-parchment-muted)',
      fontSize: 'var(--text-sm)'
    }
  }, "\xD7", packSize), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: 'var(--text-on-parchment)',
      fontSize: 'var(--text-sm)'
    }
  }, owned === Infinity ? '∞' : owned), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    variant: affordable ? 'gild' : 'plate',
    disabled: !affordable,
    onClick: onBuy,
    style: affordable ? null : {
      background: 'transparent',
      color: 'var(--text-on-parchment-muted)',
      borderColor: 'var(--border-rule-ink)',
      boxShadow: 'none',
      opacity: 1
    }
  }, "Buy"));
}
Object.assign(__ds_scope, { WeaponCard, ShopRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/match/WeaponCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aethercastle/ArmoryScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Modal,
  Button,
  WeaponCard,
  ShopRow,
  SectionBanner,
  Badge,
  HudReadout,
  StandingsRow,
  Panel
} = window.AethercastleDesignSystem_42f734;
function ArmoryScreen({
  onDone
}) {
  const [cash, setCash] = React.useState(10000);
  const [owned, setOwned] = React.useState(() => Object.fromEntries([...ARSENAL, ...DEFENSES].map(w => [w.name, w.owned])));
  const buy = w => {
    if (cash >= w.cost) {
      setCash(c => c - w.cost);
      setOwned(o => ({
        ...o,
        [w.name]: o[w.name] === Infinity ? Infinity : (o[w.name] || 0) + w.packSize
      }));
    }
  };
  const featured = ARSENAL.slice(6);
  return /*#__PURE__*/React.createElement(Modal, {
    kicker: "Intermission \xB7 Round 3 of 5",
    title: "Aether Forge",
    surface: "parchment",
    width: "min(1040px, 100%)",
    onClose: onDone,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "ac-readout",
      style: {
        marginRight: 'auto',
        color: '#5C4A12'
      }
    }, "Purse $", cash.toLocaleString()), /*#__PURE__*/React.createElement(Button, {
      variant: "gild",
      onClick: onDone
    }, "Sell salvage"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: onDone
    }, "Return to the field"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-7)',
      marginBottom: 'var(--space-7)'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-body)',
      maxWidth: '52ch',
      textWrap: 'pretty'
    }
  }, "Forge, loot or barter between rounds. Every point of damage you dealt bought you a coin; every kill, five hundred."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-8)'
    }
  }, /*#__PURE__*/React.createElement(HudReadout, {
    label: "Purse",
    value: `$${cash.toLocaleString()}`,
    tone: "brass",
    size: "lg"
  }), /*#__PURE__*/React.createElement(HudReadout, {
    label: "Damage dealt",
    value: "412",
    tone: "magenta",
    size: "lg"
  }), /*#__PURE__*/React.createElement(HudReadout, {
    label: "Kills",
    value: "3",
    tone: "magenta",
    size: "lg"
  }))), /*#__PURE__*/React.createElement(SectionBanner, {
    accent: "magenta"
  }, "Cataclysmic tier"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-6)',
      overflowX: 'auto',
      padding: 'var(--space-7) 0'
    }
  }, featured.map(w => /*#__PURE__*/React.createElement(WeaponCard, _extends({
    key: w.name
  }, w, {
    owned: owned[w.name],
    affordable: cash >= w.cost,
    onBuy: () => buy(w)
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-8)',
      marginTop: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ac-banner",
    style: {
      color: 'var(--text-on-parchment)',
      marginBottom: 'var(--space-4)'
    }
  }, "Ordnance"), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: 'var(--border-ink-rule)'
    }
  }, ARSENAL.slice(0, 6).map(w => /*#__PURE__*/React.createElement(ShopRow, _extends({
    key: w.name
  }, w, {
    owned: owned[w.name],
    affordable: cash >= w.cost,
    onBuy: () => buy(w)
  }))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ac-banner",
    style: {
      color: 'var(--text-on-parchment)',
      marginBottom: 'var(--space-4)'
    }
  }, "Defenses & utility"), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: 'var(--border-ink-rule)'
    }
  }, DEFENSES.map(w => /*#__PURE__*/React.createElement(ShopRow, _extends({
    key: w.name
  }, w, {
    owned: owned[w.name],
    affordable: cash >= w.cost,
    onBuy: () => buy(w)
  })))))));
}
function StandingsScreen({
  onAgain,
  onLobby
}) {
  const sorted = [...PLAYERS].sort((a, b) => b.kills - a.kills || b.cash - a.cash);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--gutter-screen)',
      display: 'grid',
      placeItems: 'center',
      minHeight: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 720,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-7)'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: "sm"
  }), /*#__PURE__*/React.createElement(SectionBanner, {
    accent: "brass"
  }, "Final reckoning"), /*#__PURE__*/React.createElement(Panel, {
    accent: "brass",
    pad: false,
    kicker: "5 rounds \xB7 Plateau \xB7 seed VLTK",
    title: "Standings"
  }, sorted.map((p, i) => /*#__PURE__*/React.createElement(StandingsRow, {
    key: p.slot,
    rank: i + 1,
    name: p.name,
    color: p.color,
    hp: p.hp,
    kills: p.kills,
    damage: p.damage,
    cash: p.cash,
    eliminated: p.eliminated
  }))), /*#__PURE__*/React.createElement(Panel, {
    surface: "parchment",
    title: "Guild ledger"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 'var(--space-7)'
    }
  }, [['Accuracy', '61%'], ['Favoured', 'Void Bomb'], ['Longest shot', '842 u'], ['Placement', '1st']].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k
  }, /*#__PURE__*/React.createElement("div", {
    className: "ac-label",
    style: {
      color: 'var(--text-on-parchment-muted)'
    }
  }, k), /*#__PURE__*/React.createElement("div", {
    className: "ac-readout",
    style: {
      color: 'var(--text-on-parchment)',
      fontSize: 'var(--text-lg)'
    }
  }, v))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-5)',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: onAgain
  }, "Rematch"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    onClick: onLobby
  }, "Back to lobby"))));
}
Object.assign(window, {
  ArmoryScreen,
  StandingsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aethercastle/ArmoryScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aethercastle/BattleScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  HudStrip,
  TurnBanner,
  KillFeedToast,
  Button,
  IconButton,
  HpBar,
  Badge
} = window.AethercastleDesignSystem_42f734;

/* Terrain silhouette, matching the engine's biome ramps (sky gradient + crust
   line + darker core). Heights are a fixed seed so the field reads the same. */
const HEIGHTS = [30, 34, 41, 52, 60, 57, 48, 44, 46, 55, 68, 74, 70, 58, 46, 40, 38, 43, 52, 63, 71, 66, 54, 45, 39, 36, 42, 50, 57, 52, 44, 37, 33, 35, 40, 48, 55, 50, 42, 36];
function Battlefield({
  players,
  biome = 'plateau',
  shot
}) {
  const poly = `polygon(0% 100%, ${HEIGHTS.map((h, i) => `${(i / (HEIGHTS.length - 1) * 100).toFixed(2)}% ${(100 - h).toFixed(2)}%`).join(', ')}, 100% 100%)`;
  const groundY = i => HEIGHTS[Math.round(i / 100 * (HEIGHTS.length - 1))];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      minHeight: 340,
      overflow: 'hidden',
      background: `linear-gradient(180deg, var(--biome-${biome}-sky) 0%, rgba(0,0,0,0) 100%), radial-gradient(120% 80% at 50% 100%, rgba(213,0,127,.10), transparent 60%), var(--void-900)`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--scanline)',
      opacity: .5,
      pointerEvents: 'none'
    }
  }), shot && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: '14%',
      bottom: '30%',
      width: '46%',
      height: '46%',
      borderTop: `2px dotted var(--magenta-500)`,
      borderRight: `2px dotted var(--magenta-500)`,
      borderTopRightRadius: '100%',
      opacity: .8,
      filter: 'drop-shadow(0 0 6px var(--magenta-600))'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      clipPath: poly,
      background: `linear-gradient(180deg, var(--biome-${biome}-crust) 0%, var(--biome-${biome}-core) 45%, var(--void-900) 100%)`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      clipPath: poly,
      background: 'var(--scanline)',
      opacity: .35
    }
  }), players.filter(p => !p.eliminated).map(p => /*#__PURE__*/React.createElement("div", {
    key: p.slot,
    style: {
      position: 'absolute',
      left: `${p.x}%`,
      bottom: `${groundY(p.x)}%`,
      transform: 'translate(-50%,0)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-readout-sm)',
      color: p.color,
      textShadow: `0 0 8px ${p.color}`,
      marginBottom: 4,
      whiteSpace: 'nowrap'
    }
  }, p.hp, " \u25AA ", p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 34,
      height: 18,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 9,
      background: p.color,
      boxShadow: `0 0 10px ${p.color}`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 11,
      bottom: 8,
      width: 12,
      height: 6,
      background: p.color,
      borderRadius: '6px 6px 0 0'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 17,
      bottom: 12,
      width: 16,
      height: 2,
      background: 'var(--brass-300)',
      transformOrigin: 'left center',
      transform: 'rotate(-42deg)'
    }
  }), p.shield > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: -8,
      right: -8,
      bottom: -3,
      top: -12,
      border: '1px solid var(--cyan-500)',
      borderRadius: '50% 50% 0 0',
      boxShadow: 'var(--glow-cyan)',
      opacity: .8
    }
  })))));
}
function AimBay({
  angle,
  power,
  setAngle,
  setPower,
  onFire
}) {
  const dial = (label, value, set, min, max, step) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)',
      width: 52
    }
  }, label), /*#__PURE__*/React.createElement(IconButton, {
    label: `Decrease ${label}`,
    glyph: /*#__PURE__*/React.createElement("span", null, "\u2212"),
    onClick: () => set(Math.max(min, value - step))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 190,
      height: 12,
      background: 'var(--surface-inset)',
      border: '1px solid var(--border-brass-dim)',
      boxShadow: 'var(--bevel-inset)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      width: `${(value - min) / (max - min) * 100}%`,
      background: 'var(--aether-rail)',
      boxShadow: 'var(--glow-magenta)'
    }
  })), /*#__PURE__*/React.createElement(IconButton, {
    label: `Increase ${label}`,
    glyph: /*#__PURE__*/React.createElement("span", null, "+"),
    onClick: () => set(Math.min(max, value + step))
  }), /*#__PURE__*/React.createElement("span", {
    className: "ac-readout",
    style: {
      color: 'var(--cyan-400)',
      width: 54,
      textAlign: 'right'
    }
  }, value));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-9)',
      padding: 'var(--space-6) var(--gutter-panel)',
      background: 'var(--plate-dark)',
      borderTop: '2px solid var(--brass-600)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }
  }, dial('Angle', angle, setAngle, 0, 180, 1), dial('Power', power, setPower, 0, 1000, 25)), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: onFire
  }, "Fire"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-4)',
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "cyan"
  }, "Guidance orrery"), /*#__PURE__*/React.createElement(Badge, {
    tone: "brass"
  }, "Fuel 84"), /*#__PURE__*/React.createElement(Badge, {
    tone: "stone"
  }, "Parachute \xD72")));
}
function BattleScreen({
  onIntermission
}) {
  const [angle, setAngle] = React.useState(45);
  const [power, setPower] = React.useState(500);
  const [wi, setWi] = React.useState(0);
  const [shot, setShot] = React.useState(false);
  const [feed, setFeed] = React.useState([{
    id: 0,
    actor: 'Provost Kell',
    actorColor: 'var(--player-3)',
    verb: 'buried',
    target: 'Magister Vane',
    targetColor: 'var(--player-4)',
    weapon: 'Sandstorm',
    damage: 24
  }]);
  const fire = () => {
    setShot(true);
    setTimeout(() => setShot(false), 1400);
    setFeed(f => [{
      id: Date.now(),
      actor: 'Sir Aldric',
      actorColor: 'var(--player-1)',
      verb: 'struck',
      target: 'Dame Oriel',
      targetColor: 'var(--player-2)',
      weapon: LOADOUT[wi].name,
      damage: 18 + wi * 22
    }, ...f].slice(0, 4));
  };
  const me = PLAYERS[0];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100%'
    }
  }, /*#__PURE__*/React.createElement(HudStrip, {
    player: {
      ...me,
      angle,
      power
    },
    weapons: LOADOUT,
    weaponIndex: wi,
    onCycle: setWi,
    wind: -18,
    netState: "live"
  }), /*#__PURE__*/React.createElement(TurnBanner, {
    player: me.name,
    color: me.color,
    subtitle: "Round 3 of 5 \xB7 shot 1",
    timer: 24
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Battlefield, {
    players: PLAYERS,
    biome: "plateau",
    shot: shot
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'var(--space-6)',
      right: 'var(--space-6)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      alignItems: 'flex-end'
    }
  }, feed.map(f => /*#__PURE__*/React.createElement(KillFeedToast, _extends({
    key: f.id
  }, f)))), /*#__PURE__*/React.createElement("aside", {
    style: {
      position: 'absolute',
      top: 'var(--space-6)',
      left: 'var(--space-6)',
      width: 210,
      padding: 'var(--space-5)',
      background: 'rgba(15,13,20,.86)',
      border: '1px solid var(--stone-600)',
      backdropFilter: 'var(--blur-glass)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ac-label",
    style: {
      color: 'var(--brass-400)',
      marginBottom: 'var(--space-4)'
    }
  }, "Field roster"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, PLAYERS.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.slot,
    style: {
      opacity: p.eliminated ? .45 : 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      font: 'var(--type-readout-sm)',
      color: p.color,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", null, p.name), /*#__PURE__*/React.createElement("span", null, "$", p.cash.toLocaleString())), /*#__PURE__*/React.createElement(HpBar, {
    hp: p.hp,
    shield: p.shield,
    shieldMax: p.shieldMax,
    width: 186,
    compact: true
  })))), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    block: true,
    style: {
      marginTop: 'var(--space-6)'
    },
    onClick: onIntermission
  }, "End round"))), /*#__PURE__*/React.createElement(AimBay, {
    angle: angle,
    power: power,
    setAngle: setAngle,
    setPower: setPower,
    onFire: fire
  }));
}
Object.assign(window, {
  BattleScreen,
  Battlefield
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aethercastle/BattleScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aethercastle/LandingScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  Input,
  Panel,
  SectionBanner,
  Badge,
  RoomListRow,
  IconTile
} = window.AethercastleDesignSystem_42f734;
function Wordmark({
  size = 'lg'
}) {
  const big = size === 'lg';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      lineHeight: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: big ? 64 : 30,
      color: 'var(--magenta-500)',
      textShadow: 'var(--glow-text-magenta)'
    }
  }, "\xC6thercastle"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: big ? 26 : 15,
      color: 'var(--violet-500)',
      textShadow: 'var(--glow-text-magenta)',
      marginTop: big ? 6 : 2
    }
  }, "Armored Alchemists"));
}
function LandingScreen({
  onCreate,
  onJoin
}) {
  const [code, setCode] = React.useState('');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      display: 'grid',
      placeItems: 'center',
      padding: 'var(--gutter-screen)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 620,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-8)'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, null), /*#__PURE__*/React.createElement(SectionBanner, {
    accent: "magenta"
  }, "Take the field"), /*#__PURE__*/React.createElement(Panel, {
    accent: "brass",
    pad: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    block: true,
    onClick: () => onCreate('private')
  }, "Create private siege"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    block: true,
    onClick: () => onCreate('public')
  }, "Open the gates \u2014 public siege"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Join by code",
    code: true,
    maxLength: 4,
    placeholder: "ABCD",
    value: code,
    onChange: e => setCode(e.target.value.toUpperCase()),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "plate",
    onClick: () => onJoin(code || 'VLTK')
  }, "Join")), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    block: true,
    onClick: () => onCreate('solo')
  }, "Drill yard \u2014 solo vs AI"))), /*#__PURE__*/React.createElement(Panel, {
    kicker: "Aethernet",
    title: "Public sieges",
    accent: "cyan",
    pad: false,
    actions: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "ghost"
    }, "Refresh")
  }, ROOMS.map(r => /*#__PURE__*/React.createElement(RoomListRow, _extends({
    key: r.host
  }, r, {
    onJoin: () => onJoin('VLTK')
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-5)',
      justifyContent: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "brass"
  }, "Guild ledger"), /*#__PURE__*/React.createElement(Badge, {
    tone: "cyan"
  }, "Garage"), /*#__PURE__*/React.createElement(Badge, {
    tone: "violet"
  }, "Replays"), /*#__PURE__*/React.createElement(Badge, {
    tone: "stone"
  }, "Settings"))));
}
Object.assign(window, {
  LandingScreen,
  Wordmark
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aethercastle/LandingScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aethercastle/LobbyScreen.jsx
try { (() => {
const {
  Button,
  Panel,
  SectionBanner,
  Input,
  Select,
  RadioGroup,
  Switch,
  LobbySlot,
  ShareCodeChip
} = window.AethercastleDesignSystem_42f734;
function LobbyScreen({
  onStart,
  onBack
}) {
  const [weapons, setWeapons] = React.useState('all');
  const [ff, setFf] = React.useState(false);
  const [seats, setSeats] = React.useState(PLAYERS.slice(0, 3));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--gutter-screen)',
      display: 'grid',
      gridTemplateColumns: '1.15fr .85fr',
      gap: 'var(--space-9)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-7)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement(Wordmark, {
    size: "sm"
  }), /*#__PURE__*/React.createElement(ShareCodeChip, {
    code: "VLTK"
  })), /*#__PURE__*/React.createElement(SectionBanner, {
    accent: "cyan"
  }, "Muster roll"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }
  }, [1, 2, 3, 4].map(i => {
    const p = seats.find(s => s.slot === i);
    return p ? /*#__PURE__*/React.createElement(LobbySlot, {
      key: i,
      index: i,
      name: p.name,
      color: p.color,
      kind: p.kind,
      chassis: p.chassis,
      chassisSprite: p.sprite,
      host: p.host,
      you: p.you,
      ready: p.ready
    }) : /*#__PURE__*/React.createElement(LobbySlot, {
      key: i,
      index: i,
      kind: "empty",
      onInvite: () => setSeats(PLAYERS)
    });
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: onStart
  }, "Begin the siege"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    onClick: onBack
  }, "Abandon lobby"))), /*#__PURE__*/React.createElement(Panel, {
    kicker: "Host only",
    title: "Rules of engagement",
    accent: "brass"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Rounds",
    mono: true,
    defaultValue: "5"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Starting cash",
    mono: true,
    defaultValue: "10000"
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Wall",
    options: [{
      value: 'off',
      label: 'Off (open field)'
    }, {
      value: 'rubber',
      label: 'Rubber (bouncing)'
    }, {
      value: 'wrap',
      label: 'Wrap (screen wrap)'
    }, {
      value: 'concrete',
      label: 'Concrete (solid)'
    }]
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Biome",
    options: ['Mountains', 'Plains', 'Hills', 'Plateau']
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Wind",
    options: ['Still', 'Steady', 'Gusting', 'Jetstream']
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Turn timer",
    mono: true,
    defaultValue: "30"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-6)',
      marginTop: 'var(--space-7)',
      paddingTop: 'var(--space-6)',
      borderTop: 'var(--border-etch-line)'
    }
  }, /*#__PURE__*/React.createElement(RadioGroup, {
    label: "Arsenal",
    name: "weapons",
    value: weapons,
    onChange: setWeapons,
    options: [{
      value: 'all',
      label: 'Full arsenal'
    }, {
      value: 'basic',
      label: 'Brass tier only'
    }]
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "Friendly fire",
    checked: ff,
    onChange: setFf
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "Sudden death (rising lava)",
    checked: false,
    onChange: () => {}
  }))));
}
Object.assign(window, {
  LobbyScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aethercastle/LobbyScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aethercastle/data.jsx
try { (() => {
const DS = window.AethercastleDesignSystem_42f734;
const PLAYERS = [{
  slot: 1,
  name: 'Sir Aldric',
  color: 'var(--player-1)',
  kind: 'human',
  chassis: 'Clockwork Tank · Brass-plated',
  sprite: 'clockwork-tank',
  hp: 74,
  shield: 60,
  shieldMax: 100,
  cash: 10000,
  kills: 3,
  damage: 412,
  x: 12,
  ready: true,
  host: true,
  you: true
}, {
  slot: 2,
  name: 'Dame Oriel',
  color: 'var(--player-2)',
  kind: 'human',
  chassis: 'Walker Mech · Aether-field',
  sprite: 'walker-mech',
  hp: 38,
  shield: 0,
  shieldMax: 0,
  cash: 8100,
  kills: 2,
  damage: 288,
  x: 38,
  ready: true
}, {
  slot: 3,
  name: 'Provost Kell',
  color: 'var(--player-3)',
  kind: 'ai',
  chassis: 'Half-track Artillery · Poolshark',
  sprite: 'brass-plated-tank',
  hp: 92,
  shield: 0,
  shieldMax: 0,
  cash: 6400,
  kills: 1,
  damage: 96,
  x: 64,
  ready: true
}, {
  slot: 4,
  name: 'Magister Vane',
  color: 'var(--player-4)',
  kind: 'ai',
  chassis: 'Airship Platform · Cyborg',
  sprite: 'airship-platform',
  hp: 0,
  shield: 0,
  shieldMax: 0,
  cash: 3600,
  kills: 1,
  damage: 140,
  x: 88,
  ready: true,
  eliminated: true
}];
const ARSENAL = [{
  name: 'Steam Mortar',
  sprite: 'steam-mortar',
  tier: 1,
  family: 'Direct',
  cost: 0,
  packSize: 1,
  blast: 30,
  damage: 60,
  owned: Infinity,
  description: 'Boiler-fed shell, free forever. Still ends careless commanders.'
}, {
  name: 'Alchemical Shell',
  sprite: 'phosphorus-cannon',
  tier: 1,
  family: 'Direct',
  cost: 500,
  packSize: 5,
  blast: 40,
  damage: 80,
  owned: 4,
  description: 'Standard guild munition. Reliable, unglamorous, always in stock.'
}, {
  name: 'Clockwork Harpoon',
  sprite: 'clockwork-harpoon',
  tier: 2,
  family: 'Rolling',
  cost: 1000,
  packSize: 5,
  blast: 20,
  damage: 40,
  owned: 2,
  description: 'Bites the slope and runs downhill until it finds a hull.'
}, {
  name: 'Acid Rounds',
  sprite: 'acid-rounds',
  tier: 2,
  family: 'Corrosive',
  cost: 1500,
  packSize: 4,
  blast: 15,
  damage: 5,
  owned: 0,
  description: 'Eats plate over three turns. Cheap punishment for entrenchment.'
}, {
  name: 'Tesla Coil Cannon',
  sprite: 'tesla-coil-cannon',
  tier: 2,
  family: 'Beam',
  cost: 2500,
  packSize: 3,
  blast: 30,
  damage: 60,
  owned: 1,
  description: 'No arc, no wind — but a hill will drink the whole discharge.'
}, {
  name: 'Sandstorm',
  sprite: 'siege-loot',
  tier: 2,
  family: 'Terraform',
  cost: 2000,
  packSize: 3,
  blast: 0,
  damage: 0,
  owned: 0,
  description: 'Buries a valley. Damage nil; humiliation total.'
}, {
  name: 'Aether Cluster',
  sprite: 'sonic-disruptor',
  tier: 3,
  family: 'Sub-munition',
  cost: 3000,
  packSize: 2,
  blast: 25,
  damage: 50,
  owned: 0,
  description: 'Splits into five at apex. Spread widens with power.'
}, {
  name: 'Aether-Strike Missile',
  sprite: 'aether-strike-missile',
  tier: 3,
  family: 'Direct',
  cost: 5000,
  packSize: 1,
  blast: 100,
  damage: 200,
  owned: 0,
  description: 'Guild-sanctioned overkill. One shot, one crater, one grudge.'
}, {
  name: 'Void Bomb',
  sprite: 'void-bomb',
  tier: 4,
  family: 'Exotic',
  cost: 6000,
  packSize: 1,
  blast: 35,
  damage: 70,
  owned: 0,
  description: 'Collapses a pocket of aether; terrain falls inward instead of out.'
}, {
  name: 'Aether-Nuke',
  sprite: 'aether-nuke',
  tier: 4,
  family: 'Cataclysmic',
  cost: 10000,
  packSize: 1,
  blast: 150,
  damage: 300,
  owned: 0,
  description: 'Critical fission element, brass casing, no second chances.'
}];
const DEFENSES = [{
  name: 'Aether Shield',
  sprite: 'shield-dome',
  tier: 1,
  cost: 1000,
  packSize: 1,
  owned: 1
}, {
  name: 'Hardened Shield',
  sprite: 'shield-dome',
  tier: 2,
  cost: 2500,
  packSize: 1,
  owned: 0
}, {
  name: 'Aether-Field Generator',
  sprite: 'aether-field-tank',
  tier: 3,
  cost: 4000,
  packSize: 1,
  owned: 0
}, {
  name: 'Fusion Battery',
  sprite: 'fusion-bottle',
  tier: 1,
  cost: 500,
  packSize: 2,
  owned: 3
}, {
  name: 'Parachute Silk',
  sprite: 'guild-expedition',
  tier: 1,
  cost: 500,
  packSize: 3,
  owned: 2
}, {
  name: 'Guidance Orrery',
  sprite: 'aether-radar',
  tier: 2,
  cost: 2000,
  packSize: 1,
  owned: 0
}, {
  name: 'Auto Defense',
  sprite: 'repair-bay',
  tier: 2,
  cost: 3000,
  packSize: 1,
  owned: 0
}];
const LOADOUT = [{
  name: 'Steam Mortar',
  sprite: 'steam-mortar',
  ammo: Infinity,
  tier: 1
}, {
  name: 'Clockwork Harpoon',
  sprite: 'clockwork-harpoon',
  ammo: 2,
  tier: 2
}, {
  name: 'Tesla Coil Cannon',
  sprite: 'tesla-coil-cannon',
  ammo: 1,
  tier: 2
}, {
  name: 'Void Bomb',
  sprite: 'void-bomb',
  ammo: 1,
  tier: 4
}];
const ROOMS = [{
  host: 'Dame Oriel',
  players: 2,
  maxPlayers: 4,
  biome: 'Plateau',
  rounds: 5
}, {
  host: 'Provost Kell',
  players: 4,
  maxPlayers: 4,
  biome: 'Mountains',
  rounds: 3
}, {
  host: 'Brother Anselm',
  players: 1,
  maxPlayers: 4,
  biome: 'Plains',
  rounds: 10
}];
Object.assign(window, {
  DS,
  PLAYERS,
  ARSENAL,
  DEFENSES,
  LOADOUT,
  ROOMS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aethercastle/data.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.ShareCodeChip = __ds_scope.ShareCodeChip;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.SPRITES = __ds_scope.SPRITES;

__ds_ns.SPRITE_KEYS = __ds_scope.SPRITE_KEYS;

__ds_ns.IconTile = __ds_scope.IconTile;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.SectionBanner = __ds_scope.SectionBanner;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.HudReadout = __ds_scope.HudReadout;

__ds_ns.HpBar = __ds_scope.HpBar;

__ds_ns.WindGauge = __ds_scope.WindGauge;

__ds_ns.HudStrip = __ds_scope.HudStrip;

__ds_ns.TurnBanner = __ds_scope.TurnBanner;

__ds_ns.KillFeedToast = __ds_scope.KillFeedToast;

__ds_ns.WeaponSelector = __ds_scope.WeaponSelector;

__ds_ns.LobbySlot = __ds_scope.LobbySlot;

__ds_ns.RoomListRow = __ds_scope.RoomListRow;

__ds_ns.StandingsRow = __ds_scope.StandingsRow;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.WeaponCard = __ds_scope.WeaponCard;

__ds_ns.ShopRow = __ds_scope.ShopRow;

})();
