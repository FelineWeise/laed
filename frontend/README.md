# Frontend (Placeholder)

This directory is a placeholder for the web frontend. The intended stack is
**Next.js + PWA**, serving both desktop browsers and mobile devices from a
single codebase (no native app builds required).

## Initialize

```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

## Integrate with the stack

1. Uncomment the `frontend` service in `docker-compose.yml`
2. Swap the Caddy catch-all route in `Caddyfile` from `app:8000` to `frontend:3000`
3. Build and run: `docker compose up -d --build frontend`

## Registry image

For production, build and push to the Scaleway Container Registry:

```bash
docker build --platform linux/amd64 -t rg.fr-par.scw.cloud/<project>/frontend:latest ./frontend
docker push rg.fr-par.scw.cloud/<project>/frontend:latest
```

Then switch the compose service from `build: ./frontend` to
`image: rg.fr-par.scw.cloud/<project>/frontend:latest`.

## Reference

See `docs/LAED_Sprint_Guide_v2.md`, section 16 (Day 9-10: Frontend + PWA)
for the full implementation plan including PWA manifest, service worker, and
page structure.
