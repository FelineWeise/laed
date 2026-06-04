/* LAED UI Kit — Icons
   Real geometry copied from the source export. All use currentColor so
   they inherit text color (ink on light chrome, paper-white on dark fills). */

const Mic = ({ s = 17, color }) => (
  <svg width={s} height={s} viewBox="0 0 17 17" fill="none" stroke={color || 'currentColor'} strokeWidth="1.3" style={{ display: 'block' }}>
    <rect x="5.5" y="2" width="6" height="9" rx="3" fill="rgba(26,25,23,0.08)" stroke={color || 'currentColor'} />
    <path d="M2.5 8.5C2.5 11.8 5.2 14.5 8.5 14.5s6-2.7 6-6" strokeLinecap="round" />
    <line x1="8.5" y1="14.5" x2="8.5" y2="17" strokeLinecap="round" />
  </svg>
);

const Phone = ({ s = 22, color = '#fff' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" fill={color} />
  </svg>
);

const Camera = ({ s = 17 }) => (
  <svg width={s} height={s} viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ display: 'block' }}>
    <rect x="1.5" y="5" width="14" height="10" rx="2" fill="rgba(26,25,23,0.08)" stroke="currentColor" />
    <circle cx="8.5" cy="10" r="2.8" stroke="currentColor" />
    <path d="M6 5l1-2.5h3L11 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MenuBars = ({ open }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px', alignItems: 'center' }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{ width: 10, height: 1.5, borderRadius: 1, background: open ? 'var(--laed-paper)' : 'var(--laed-muted)' }} />
    ))}
  </div>
);

const Grid = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1" y="1" width="5" height="5" rx="1" /><rect x="8" y="1" width="5" height="5" rx="1" /><rect x="1" y="8" width="5" height="5" rx="1" /><rect x="8" y="8" width="5" height="5" rx="1" /></svg>
);
const Artifact = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 11V3l5-1.5L12 3v8l-5 1.5L2 11z" /><line x1="7" y1="1.5" x2="7" y2="12.5" /></svg>
);
const Archive = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 12V4l10-2v10" /><rect x="5" y="8" width="4" height="4" /></svg>
);
const Person = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="7" cy="5" r="2.5" /><path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" /></svg>
);
const Gear = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="7" cy="7" r="2" /><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.9 2.9l1.4 1.4M9.7 9.7l1.4 1.4M2.9 11.1l1.4-1.4M9.7 4.3l1.4-1.4" /></svg>
);

/* Status-bar glyphs */
const SignalWifiBattery = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 11 }}>
      {[3, 5, 8, 11].map((h, i) => <span key={i} style={{ width: 3, height: h, background: 'var(--laed-ink)', borderRadius: 1 }} />)}
    </div>
    <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
      <path d="M7.5 9.5a1 1 0 100 2 1 1 0 000-2z" fill="#1A1917" />
      <path d="M4.5 7C5.7 5.8 6.5 5 7.5 5s1.8.8 3 2" stroke="#1A1917" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M2 4.5C3.7 2.8 5.5 2 7.5 2s3.8.8 5.5 2.5" stroke="#1A1917" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
    <div style={{ width: 25, height: 12, border: '1.5px solid var(--laed-ink)', borderRadius: 3, position: 'relative', display: 'flex', alignItems: 'center', padding: 1.5 }}>
      <div style={{ height: '100%', width: '70%', background: 'var(--laed-ink)', borderRadius: 1 }} />
      <span style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 3, height: 6, background: 'var(--laed-ink)', borderRadius: '0 1px 1px 0' }} />
    </div>
  </div>
);

Object.assign(window, { Mic, Phone, Camera, MenuBars, Grid, Artifact, Archive, Person, Gear, SignalWifiBattery });
