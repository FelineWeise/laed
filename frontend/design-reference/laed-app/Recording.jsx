/* LAED UI Kit — Recording
   Live transcript with fresh words highlighted (navy), manual + AI tags,
   record dot wrapped in a navy halo ring. */

const WAVE = [6, 14, 20, 10, 18, 24, 14, 8, 20, 16, 22, 10, 6, 18, 14, 20, 8, 24, 12, 18];

const Tag = ({ children, active, ai, onClick }) => (
  <button onClick={onClick} style={{
    padding: '4px 10px', borderRadius: 10, fontSize: 9, letterSpacing: '1px', fontFamily: 'inherit', cursor: 'pointer',
    border: ai ? '1px dashed var(--laed-navy)' : '1px solid var(--laed-border)',
    borderColor: ai ? 'var(--laed-navy)' : (active ? 'var(--laed-ink)' : 'var(--laed-border)'),
    background: active ? 'var(--laed-ink)' : 'transparent',
    color: ai ? 'var(--laed-navy)' : (active ? '#fff' : 'var(--laed-muted)'),
  }}>{children}</button>
);

const Recording = ({ onBack }) => {
  const [tags, setTags] = React.useState({ Shoreditch: true, Floorplans: true, Legal: false, Financials: false, OINJ: false });
  const toggle = k => setTags(t => ({ ...t, [k]: !t[k] }));
  return (
    <PhoneShell bg="#F8F6F2">
      <StatusBar />
      <AppBar
        breadcrumb={{ label: '← ● Recording', onClick: onBack }} breadcrumbColor="var(--laed-navy)"
        right={<span style={{ fontSize: 9, letterSpacing: '1px', color: 'var(--laed-muted)' }}>0:47</span>} />
      <div style={{ position: 'absolute', top: 90, bottom: 88, left: 0, right: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Waveform */}
        <div style={{ flex: '0 0 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', gap: 2 }}>
          {WAVE.map((h, i) => (
            <span key={i} style={{ width: 2, borderRadius: 1, background: 'var(--laed-navy)', height: h, animation: `laedwave 0.6s ${i * 0.05}s infinite ease-in-out` }} />
          ))}
        </div>
        {/* Transcript */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ fontSize: 8, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--laed-muted)', marginBottom: 10 }}>Live transcript</div>
          <div style={{ lineHeight: 1.85, fontSize: 12, color: 'var(--laed-ink)' }}>
            So the colonnade ratio — Josephine was right about that. We need to bring it back to the original 1:4 proportion. The revised drawings should go out Thursday latest. Also confirm with the structural engineer about the basement level —{' '}
            <span style={{ color: 'var(--laed-navy)' }}>that's a separate cost item we haven't scoped yet. Budget impact maybe €40-60k. Need to loop in Feline on this.</span>
          </div>
        </div>
        {/* Tags */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--laed-border)', flexShrink: 0 }}>
          <div style={{ fontSize: 8, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--laed-muted)', marginBottom: 8 }}>Categorise</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {Object.keys(tags).map(k => <Tag key={k} active={tags[k]} onClick={() => toggle(k)}>{k}</Tag>)}
          </div>
          <div style={{ fontSize: 8, color: 'var(--laed-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>AI suggested</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Tag ai>Commitment · Thu</Tag><Tag ai>Cost item · €40-60k</Tag><Tag ai>Action · Structural</Tag>
          </div>
        </div>
      </div>
      {/* Record dot */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 20, zIndex: 150 }}>
        <button onClick={onBack} style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--laed-navy)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 8px rgba(29,58,87,0.12)' }}>
          <div style={{ width: 18, height: 18, borderRadius: 3, background: '#fff' }} />
        </button>
      </div>
    </PhoneShell>
  );
};

Object.assign(window, { Recording, Tag });
