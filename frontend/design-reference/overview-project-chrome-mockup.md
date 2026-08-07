# LAED chrome mockup (pre-implementation review)

**Color map (locked)**

| Screen | Accent |
|--------|--------|
| `/global` overview (List / Canvas / Manage) | Green |
| `/laed`, `/capture` | Green |
| Project room, threads, Files, in-project canvas | Navy |

**Layout:** content area reserves **92px** above the fixed bottom bar so composers stay usable.

## Open in a browser

Plan mode cannot write `.html` files. Either:

1. Approve **Agent** and ask to “save the mockup as HTML”, or  
2. From the repo root, extract and open:

```bash
# Extract the HTML document between the markers below into a real file:
sed -n '/^<!-- MOCKUP_HTML_START -->$/,/^<!-- MOCKUP_HTML_END -->$/p' \
  laed/frontend/design-reference/overview-project-chrome-mockup.md \
  | sed '1d;$d' \
  > /tmp/laed-chrome-mockup.html && open /tmp/laed-chrome-mockup.html
```

Or copy everything between the HTML markers into a file named `overview-project-chrome-mockup.html` and open it.

---

<!-- MOCKUP_HTML_START -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LAED — Green overview / Navy project (mockup)</title>
  <style>
    :root {
      --ink: #1a1917;
      --muted: #8a8780;
      --paper: #f2f0ec;
      --white: #fff;
      --border: rgba(26, 25, 23, 0.12);
      --navy: #1d3a57;
      --navy-chrome: rgba(29, 58, 87, 0.12);
      --navy-line: rgba(29, 58, 87, 0.35);
      --green: #1b4332;
      --green-bg: rgba(27, 67, 50, 0.1);
      --green-chrome: rgba(27, 67, 50, 0.12);
      --green-line: rgba(27, 67, 50, 0.35);
      --bar-h: 92px;
      --font: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
      --phone-w: 390px;
      --phone-h: 780px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      font-family: var(--font);
      background: #d8d4ce;
      color: var(--ink);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 16px 48px;
    }
    h1 { margin: 0; font-size: 13px; letter-spacing: 1.4px; text-transform: uppercase; }
    .lead {
      margin: 0; max-width: 720px; text-align: center;
      font-size: 12px; line-height: 1.5; color: var(--muted);
    }
    .lead strong { color: var(--ink); font-weight: 600; }
    .legend {
      display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
      font-size: 11px; color: var(--muted);
    }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    .swatch.green { background: var(--green); }
    .swatch.navy { background: var(--navy); }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .controls button {
      border: 1px solid var(--border); background: var(--white); border-radius: 999px;
      padding: 8px 14px; font-size: 11px; letter-spacing: 0.6px;
      text-transform: uppercase; cursor: pointer; font-family: inherit;
    }
    .controls button.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .caption {
      width: var(--phone-w); font-size: 10px; letter-spacing: 1px;
      text-transform: uppercase; color: var(--muted); margin-bottom: 4px;
    }
    .phone {
      width: var(--phone-w); height: var(--phone-h); background: var(--paper);
      border-radius: 28px; border: 1px solid rgba(26, 25, 23, 0.18);
      box-shadow: 0 18px 40px rgba(26, 25, 23, 0.12);
      overflow: hidden; position: relative; display: flex; flex-direction: column;
    }
    .appbar {
      height: 40px; display: flex; align-items: center; justify-content: space-between;
      padding: 0 18px; flex-shrink: 0; font-size: 13px;
    }
    .appbar.green { background: var(--green-chrome); }
    .appbar.navy { background: var(--navy-chrome); }
    .brand { font-weight: 700; letter-spacing: 1.5px; }
    .sec { font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; }
    .menu { width: 18px; height: 12px; display: flex; flex-direction: column; justify-content: space-between; }
    .menu i { display: block; height: 1.5px; background: var(--ink); }
    .body {
      flex: 1; min-height: 0; display: flex; flex-direction: column;
      padding-bottom: var(--bar-h); overflow: hidden;
    }
    .toolbar {
      display: flex; align-items: center; gap: 6px; padding: 8px 16px;
      border-bottom: 1px solid rgba(26, 25, 23, 0.07); flex-shrink: 0; background: var(--white);
    }
    .nav {
      font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase;
      padding: 6px 10px; border-radius: 999px; color: var(--muted);
    }
    .nav.on { background: rgba(26, 25, 23, 0.08); color: var(--ink); font-weight: 700; }
    .nav.link-green { margin-left: auto; color: var(--green); font-weight: 600; }
    .nav.link-navy { margin-left: auto; color: var(--navy); font-weight: 600; }
    .info {
      width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--border);
      font-size: 9px; display: inline-flex; align-items: center; justify-content: center;
      color: var(--muted); position: relative;
    }
    .info:hover::after {
      content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 6px);
      transform: translateX(-50%); white-space: nowrap; background: var(--ink); color: #fff;
      font-size: 9px; padding: 6px 8px; border-radius: 6px; letter-spacing: 0;
      text-transform: none; z-index: 5;
    }
    .tools {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
      padding: 10px 16px 6px; flex-shrink: 0;
    }
    .label { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
    .btn {
      border: none; border-radius: 8px; padding: 7px 12px; font-size: 9px;
      letter-spacing: 0.6px; text-transform: uppercase; font-weight: 600; font-family: inherit;
    }
    .btn.green { background: var(--green); color: #fff; }
    .btn.navy { background: var(--navy); color: #fff; }
    .btn.outline {
      background: var(--white); color: var(--ink); border: 1px solid var(--border); font-weight: 500;
    }
    .btn.outline.on-green { background: var(--green); border-color: var(--green); color: #fff; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 10px; flex-shrink: 0; }
    .chip {
      border: 1px solid var(--border); background: transparent; border-radius: 999px;
      padding: 5px 10px; font-size: 10px; font-family: inherit;
    }
    .chip.on-green { background: var(--green); border-color: var(--green); color: #fff; }
    .stage {
      flex: 1; min-height: 0; margin: 0 12px; border-radius: 16px;
      background:
        linear-gradient(rgba(26, 25, 23, 0.04) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(90deg, rgba(26, 25, 23, 0.04) 1px, transparent 1px) 0 0 / 24px 24px,
        var(--paper);
      position: relative; overflow: hidden;
    }
    .bubble {
      position: absolute; width: 148px; height: 148px; border-radius: 50%;
      background: var(--white); border: 1px solid rgba(26, 25, 23, 0.12);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 12px; left: 50%; top: 52%;
      transform: translate(-50%, -50%);
      box-shadow: 0 8px 20px rgba(26, 25, 23, 0.06);
    }
    .bubble .name {
      font-size: 11px; font-weight: 700; letter-spacing: 0.4px;
      text-transform: uppercase; line-height: 1.25;
    }
    .bubble .kind { margin-top: 4px; font-size: 10px; color: var(--muted); }
    .avatar {
      position: absolute; width: 22px; height: 22px; border-radius: 50%;
      color: #fff; font-size: 9px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .avatar.green { background: var(--green); }
    .avatar.navy { background: var(--navy); }
    .avatar.a { left: -6px; top: 58%; }
    .avatar.b { right: -6px; top: 40%; }
    .bottombar {
      position: absolute; left: 0; right: 0; bottom: 0; height: var(--bar-h);
      backdrop-filter: blur(10px); display: flex; align-items: center;
      justify-content: center; gap: 34px; padding-bottom: 14px; z-index: 20;
    }
    .bottombar.green {
      background: rgba(27, 67, 50, 0.1);
      border-top: 1px solid rgba(27, 67, 50, 0.18);
    }
    .bottombar.navy {
      background: rgba(29, 58, 87, 0.1);
      border-top: 1px solid rgba(29, 58, 87, 0.2);
    }
    .fab {
      width: 52px; height: 52px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700;
    }
    .fab.g-idle { background: rgba(27, 67, 50, 0.14); color: var(--green); }
    .fab.g-on { background: var(--green); color: #fff; }
    .fab.n-idle { background: rgba(29, 58, 87, 0.14); color: var(--navy); }
    .fab.n-on { background: var(--navy); color: #fff; }
    .room-head { padding: 8px 18px 12px; flex-shrink: 0; background: var(--white); }
    .room-head h2 {
      margin: 0; font-size: 18px; letter-spacing: 0.4px; text-transform: uppercase;
    }
    .room-head p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
    .tabs {
      display: flex; gap: 2px; padding: 0 10px;
      border-bottom: 1px solid rgba(26, 25, 23, 0.07); flex-shrink: 0; background: var(--white);
    }
    .tab { padding: 10px 12px; font-size: 11px; color: var(--muted); border-bottom: 2px solid transparent; }
    .tab.on { color: var(--navy); border-bottom-color: var(--navy); font-weight: 600; }
    .thread {
      flex: 1; min-height: 0; overflow: auto; padding: 12px 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .msg {
      max-width: 78%; padding: 10px 12px; border-radius: 14px;
      font-size: 12px; line-height: 1.4;
    }
    .msg.them { background: var(--white); border: 1px solid var(--border); align-self: flex-start; }
    .msg.me { background: var(--navy); color: #fff; align-self: flex-end; }
    .composer {
      flex-shrink: 0; padding: 10px 16px 12px; background: var(--white);
      border-top: 1px solid rgba(26, 25, 23, 0.07);
      display: flex; gap: 8px; align-items: center;
    }
    .composer input {
      flex: 1; border: 1px solid var(--navy-line); background: rgba(29, 58, 87, 0.06);
      border-radius: 999px; padding: 10px 14px; font-size: 12px; font-family: inherit; outline: none;
    }
    .composer.green-theme input {
      border-color: var(--green-line); background: var(--green-bg);
    }
    .send {
      width: 40px; height: 40px; border-radius: 50%; border: none; color: #fff; font-size: 14px;
    }
    .send.navy { background: var(--navy); }
    .send.green { background: var(--green); }
    .clear-note {
      position: absolute; left: 12px; right: 12px; bottom: calc(var(--bar-h) + 6px);
      text-align: center; font-size: 9px; letter-spacing: 0.3px;
      background: rgba(255, 255, 255, 0.9); border-radius: 8px; padding: 6px;
      border: 1px dashed currentColor; pointer-events: none; opacity: 0; transition: opacity 0.2s;
    }
    .clear-note.show { opacity: 1; }
    .clear-note.g { color: var(--green); border-color: var(--green-line); }
    .clear-note.n { color: var(--navy); border-color: var(--navy-line); }
    .screen { display: none; height: 100%; flex-direction: column; }
    .screen.active { display: flex; }
    .agent-msgs {
      flex: 1; min-height: 0; overflow: auto; padding: 12px 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .msg.ai {
      background: var(--white); border: 1px solid var(--border); align-self: stretch; max-width: 100%;
    }
    .callout {
      max-width: 720px; background: var(--white); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px 14px; font-size: 12px; line-height: 1.45;
    }
  </style>
</head>
<body>
  <h1>LAED — after plan execution</h1>
  <p class="lead">
    <strong>Green</strong> = private overview / Agent / Capture.
    <strong>Navy</strong> = shared project interiors (room, threads, in-project canvas).
    Bottom bar sits in reserved space — composers stay fully usable.
  </p>
  <div class="legend">
    <span><i class="swatch green"></i> Private green</span>
    <span><i class="swatch navy"></i> Project navy</span>
  </div>
  <div class="controls" id="tabs">
    <button type="button" data-screen="overview" class="active">1 · Overview canvas</button>
    <button type="button" data-screen="agent">2 · Agent</button>
    <button type="button" data-screen="proj-canvas">3 · Project canvas</button>
    <button type="button" data-screen="room">4 · Project room</button>
  </div>
  <div class="caption" id="caption">Overview · green chrome · input clearance</div>

  <div class="phone" id="phone">
    <!-- 1 Overview -->
    <div class="screen active" data-id="overview">
      <header class="appbar green">
        <div><span class="brand">LAED</span> | <span class="sec">Projects</span></div>
        <div class="menu"><i></i><i></i><i></i></div>
      </header>
      <div class="body">
        <div class="toolbar">
          <span class="nav">List</span>
          <span class="nav on">Canvas</span>
          <span class="info" data-tip="Drag projects · filter by tags">i</span>
          <span class="nav">Manage</span>
          <span class="nav link-green">+ New</span>
        </div>
        <div class="tools">
          <span class="label">Projects</span>
          <button type="button" class="btn green">+ New</button>
          <button type="button" class="btn outline on-green">Group by tags</button>
        </div>
        <div class="chips">
          <button type="button" class="chip">All</button>
          <button type="button" class="chip">LAED feature</button>
          <button type="button" class="chip on-green">product ideas</button>
        </div>
        <div class="stage">
          <div class="bubble">
            <div class="name">A2A-as-a-Service</div>
            <div class="kind">Project</div>
            <span class="avatar green a">F</span>
            <span class="avatar green b">C</span>
          </div>
          <div class="clear-note g show">Content ends above bottom bar</div>
        </div>
      </div>
      <nav class="bottombar green">
        <div class="fab g-idle">Agent</div>
        <div class="fab g-on">Cap</div>
      </nav>
    </div>

    <!-- 2 Agent -->
    <div class="screen" data-id="agent">
      <header class="appbar green">
        <div><span class="brand">LAED</span> | <span class="sec">Agent</span></div>
        <div class="menu"><i></i><i></i><i></i></div>
      </header>
      <div class="body">
        <div class="agent-msgs">
          <div class="msg them" style="align-self:flex-end;background:var(--green);color:#fff;border:none;">Summarize my private captures</div>
          <div class="msg ai">Here is a short summary of your private library…</div>
        </div>
        <div class="composer green-theme">
          <input type="text" value="Ask or dictate…" readonly />
          <button type="button" class="send green">↑</button>
        </div>
      </div>
      <nav class="bottombar green">
        <div class="fab g-on">Agent</div>
        <div class="fab g-idle">Cap</div>
      </nav>
    </div>

    <!-- 3 Project canvas -->
    <div class="screen" data-id="proj-canvas">
      <header class="appbar navy">
        <div><span class="brand">LAED</span> | <span class="sec">A2A</span></div>
        <div class="menu"><i></i><i></i><i></i></div>
      </header>
      <div class="body">
        <div class="tools">
          <span class="label">Topics</span>
          <button type="button" class="btn navy">+ Topic</button>
        </div>
        <div class="stage">
          <div class="bubble" style="width:120px;height:120px;top:36%;left:28%;transform:none;">
            <div class="name">Intake</div>
            <div class="kind">Topic</div>
          </div>
          <div class="bubble" style="width:120px;height:120px;top:55%;left:48%;transform:none;">
            <div class="name">Delivery</div>
            <div class="kind">Topic</div>
            <span class="avatar navy a">F</span>
          </div>
          <div class="clear-note n show">In-project canvas · navy chrome</div>
        </div>
      </div>
      <nav class="bottombar navy">
        <div class="fab n-on">Agent</div>
        <div class="fab n-idle">Cap</div>
      </nav>
    </div>

    <!-- 4 Room -->
    <div class="screen" data-id="room">
      <header class="appbar navy">
        <div><span class="brand">LAED</span> | <span class="sec">A2A</span></div>
        <div class="menu"><i></i><i></i><i></i></div>
      </header>
      <div class="body">
        <div class="room-head">
          <h2>A2A-as-a-Service</h2>
          <p>Joint · 2 partners</p>
        </div>
        <div class="tabs">
          <span class="tab on">Thread</span>
          <span class="tab">Agent</span>
          <span class="tab">Files</span>
          <span class="tab">Members</span>
        </div>
        <div class="thread">
          <div class="msg them">Can we lock scope for the pilot?</div>
          <div class="msg me">Yes — draft in Files, keep private until release.</div>
        </div>
        <div class="composer">
          <input type="text" value="Type a message…" readonly />
          <button type="button" class="send navy">↑</button>
        </div>
      </div>
      <nav class="bottombar navy">
        <div class="fab n-idle">Agent</div>
        <div class="fab n-idle">Cap</div>
      </nav>
    </div>
  </div>

  <div class="callout">
    <strong>Review checklist</strong><br />
    1–2: green app bar, green CTAs/chips/FABs, Agent input fully above the bar.<br />
    3–4: navy app bar / tabs / send / FABs; room composer fully above the bar.<br />
    Hover the <strong>i</strong> on screen 1 for tip-only help.
  </div>

  <script>
    const labels = {
      overview: "Overview · green · bar clearance",
      agent: "Agent · green · composer above bar",
      "proj-canvas": "In-project canvas · navy",
      room: "Project room · navy · composer above bar",
    };
    document.getElementById("tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-screen]");
      if (!btn) return;
      document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b === btn));
      const id = btn.getAttribute("data-screen");
      document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.getAttribute("data-id") === id));
      document.getElementById("caption").textContent = labels[id] || "";
    });
  </script>
</body>
</html>
<!-- MOCKUP_HTML_END -->
