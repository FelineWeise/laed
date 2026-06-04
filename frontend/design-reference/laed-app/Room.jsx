/* LAED UI Kit — Room
   Per-relationship workspace: header + tab bar (Thread / Files / AI / Settle),
   each tab a panel. Includes a live message thread with AI system messages. */

const RoomHeader = ({ name = 'SHOREDITCH', party = 'Josephine K.' }) => (
  <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid var(--laed-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
    <div style={{ width: 60 }} />
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: 'var(--laed-ink)' }}>{name}</div>
      <div style={{ fontSize: 9, color: 'var(--laed-muted)', letterSpacing: '1px', marginTop: 1 }}>{party}</div>
    </div>
    <div style={{ fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--laed-green)' }}>Active</div>
  </div>
);

const RoomTabs = ({ active, onTab }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid var(--laed-border)', flexShrink: 0 }}>
    {['Thread', 'Files', 'AI', 'Settle'].map(t => (
      <button key={t} onClick={() => onTab(t)} style={{
        flex: 1, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 8, letterSpacing: '1.5px',
        textTransform: 'uppercase', fontFamily: 'inherit', color: active === t ? 'var(--laed-ink)' : 'var(--laed-muted)',
        borderBottom: `1.5px solid ${active === t ? 'var(--laed-ink)' : 'transparent'}`,
      }}>{t}</button>
    ))}
  </div>
);

const Bubble = ({ kind, sender, time, children }) => {
  if (kind === 'ai') return (
    <div style={{ marginBottom: 12, display: 'flex' }}>
      <div style={{ maxWidth: '88%' }}>
        <div style={{ background: 'var(--laed-paper)', color: 'var(--laed-muted)', border: '1px solid var(--laed-border)', borderRadius: 2, padding: '9px 12px', fontSize: 10, lineHeight: 1.5 }}>
          <span style={{ display: 'block', fontSize: 8, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--laed-border)', marginBottom: 3 }}>AI</span>
          {children}
        </div>
        <div style={{ fontSize: 8, color: 'var(--laed-border)', marginTop: 3 }}>{time}</div>
      </div>
    </div>
  );
  const me = kind === 'me';
  return (
    <div style={{ marginBottom: 12, display: 'flex', flexDirection: me ? 'row-reverse' : 'row' }}>
      <div style={{ maxWidth: '78%' }}>
        {sender && <div style={{ fontSize: 8, color: 'var(--laed-muted)', letterSpacing: '1px', marginBottom: 3, textTransform: 'uppercase' }}>{sender}</div>}
        <div style={{
          padding: '9px 12px', borderRadius: 2, fontSize: 11, lineHeight: 1.55,
          background: me ? 'var(--laed-ink)' : '#fff', color: me ? '#fff' : 'var(--laed-ink)',
          border: me ? 'none' : '1px solid var(--laed-border)',
        }}>{children}</div>
        <div style={{ fontSize: 8, color: 'var(--laed-border)', marginTop: 3, textAlign: me ? 'right' : 'left' }}>{time}</div>
      </div>
    </div>
  );
};

const Thread = ({ msgs, onRecord, onSend }) => {
  const [val, setVal] = React.useState('');
  return (
    <React.Fragment>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {msgs.map((m, i) => <Bubble key={i} {...m}>{m.text}</Bubble>)}
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--laed-border)', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', background: '#F8F6F2' }}>
        <button onClick={onRecord} style={{ width: 30, height: 30, borderRadius: '50%', background: 'transparent', border: '1px solid var(--laed-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--laed-muted)' }}><Mic s={12} /></button>
        <input value={val} onChange={e => setVal(e.target.value)} placeholder="Message…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 11, fontFamily: 'inherit', color: 'var(--laed-ink)', borderBottom: '1px solid var(--laed-border)', padding: '4px 0' }} />
        <button onClick={() => { if (val.trim()) { onSend(val.trim()); setVal(''); } }} style={{ background: 'var(--laed-navy)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 9, letterSpacing: '1.5px', fontFamily: 'inherit', textTransform: 'uppercase', padding: '6px 10px', borderRadius: 1 }}>Send</button>
      </div>
    </React.Fragment>
  );
};

