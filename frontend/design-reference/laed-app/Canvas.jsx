/* LAED UI Kit — Canvas, BottomBar, Dropdown, SubCanvas
   The home surface: faint 40px grid + cluster discs, plus the
   mic · call · camera bottom bar. */

const GridBg = ({ id }) => (
  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
    <defs><pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0L0 0 0 40" fill="none" stroke="rgba(26,25,23,0.06)" strokeWidth="1" />
    </pattern></defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>
);

const Cluster = ({ cx, cy, r, name, sub, dotNavy, dotMuted, archived, accent, onClick }) => (
  <g style={{ cursor: 'pointer' }} opacity={archived ? 0.45 : 1} onClick={onClick}>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={accent === 'green' ? 'rgba(45,106,79,0.28)' : 'rgba(26,25,23,0.12)'} strokeWidth="1" strokeDasharray={archived ? '3 4' : undefined} />
    {!archived && <circle cx={cx} cy={cy} r={r - 8} fill={accent === 'green' ? 'rgba(45,106,79,0.06)' : 'rgba(26,25,23,0.04)'} />}
    {dotNavy && <circle cx={cx + r * 0.55} cy={cy - r * 0.58} r="5.5" fill="var(--laed-navy)" />}
    {dotMuted && <circle cx={cx + r * 0.55} cy={cy + r * 0.58} r="3.5" fill="#1A1917" opacity="0.4" />}
    <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="Helvetica Neue,Arial" fontSize="9" fontWeight="600" letterSpacing="1.5" fill={archived ? '#8A8780' : '#1A1917'}>{name}</text>
    <text x={cx} y={cy + 9} textAnchor="middle" fontFamily="Helvetica Neue,Arial" fontSize="7" fill="#8A8780">{sub}</text>
  </g>
);

const ZoomPill = ({ label = '100%' }) => (
  <button style={{ position: 'absolute', bottom: 100, right: 18, background: 'var(--laed-ink)', border: 'none', borderRadius: 12, padding: '5px 11px', fontFamily: 'inherit', fontSize: 8, letterSpacing: '1.5px', color: 'var(--laed-paper)', textTransform: 'uppercase', cursor: 'pointer', zIndex: 160 }}>{label}</button>
);

const BottomBar = ({ onMic, onCall, onCamera }) => (
  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 0 16px', zIndex: 150 }}>
    <button onClick={onMic} style={btnSm()}><span style={{ color: 'var(--laed-ink)' }}><Mic /></span></button>
    <button onClick={onCall} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--laed-navy)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--laed-shadow-fab)', flexShrink: 0 }}><Phone /></button>
    <button onClick={onCamera} style={btnSm()}><span style={{ color: 'var(--laed-ink)' }}><Camera /></span></button>
  </div>
);
function btnSm() {
  return { width: 40, height: 40, borderRadius: '50%', background: 'rgba(26,25,23,0.06)', border: '1px solid rgba(26,25,23,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
}

const Dropdown = ({ onPick }) => {
  const items = [
    ['Projects', <Grid />], ['Artifacts', <Artifact />], ['Archive', <Archive />], ['Contacts', <Person />], ['Settings', <Gear />],
  ];
  return (
    <div style={{ position: 'absolute', top: 90, right: 18, background: '#fff', border: '1px solid var(--laed-border)', borderRadius: 2, width: 160, zIndex: 400, boxShadow: 'var(--laed-shadow-pop)' }}>
      {items.map(([label, icon], i) => (
        <div key={label} onClick={() => onPick && onPick(label)} style={{ padding: '11px 14px', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--laed-ink)', borderBottom: i < items.length - 1 ? '1px solid var(--laed-paper)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 14, height: 14, opacity: 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--laed-ink)' }}>{icon}</span>
          {label}
        </div>
      ))}
    </div>
  );
};

const Canvas = ({ menuOpen, onMenu, onPickMenu, onCluster, onMic, onCall, onCamera }) => (
  <PhoneShell>
    <StatusBar />
    <AppBar menuOpen={menuOpen} onMenu={onMenu} />
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: menuOpen ? 0.35 : 1, transition: 'opacity .2s' }}>
      <GridBg id="grid-canvas" />
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <Cluster cx={90} cy={260} r={48} name="SHOREDITCH" sub="Property" dotNavy dotMuted onClick={() => onCluster && onCluster('SHOREDITCH')} />
        <Cluster cx={248} cy={195} r={42} name="OINJ" sub="Product" accent="green" onClick={() => onCluster && onCluster('OINJ')} />
        <Cluster cx={164} cy={510} r={56} name="LAED" sub="Product Dev" onClick={() => onCluster && onCluster('LAED')} />
        <Cluster cx={310} cy={470} r={38} name="DOGS" sub="Architecture" onClick={() => onCluster && onCluster('DOGS')} />
        <Cluster cx={72} cy={614} r={36} name="BREATHING" sub="Archive" archived />
      </svg>
      <ZoomPill />
    </div>
    {menuOpen && <Dropdown onPick={onPickMenu} />}
    <BottomBar onMic={onMic} onCall={onCall} onCamera={onCamera} />
  </PhoneShell>
);

