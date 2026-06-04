# LAED — App UI Kit

A high-fidelity, interactive recreation of the **LAED mobile app** (iOS-first, 390×844). Open `index.html` for a clickable prototype; the rail at the top jumps between the core screens, but the screens are also wired to each other so you can navigate naturally (tap a cluster → drill in → open a room → record, etc).

These are **cosmetic recreations**, not production logic — faithful to the source export's layout, spacing, type and color, with the rust/orange accent retired in favour of **navy + green** per brand direction.

## Run
Open `index.html`. It loads React 18 + Babel from CDN and the JSX components below. The phone auto-scales to fit the viewport.

## Components

| File | Exports | Notes |
|---|---|---|
| `icons.jsx` | `Mic`, `Phone`, `Camera`, `MenuBars`, `Grid`, `Artifact`, `Archive`, `Person`, `Gear`, `SignalWifiBattery` | Real SVG geometry from the export; `currentColor`-driven. |
| `PhoneShell.jsx` | `PhoneShell`, `StatusBar`, `AppBar` | Device bezel + status bar + top app bar (breadcrumb left, kebab right). |
| `Canvas.jsx` | `Canvas`, `SubCanvas`, `BottomBar`, `Dropdown`, `GridBg`, `ZoomPill` | Home canvas with cluster discs on a 40px grid; the Shoreditch radial drill-in; mic·call·camera bottom bar; kebab dropdown menu. |
| `AIVoice.jsx` | `AIVoice`, `ContextChip`, `AIBubble`, `UserBubble` | Tap-to-talk assistant scoped to context chips; navy live-dot. |
| `Recording.jsx` | `Recording`, `Tag` | Live transcript (fresh words in navy), waveform, manual + AI-suggested tags, navy record dot with halo. |
| `Room.jsx` | `Room`, `RoomHeader`, `RoomTabs`, `Thread`, `Files`, `AIMemory`, `Settle`, `Bubble` | Per-relationship workspace with four tabs. Thread is interactive (type + Send appends a message). |

## Screens covered
1. **Canvas** — cluster map (home).
2. **Canvas + menu** — kebab dropdown overlay.
3. **Shoreditch drill-in** — radial subcategories.
4. **AI Voice** — assistant conversation.
5. **Recording** — live transcript + tagging.
6. **Room · Thread / Files / AI / Settle** — the four workspace tabs.

## Conventions
- All components are scoped to `window` (Babel scripts don't share module scope) — see the `Object.assign(window, …)` at the bottom of each file.
- Styling reads design tokens from `../../colors_and_type.css` (CSS custom properties). Keep new components on those tokens.
- Two keyframes (`laedpulse`, `laedwave`) live in `index.html`; both respect `prefers-reduced-motion`.
