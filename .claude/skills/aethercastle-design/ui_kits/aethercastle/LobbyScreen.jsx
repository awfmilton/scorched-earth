const { Button, Panel, SectionBanner, Input, Select, RadioGroup, Switch, LobbySlot, ShareCodeChip } = window.AethercastleDesignSystem_42f734;

function LobbyScreen({ onStart, onBack }) {
  const [weapons, setWeapons] = React.useState('all');
  const [ff, setFf] = React.useState(false);
  const [seats, setSeats] = React.useState(PLAYERS.slice(0, 3));
  return (
    <div style={{ padding: 'var(--gutter-screen)', display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 'var(--space-9)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-6)' }}>
          <Wordmark size="sm" />
          <ShareCodeChip code="VLTK" />
        </div>
        <SectionBanner accent="cyan">Muster roll</SectionBanner>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {[1, 2, 3, 4].map(i => {
            const p = seats.find(s => s.slot === i);
            return p
              ? <LobbySlot key={i} index={i} name={p.name} color={p.color} kind={p.kind} chassis={p.chassis} chassisSprite={p.sprite} host={p.host} you={p.you} ready={p.ready} />
              : <LobbySlot key={i} index={i} kind="empty" onInvite={() => setSeats(PLAYERS)} />;
          })}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-5)' }}>
          <Button variant="primary" size="lg" onClick={onStart}>Begin the siege</Button>
          <Button variant="ghost" size="lg" onClick={onBack}>Abandon lobby</Button>
        </div>
      </div>
      <Panel kicker="Host only" title="Rules of engagement" accent="brass">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
          <Input label="Rounds" mono defaultValue="5" />
          <Input label="Starting cash" mono defaultValue="10000" />
          <Select label="Wall" options={[{ value: 'off', label: 'Off (open field)' }, { value: 'rubber', label: 'Rubber (bouncing)' }, { value: 'wrap', label: 'Wrap (screen wrap)' }, { value: 'concrete', label: 'Concrete (solid)' }]} />
          <Select label="Biome" options={['Mountains', 'Plains', 'Hills', 'Plateau']} />
          <Select label="Wind" options={['Still', 'Steady', 'Gusting', 'Jetstream']} />
          <Input label="Turn timer" mono defaultValue="30" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', marginTop: 'var(--space-7)', paddingTop: 'var(--space-6)', borderTop: 'var(--border-etch-line)' }}>
          <RadioGroup label="Arsenal" name="weapons" value={weapons} onChange={setWeapons}
            options={[{ value: 'all', label: 'Full arsenal' }, { value: 'basic', label: 'Brass tier only' }]} />
          <Switch label="Friendly fire" checked={ff} onChange={setFf} />
          <Switch label="Sudden death (rising lava)" checked={false} onChange={() => {}} />
        </div>
      </Panel>
    </div>
  );
}

Object.assign(window, { LobbyScreen });
