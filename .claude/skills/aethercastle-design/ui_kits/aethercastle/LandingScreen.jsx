const { Button, Input, Panel, SectionBanner, Badge, RoomListRow, IconTile } = window.AethercastleDesignSystem_42f734;

function Wordmark({ size = 'lg' }) {
  const big = size === 'lg';
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: big ? 64 : 30, color: 'var(--magenta-500)', textShadow: 'var(--glow-text-magenta)' }}>Æthercastle</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: big ? 26 : 15, color: 'var(--violet-500)', textShadow: 'var(--glow-text-magenta)', marginTop: big ? 6 : 2 }}>Armored Alchemists</div>
    </div>
  );
}

function LandingScreen({ onCreate, onJoin }) {
  const [code, setCode] = React.useState('');
  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 'var(--gutter-screen)' }}>
      <div style={{ width: 620, display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        <Wordmark />
        <SectionBanner accent="magenta">Take the field</SectionBanner>
        <Panel accent="brass" pad>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <Button variant="primary" size="lg" block onClick={() => onCreate('private')}>Create private siege</Button>
            <Button variant="secondary" size="lg" block onClick={() => onCreate('public')}>Open the gates — public siege</Button>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-5)' }}>
              <Input label="Join by code" code maxLength={4} placeholder="ABCD" value={code} onChange={e => setCode(e.target.value.toUpperCase())} style={{ flex: 1 }} />
              <Button variant="plate" onClick={() => onJoin(code || 'VLTK')}>Join</Button>
            </div>
            <Button variant="ghost" block onClick={() => onCreate('solo')}>Drill yard — solo vs AI</Button>
          </div>
        </Panel>
        <Panel kicker="Aethernet" title="Public sieges" accent="cyan" pad={false}
          actions={<Button size="sm" variant="ghost">Refresh</Button>}>
          {ROOMS.map(r => <RoomListRow key={r.host} {...r} onJoin={() => onJoin('VLTK')} />)}
        </Panel>
        <div style={{ display: 'flex', gap: 'var(--space-5)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Badge tone="brass">Guild ledger</Badge><Badge tone="cyan">Garage</Badge><Badge tone="violet">Replays</Badge><Badge tone="stone">Settings</Badge>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LandingScreen, Wordmark });
