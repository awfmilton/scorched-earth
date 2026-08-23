const { Modal, Button, WeaponCard, ShopRow, SectionBanner, Badge, HudReadout, StandingsRow, Panel } = window.AethercastleDesignSystem_42f734;

function ArmoryScreen({ onDone }) {
  const [cash, setCash] = React.useState(10000);
  const [owned, setOwned] = React.useState(() => Object.fromEntries([...ARSENAL, ...DEFENSES].map(w => [w.name, w.owned])));
  const buy = w => { if (cash >= w.cost) { setCash(c => c - w.cost); setOwned(o => ({ ...o, [w.name]: (o[w.name] === Infinity ? Infinity : (o[w.name] || 0) + w.packSize) })); } };
  const featured = ARSENAL.slice(6);
  return (
    <Modal kicker="Intermission · Round 3 of 5" title="Aether Forge" surface="parchment" width="min(1040px, 100%)"
      onClose={onDone}
      footer={<><span className="ac-readout" style={{ marginRight: 'auto', color: '#5C4A12' }}>Purse ${cash.toLocaleString()}</span><Button variant="gild" onClick={onDone}>Sell salvage</Button><Button variant="primary" onClick={onDone}>Return to the field</Button></>}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-7)', marginBottom: 'var(--space-7)' }}>
        <p style={{ margin: 0, font: 'var(--type-body)', maxWidth: '52ch', textWrap: 'pretty' }}>
          Forge, loot or barter between rounds. Every point of damage you dealt bought you a coin; every kill, five hundred.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
          <HudReadout label="Purse" value={`$${cash.toLocaleString()}`} tone="brass" size="lg" />
          <HudReadout label="Damage dealt" value="412" tone="magenta" size="lg" />
          <HudReadout label="Kills" value="3" tone="magenta" size="lg" />
        </div>
      </div>

      <SectionBanner accent="magenta">Cataclysmic tier</SectionBanner>
      <div style={{ display: 'flex', gap: 'var(--space-6)', overflowX: 'auto', padding: 'var(--space-7) 0' }}>
        {featured.map(w => (
          <WeaponCard key={w.name} {...w} owned={owned[w.name]} affordable={cash >= w.cost} onBuy={() => buy(w)} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)', marginTop: 'var(--space-6)' }}>
        <div>
          <div className="ac-banner" style={{ color: 'var(--text-on-parchment)', marginBottom: 'var(--space-4)' }}>Ordnance</div>
          <div style={{ borderTop: 'var(--border-ink-rule)' }}>
            {ARSENAL.slice(0, 6).map(w => <ShopRow key={w.name} {...w} owned={owned[w.name]} affordable={cash >= w.cost} onBuy={() => buy(w)} />)}
          </div>
        </div>
        <div>
          <div className="ac-banner" style={{ color: 'var(--text-on-parchment)', marginBottom: 'var(--space-4)' }}>Defenses &amp; utility</div>
          <div style={{ borderTop: 'var(--border-ink-rule)' }}>
            {DEFENSES.map(w => <ShopRow key={w.name} {...w} owned={owned[w.name]} affordable={cash >= w.cost} onBuy={() => buy(w)} />)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function StandingsScreen({ onAgain, onLobby }) {
  const sorted = [...PLAYERS].sort((a, b) => b.kills - a.kills || b.cash - a.cash);
  return (
    <div style={{ padding: 'var(--gutter-screen)', display: 'grid', placeItems: 'center', minHeight: '100%' }}>
      <div style={{ width: 720, display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
        <Wordmark size="sm" />
        <SectionBanner accent="brass">Final reckoning</SectionBanner>
        <Panel accent="brass" pad={false} kicker="5 rounds · Plateau · seed VLTK" title="Standings">
          {sorted.map((p, i) => (
            <StandingsRow key={p.slot} rank={i + 1} name={p.name} color={p.color} hp={p.hp} kills={p.kills} damage={p.damage} cash={p.cash} eliminated={p.eliminated} />
          ))}
        </Panel>
        <Panel surface="parchment" title="Guild ledger">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'var(--space-7)' }}>
            {[['Accuracy', '61%'], ['Favoured', 'Void Bomb'], ['Longest shot', '842 u'], ['Placement', '1st']].map(([k, v]) => (
              <div key={k}>
                <div className="ac-label" style={{ color: 'var(--text-on-parchment-muted)' }}>{k}</div>
                <div className="ac-readout" style={{ color: 'var(--text-on-parchment)', fontSize: 'var(--text-lg)' }}>{v}</div>
              </div>
            ))}
          </div>
        </Panel>
        <div style={{ display: 'flex', gap: 'var(--space-5)', justifyContent: 'center' }}>
          <Button variant="primary" size="lg" onClick={onAgain}>Rematch</Button>
          <Button variant="ghost" size="lg" onClick={onLobby}>Back to lobby</Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ArmoryScreen, StandingsScreen });
