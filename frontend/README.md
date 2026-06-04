# LAED Frontend (v2)

Next.js 15 PWA with navy/paper/green UI kit. Routes: auth, global topology canvas, project canvas, room (thread/files/insights), AI voice, record.

## Scripts

```bash
npm install
npm run dev    # http://localhost:3000
npm run build
npm run start
```

## Demo login

When the backend has `LAED_DEMO_EMAIL` / `LAED_DEMO_PASSWORD` set (see `laed/.env.example`), the app ensures that user on startup. Sign in at `/login` with those credentials, or set `NEXT_PUBLIC_DEMO_EMAIL` at build time to show “Use demo email” on the login form.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE` | `""` | API prefix when frontend and API are on different origins |
| `NEXT_PUBLIC_DEMO_EMAIL` | `""` | Optional login hint (email only, not password) |

## Design reference

Kit source (read-only): `design-reference/laed-app/`. Tokens: `src/styles/tokens.css`.

## Docker

Local compose (builds from `./frontend`):

```bash
cd .. && docker compose up -d --build frontend caddy
```

Production push (Scaleway CR, from `laed/` repo root):

```bash
./scripts/push_frontend_to_scaleway_registry.sh
# Or with backend: ./scripts/push_laed_images.sh
```

Set `LAED_FRONTEND_IMAGE` in server `.env` to the tag/digest printed by the push script.

## Forgot password

`/forgot-password` explains that self-service reset is not enabled; contact an administrator.
