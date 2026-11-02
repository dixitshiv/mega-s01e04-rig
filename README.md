# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and a
morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

The status board is at `/`; open `/digest/2026-10-28` for a night's digest or
`/api/digest/2026-10-28` for its JSON response. Replace the date with a night in `runs/`.

Working on it with an agent: start at [AGENTS.md](AGENTS.md).
