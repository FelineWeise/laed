/* LAED UI Kit — PhoneShell
   Device bezel + status bar + top app bar (breadcrumb left, kebab right).
   Children render inside the 390×844 screen. */

const StatusBar = ({ alert }) => (
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 50, zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 22px 6px', pointerEvents: 'none' }}>
    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--laed-ink)', letterSpacing: '-0.3px' }}>9:41</span>
    <div style={{ width: 126, height: 34, background: 'var(--laed-ink)', borderRadius: 20, position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0 }} />
    <SignalWifiBattery />
  </div>
);

const AppBar = ({ breadcrumb, breadcrumbColor, menuOpen, onMenu, right }) => (
  <div style={{ position: 'absolute', top: 50, left: 0, right: 0, height: 40, zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
    <span style={{ fontSize: 'var(--laed-size-label)', letterSpacing: 'var(--laed-track-label)', color: breadcrumbColor || 'var(--laed-muted)', textTransform: 'uppercase', cursor: breadcrumb && breadcrumb.onClick ? 'pointer' : 'default' }}
      onClick={breadcrumb && breadcrumb.onClick}>
      {breadcrumb ? breadcrumb.label : ''}
    </span>
    {right !== undefined ? right : (
      <button onClick={onMenu} style={{ width: 28, height: 28, border: 'none', background: menuOpen ? 'var(--laed-ink)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0 }}>
        <MenuBars open={menuOpen} />
      </button>
    )}
  </div>
);

const PhoneShell = ({ bg = 'var(--laed-paper)', children }) => (
  <div style={{ width: 390, height: 844, borderRadius: 'var(--laed-radius-phone)', background: bg, overflow: 'hidden', position: 'relative', boxShadow: '0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)', flexShrink: 0, fontFamily: 'var(--laed-font-sans)' }}>
    {children}
  </div>
);

Object.assign(window, { PhoneShell, StatusBar, AppBar });
