# The Red Earl

*A keep-management strategy game played entirely through meetings and paperwork.*

You are Richard de Burgh, 2nd Earl of Ulster, in the year 1300. You never see the map. An
authoritative simulation runs the world in the background; everything you learn arrives through
your officers — their counsel, their reports, their receipts. Some of it is even true. Someone
on your council is stealing from you, and the proof is in the paperwork, if you can be bothered
to read it instead of going hawking.

Meetings are free-form natural language: ask anything, order anything, promise anything, accuse
anyone. An adjudication layer turns what you said into real mechanical consequences.

See **[docs/design.md](docs/design.md)** for the full design — the pillars (the LLM never owns
state; epistemics are the game; knowledge scoping is structural), the architecture, and the
roadmap.

## Quick start

```bash
npm install
npm run build        # build the web UI
npm start            # serve the game on http://localhost:8787
```

Without an `ANTHROPIC_API_KEY`, the game runs on a deterministic scripted fake — fully playable
for testing the loop, if a little wooden in conversation. For the real thing:

```bash
ANTHROPIC_API_KEY=sk-... npm start
```

For development (API server + Vite with hot reload on http://localhost:5173):

```bash
npm run dev
```

## How to play

- **Three time slots a month.** Meetings, studying the rolls, or leisure (hawking, hunting,
  feasting — prestige and goodwill, but nobody watches the receiver while you hawk).
- **Summon your council** and talk to them. Orders you give are read back for confirmation at
  the end of each audience.
- **Study the rolls** to unlock line-pinning in the archive. Pin two figures that should agree
  and don't, and you have evidence.
- **Accuse someone in a meeting** when you think you can prove it. Thin proof will not survive
  the hall.
- **The year ends in December** when the Dublin exchequer audits the accounts — one way or
  another, you'll learn what was actually happening all along.

## Repository layout

```
packages/engine/          deterministic sim kernel + epistemics (no LLM imports)
packages/llm/             Actor / Adjudicator / Scribe / DM orchestration (live + fake)
packages/content-ulster/  the Ulster 1300 content pack
packages/server/          Fastify session server, SSE streaming, JSON saves
packages/web/             React UI: the court, the archive, the evidence board
docs/design.md            the design document
```

```bash
npm test         # engine, llm, and full E2E bot playthroughs (no API key needed)
npm run typecheck
```
