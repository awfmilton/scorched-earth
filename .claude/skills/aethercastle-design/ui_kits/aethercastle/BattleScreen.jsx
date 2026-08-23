const { HudStrip, TurnBanner, KillFeedToast, Button, IconButton, HpBar, Badge } = window.AethercastleDesignSystem_42f734;

/* Terrain silhouette, matching the engine's biome ramps (sky gradient + crust
   line + darker core). Heights are a fixed seed so the field reads the same. */
const HEIGHTS = [30, 34, 41, 52, 60, 57, 48, 44, 46, 55, 68, 74, 70, 58, 46, 40, 38, 43, 52, 63, 71, 66, 54, 45, 39, 36, 42, 50, 57, 52, 44, 37, 33, 35, 40, 48, 55, 50, 42, 36];

function Battlefield({ players, biome = 'plateau', shot }) {
  const poly = `polygon(0% 100%, ${HEIGHTS.map((h, i) => `${(i / (HEIGHTS.length - 1) * 100).toFixed(2)}% ${(100 - h).toFixed(2)}%`).join(', ')}, 100% 100%)`;
  const groundY = i => HEIGHTS[Math.round(i / 100 * (HEIGHTS.length - 1))];
  return (
    <div style={{
      position: 'relative', flex: 1, minHeight: 340, overflow: 'hidden',
      background: `linear-gradient(180deg, var(--biome-${biome}-sky) 0%, rgba(0,0,0,0) 100%), radial-gradient(120% 80% at 50% 100%, rgba(213,0,127,.10), transparent 60%), var(--void-900)`
    }}>
      {/* aether haze */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--scanline)', opacity: .5, pointerEvents: 'none' }} />
      {/* shot arc */}
      {shot && <div style={{
        position: 'absolute', left: '14%', bottom: '30%', width: '46%', height: '46%',
        borderTop: `2px dotted var(--magenta-500)`, borderRight: `2px dotted var(--magenta-500)`,
        borderTopRightRadius: '100%', opacity: .8, filter: 'drop-shadow(0 0 6px var(--magenta-600))'
      }} />}
      {/* terrain */}
      <div style={{ position: 'absolute', inset: 0, clipPath: poly, background: `linear-gradient(180deg, var(--biome-${biome}-crust) 0%, var(--biome-${biome}-core) 45%, var(--void-900) 100%)` }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: poly, background: 'var(--scanline)', opacity: .35 }} />
      {/* tanks */}
      {players.filter(p => !p.eliminated).map(p => (
        <div key={p.slot} style={{ position: 'absolute', left: `${p.x}%`, bottom: `${groundY(p.x)}%`, transform: 'translate(-50%,0)', textAlign: 'center' }}>
          <div style={{ font: 'var(--type-readout-sm)', color: p.color, textShadow: `0 0 8px ${p.color}`, marginBottom: 4, whiteSpace: 'nowrap' }}>{p.hp} ▪ {p.name}</div>
          <div style={{ position: 'relative', width: 34, height: 18, margin: '0 auto' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 9, background: p.color, boxShadow: `0 0 10px ${p.color}` }} />
            <div style={{ position: 'absolute', left: 11, bottom: 8, width: 12, height: 6, background: p.color, borderRadius: '6px 6px 0 0' }} />
            <div style={{ position: 'absolute', left: 17, bottom: 12, width: 16, height: 2, background: 'var(--brass-300)', transformOrigin: 'left center', transform: 'rotate(-42deg)' }} />
            {p.shield > 0 && <div style={{ position: 'absolute', left: -8, right: -8, bottom: -3, top: -12, border: '1px solid var(--cyan-500)', borderRadius: '50% 50% 0 0', boxShadow: 'var(--glow-cyan)', opacity: .8 }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function AimBay({ angle, power, setAngle, setPower, onFire }) {
  const dial = (label, value, set, min, max, step) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
      <span className="ac-label" style={{ color: 'var(--brass-400)', width: 52 }}>{label}</span>
      <IconButton label={`Decrease ${label}`} glyph={<span>−</span>} onClick={() => set(Math.max(min, value - step))} />
      <div style={{ position: 'relative', width: 190, height: 12, background: 'var(--surface-inset)', border: '1px solid var(--border-brass-dim)', boxShadow: 'var(--bevel-inset)' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${(value - min) / (max - min) * 100}%`, background: 'var(--aether-rail)', boxShadow: 'var(--glow-magenta)' }} />
      </div>
      <IconButton label={`Increase ${label}`} glyph={<span>+</span>} onClick={() => set(Math.min(max, value + step))} />
      <span className="ac-readout" style={{ color: 'var(--cyan-400)', width: 54, textAlign: 'right' }}>{value}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-9)', padding: 'var(--space-6) var(--gutter-panel)', background: 'var(--plate-dark)', borderTop: '2px solid var(--brass-600)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {dial('Angle', angle, setAngle, 0, 180, 1)}
        {dial('Power', power, setPower, 0, 1000, 25)}
      </div>
      <Button variant="primary" size="lg" onClick={onFire}>Fire</Button>
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginLeft: 'auto' }}>
        <Badge tone="cyan">Guidance orrery</Badge><Badge tone="brass">Fuel 84</Badge><Badge tone="stone">Parachute ×2</Badge>
      </div>
    </div>
  );
}

function BattleScreen({ onIntermission }) {
  const [angle, setAngle] = React.useState(45);
  const [power, setPower] = React.useState(500);
  const [wi, setWi] = React.useState(0);
  const [shot, setShot] = React.useState(false);
  const [feed, setFeed] = React.useState([{ id: 0, actor: 'Provost Kell', actorColor: 'var(--player-3)', verb: 'buried', target: 'Magister Vane', targetColor: 'var(--player-4)', weapon: 'Sandstorm', damage: 24 }]);
  const fire = () => {
    setShot(true);
    setTimeout(() => setShot(false), 1400);
    setFeed(f => [{ id: Date.now(), actor: 'Sir Aldric', actorColor: 'var(--player-1)', verb: 'struck', target: 'Dame Oriel', targetColor: 'var(--player-2)', weapon: LOADOUT[wi].name, damage: 18 + (wi * 22) }, ...f].slice(0, 4));
  };
  const me = PLAYERS[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <HudStrip player={{ ...me, angle, power }} weapons={LOADOUT} weaponIndex={wi} onCycle={setWi} wind={-18} netState="live" />
      <TurnBanner player={me.name} color={me.color} subtitle="Round 3 of 5 · shot 1" timer={24} />
      <div style={{ position: 'relative', display: 'flex', flex: 1 }}>
        <Battlefield players={PLAYERS} biome="plateau" shot={shot} />
        <div style={{ position: 'absolute', top: 'var(--space-6)', right: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', alignItems: 'flex-end' }}>
          {feed.map(f => <KillFeedToast key={f.id} {...f} />)}
        </div>
        <aside style={{ position: 'absolute', top: 'var(--space-6)', left: 'var(--space-6)', width: 210, padding: 'var(--space-5)', background: 'rgba(15,13,20,.86)', border: '1px solid var(--stone-600)', backdropFilter: 'var(--blur-glass)' }}>
          <div className="ac-label" style={{ color: 'var(--brass-400)', marginBottom: 'var(--space-4)' }}>Field roster</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {PLAYERS.map(p => (
              <div key={p.slot} style={{ opacity: p.eliminated ? .45 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-readout-sm)', color: p.color, marginBottom: 2 }}>
                  <span>{p.name}</span><span>${p.cash.toLocaleString()}</span>
                </div>
                <HpBar hp={p.hp} shield={p.shield} shieldMax={p.shieldMax} width={186} compact />
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" block style={{ marginTop: 'var(--space-6)' }} onClick={onIntermission}>End round</Button>
        </aside>
      </div>
      <AimBay angle={angle} power={power} setAngle={setAngle} setPower={setPower} onFire={fire} />
    </div>
  );
}

Object.assign(window, { BattleScreen, Battlefield });
