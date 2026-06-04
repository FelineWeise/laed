/* LAED UI Kit — AIVoice
   Tap-to-talk assistant scoped to active clusters (context chips).
   Navy replaces the old orange live-dot. */

const ContextChip = ({ label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(26,25,23,0.05)', border: '1px solid rgba(26,25,23,0.1)', borderRadius: 10, fontSize: 8, letterSpacing: '1px', color: 'var(--laed-muted)', textTransform: 'uppercase' }}>
    <span style={{ color: 'var(--laed-navy)' }}>●</span> {label}
  </span>
);

const AIBubble = ({ children }) => (
  <div style={{ background: '#fff', border: '1px solid var(--laed-border)', borderRadius: 2, padding: '11px 14px', fontSize: 11, color: 'var(--laed-ink)', lineHeight: 1.55 }}>{children}</div>
);
const UserBubble = ({ children }) => (
  <div style={{ background: 'var(--laed-ink)', color: '#fff', borderRadius: 2, padding: '11px 14px', fontSize: 11, lineHeight: 1.55, maxWidth: '80%' }}>{children}</div>
);

const AIVoice = ({ onBack, listening }) => (
  <PhoneShell bg="var(--laed-paper)">
    <StatusBar />
    <AppBar breadcrumb={{ label: '← AI', onClick: onBack }} right={<span />} />
    <div style={{ position: 'absolute', top: 96, left: 0, right: 0, padding: '10px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', zIndex: 10 }}>
      <ContextChip label="Shoreditch" /><ContextChip label="OINJ" /><ContextChip label="LAED" />
    </div>
    <div style={{ position: 'absolute', top: 148, bottom: 88, left: 0, right: 0, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'row-reverse' }}><UserBubble>What's the status on the Shoreditch deposit?</UserBubble></div>
      <div style={{ display: 'flex' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '88%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--laed-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="#fff" opacity="0.9" /></svg>
            </div>
            <span style={{ fontSize: 8, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--laed-muted)' }}>AI</span>
          </div>
          <AIBubble>The €2.4M deposit is pending planning approval. Josephine confirmed the trigger condition on 13 Mar — it's in the term sheet you uploaded. No approval decision yet.</AIBubble>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'row-reverse' }}><UserBubble>And the drawings — are they done?</UserBubble></div>
      <div style={{ display: 'flex' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '88%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--laed-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="#fff" opacity="0.9" /></svg>
            </div>
            <span style={{ fontSize: 8, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--laed-muted)' }}>AI · Responding</span>
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--laed-border)', borderRadius: 2, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--laed-navy)', flexShrink: 0, animation: 'laedpulse 1s infinite' }} />
            <span style={{ fontSize: 10, color: 'var(--laed-muted)', letterSpacing: '0.3px' }}>Open commitment — due Thursday. Not yet uploaded.</span>
          </div>
        </div>
      </div>
    </div>
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 20, gap: 20, zIndex: 150 }}>
      <div style={{ flex: 1, maxWidth: 260, height: 40, border: '1px solid var(--laed-border)', borderRadius: 20, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--laed-navy)', animation: 'laedpulse 1s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: 'var(--laed-muted)' }}>Listening…</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        <button style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--laed-navy)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mic color="var(--laed-paper)" />
        </button>
        <span style={{ fontSize: 7, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--laed-muted)' }}>ai</span>
      </div>
    </div>
  </PhoneShell>
);

Object.assign(window, { AIVoice, ContextChip, AIBubble, UserBubble });