/* Shoreditch drill-in — radial subcategories */
const SubCanvas = ({ onBack, onNode }) => {
  const nodes = [
    { cx: 195, cy: 195, r: 38, name: 'FLOORPLANS', meta: '4 files' },
    { cx: 340, cy: 205, r: 38, name: 'FINANCIALS', meta: '€2.4M · 3 docs', dot: 'navy' },
    { cx: 332, cy: 565, r: 36, name: 'LEGAL', meta: 'Term Sheet' },
    { cx: 195, cy: 585, r: 34, name: 'SITE', meta: 'Photos · Plans' },
    { cx: 58, cy: 565, r: 36, name: 'COMMS', meta: '3 unread', dot: 'green' },
    { cx: 50, cy: 205, r: 36, name: 'DOCS', meta: '7 files' },
  ];
  return (
    <PhoneShell>
      <StatusBar />
      <AppBar breadcrumb={{ label: '← SHOREDITCH', onClick: onBack }} right={<span />} />
      <div style={{ position: 'absolute', inset: 0, background: 'var(--laed-paper)', overflow: 'hidden' }}>
        <GridBg id="grid-sub" />
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {nodes.map(n => {
            const dx = n.cx - 195, dy = n.cy - 390, len = Math.hypot(dx, dy);
            const x1 = 195 + (dx / len) * 46, y1 = 390 + (dy / len) * 46;
            const x2 = n.cx - (dx / len) * n.r, y2 = n.cy - (dy / len) * n.r;
            return <line key={'l' + n.name} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(26,25,23,0.10)" strokeWidth="1" />;
          })}
          <circle cx={195} cy={390} r={46} fill="rgba(26,25,23,0.06)" stroke="rgba(26,25,23,0.18)" strokeWidth="1.5" />
          <text x={195} y={385} textAnchor="middle" fontFamily="Helvetica Neue,Arial" fontSize="10" fontWeight="700" letterSpacing="2" fill="#1A1917">SHOREDITCH</text>
          <text x={195} y={400} textAnchor="middle" fontFamily="Helvetica Neue,Arial" fontSize="7" fill="#8A8780">6 categories</text>
          {nodes.map(n => (
            <g key={n.name} style={{ cursor: 'pointer' }} onClick={() => onNode && onNode(n.name)}>
              <circle cx={n.cx} cy={n.cy} r={n.r} fill="rgba(26,25,23,0.03)" stroke="rgba(26,25,23,0.10)" strokeWidth="1" />
              {n.dot && <circle cx={n.cx + n.r * 0.5} cy={n.cy - n.r * 0.5} r="4.5" fill={n.dot === 'green' ? 'var(--laed-green)' : 'var(--laed-navy)'} />}
              <text x={n.cx} y={n.cy + n.r + 14} textAnchor="middle" fontFamily="Helvetica Neue,Arial" fontSize="8" fontWeight="600" letterSpacing="1.2" fill="#1A1917">{n.name}</text>
              <text x={n.cx} y={n.cy + n.r + 25} textAnchor="middle" fontFamily="Helvetica Neue,Arial" fontSize="7" fill="#8A8780">{n.meta}</text>
            </g>
          ))}
        </svg>
        <ZoomPill label="SHOREDITCH" />
      </div>
    </PhoneShell>
  );
};

Object.assign(window, { Canvas, SubCanvas, BottomBar, Dropdown, GridBg, ZoomPill, btnSm });