const PanelLabel = ({ children }) => <div style={{ fontSize: 8, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--laed-muted)', marginBottom: 10 }}>{children}</div>;

const Files = () => (
  <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
    <PanelLabel>Documents</PanelLabel>
    {['Term_Sheet_v3.pdf', 'Floorplan_Shoreditch.dwg', 'Budget_Overview.xlsx'].map(f => (
      <div key={f} style={{ padding: '9px 0', borderBottom: '1px solid var(--laed-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--laed-ink)' }}>{f}</span>
        <span style={{ fontSize: 8, color: 'var(--laed-muted)', letterSpacing: '1px' }}>VIEW</span>
      </div>
    ))}
    <div style={{ marginTop: 14, padding: '10px 12px', border: '1px dashed var(--laed-border)', borderRadius: 2, textAlign: 'center', fontSize: 9, color: 'var(--laed-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>+ Upload</div>
  </div>
);

const AIMemory = () => (
  <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
    <div style={{ padding: '10px 12px', background: 'var(--laed-navy-tint)', border: '1px solid var(--laed-navy-line)', borderRadius: 2, marginBottom: 12 }}>
      <div style={{ fontSize: 8, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--laed-navy)', marginBottom: 4 }}>Flagged</div>
      <div style={{ fontSize: 11, color: 'var(--laed-ink)' }}>2 open commitments</div>
    </div>
    <div style={{ marginBottom: 14 }}>
      <PanelLabel>Short-term memory</PanelLabel>
      {['Colonnade ratio to be revised', '€2.4M deposit on planning approval', 'Thursday deadline for drawings'].map(m => (
        <div key={m} style={{ padding: '6px 0', borderBottom: '1px solid var(--laed-border)', fontSize: 10, color: 'var(--laed-ink)', lineHeight: 1.4 }}>— {m}</div>
      ))}
    </div>
    <div>
      <PanelLabel>Long-term memory</PanelLabel>
      {['Josephine: prefers direct communication', 'Previous deal: Clerkenwell closed Q4 2024'].map(m => (
        <div key={m} style={{ padding: '6px 0', borderBottom: '1px solid var(--laed-border)', fontSize: 10, color: 'var(--laed-muted)', lineHeight: 1.4 }}>— {m}</div>
      ))}
    </div>
  </div>
);

const Settle = () => (
  <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
    <PanelLabel>Settlement</PanelLabel>
    <div style={{ padding: '14px 12px', border: '1px solid var(--laed-border)', borderRadius: 2 }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--laed-ink)', marginBottom: 4, letterSpacing: '-0.3px' }}>€2.4M</div>
      <div style={{ fontSize: 10, color: 'var(--laed-muted)' }}>Deposit · On planning approval</div>
      <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--laed-navy)', marginTop: 10 }}>Pending</div>
    </div>
    <div style={{ marginTop: 12, fontSize: 9, color: 'var(--laed-muted)', lineHeight: 1.6 }}>Settlement orchestrated via SWIFT / SEPA. LAED does not hold funds.</div>
  </div>
);

const Room = ({ tab, onTab, onBack, onMenu, menuOpen, msgs, onRecord, onSend }) => (
  <PhoneShell bg="#F8F6F2">
    <StatusBar />
    <AppBar breadcrumb={{ label: '←', onClick: onBack }} menuOpen={menuOpen} onMenu={onMenu} />
    <div style={{ position: 'absolute', top: 90, bottom: 0, left: 0, right: 0, background: '#F8F6F2', display: 'flex', flexDirection: 'column' }}>
      <RoomHeader />
      <RoomTabs active={tab} onTab={onTab} />
      {tab === 'Thread' && <Thread msgs={msgs} onRecord={onRecord} onSend={onSend} />}
      {tab === 'Files' && <Files />}
      {tab === 'AI' && <AIMemory />}
      {tab === 'Settle' && <Settle />}
    </div>
  </PhoneShell>
);

Object.assign(window, { Room, RoomHeader, RoomTabs, Thread, Files, AIMemory, Settle, Bubble, PanelLabel });
