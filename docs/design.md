# The Red Earl — Design Document

*A keep-management strategy game where you never see the map.*

**Setting (first content pack):** The Earldom of Ulster, A.D. 1300. You are Richard de Burgh,
2nd Earl of Ulster — "the Red Earl" — ruling from Carrickfergus Castle.

---

## 1. The Pitch

Civilization and Crusader Kings put you above the map, omniscient. This game locks you inside
your own keep. The world runs on an **authoritative background simulation** you cannot see,
stirred by a **hidden narrator/DM**. Everything you know arrives through intermediaries:
meetings with your officers, petitions, rumors, and paperwork — all of it filtered through the
competence, bias, and agendas of the people who bring it to you.

Your steward's ledger says Twescard rendered £11 this month. Did it? The bailiff's own receipts
— if you think to send for them — say £13. Someone is lying, and the game *knows who*, because
the lie was planted procedurally, entry by entry, on top of true numbers.

The second half of the pitch is the input side. Every strategy player has stared at an event
popup whose three options don't include the thing they actually want to do. Here, meetings are
free-form natural language. You can ask your seneschal anything, order anything, promise
anything, threaten anything — and an adjudication layer maps your intent onto real mechanical
consequences in the simulation. The dialog tree is gone; what remains is the conversation.

The player's core tension: **diligence versus delight.** You have limited attention each month.
Spend it grinding through receiver's rolls and cross-examining clerks, or go hawking, feast
your knights, and trust that the men you appointed are honest. (They are not all honest.)

---

## 2. Design Pillars

These six rules drive every architectural decision. When in doubt, return here.

### P1. The LLM never owns state
A deterministic, seeded simulation kernel holds ground truth: manor economies, garrison
strengths, NPC loyalties, active plots. LLMs *render*, *roleplay*, *extract*, and *propose*.
Every LLM output is validated against a schema and applied to the simulation as structured
data — or rejected and repaired. If the LLM invented the world, the world would be
inconsistent, unauditable, and unsavable. It doesn't.

### P2. Epistemics are the game
Ground truth vs. player belief is a first-class distinction. Every document and verbal report
is produced by a pipeline:

```
true data ──▶ distortion filter ──▶ DocumentSpec ──▶ LLM prose rendering
              (competence noise,     (fixed numbers      (period flavor
               bias, deliberate       and claims)          around the
               falsification)                              fixed facts)
```

The LLM writes prose *around* the numbers; it never invents them. So discrepancies are real,
internally consistent, and findable by cross-referencing — a diligent player is provably
rewarded.

### P3. Knowledge scoping is structural, not behavioral
An NPC's meeting prompt contains only that NPC's **knowledge view** — their beliefs, which may
themselves be wrong. We never tell a model "don't reveal the secret"; we never give it the
secret. What is not in the context cannot leak. The same rule governs report generation and
the player-facing state projection sent to the client.

### P4. Free-form intent, bounded effects
An **Adjudicator** extracts the player's orders, promises, and accusations from meeting
transcripts into a typed action schema. Intents with no matching action type become
`freeform` actions whose proposed effects are priced by the DM **under per-category magnitude
caps** enforced by the engine. Natural language in; no LLM-granted miracles out.

### P5. Mysteries are generated solution-first
The DM instantiates a plot as a structured, multi-stage plan **with a derived evidence trail**
— forged ledger entries, a witness, a lifestyle tell, a behavioral tell — distributed across
sources with appropriate distortion. The game always knows the full solution, which clues
exist, and which the player has surfaced. Detective gameplay without authored fairness is
just noise; this is how we author fairness procedurally.

### P6. Engine and content are separate
The engine knows about *principals, officers, holdings, resources, documents, events, plots* —
not about Ulster. "Ulster 1300" is the first content pack: data files and prompt text. A
"scaling a tech startup" pack would swap manors for product lines, the seneschal for a COO,
and the exchequer audit for a board meeting. Nothing in the engine should have to change.

---

## 3. Player Experience

### 3.1 The month (one turn)

Turn = one month; the vertical slice runs January–December 1300. Each month the player has
**3 action slots**:

| Action | Cost | Effect |
|---|---|---|
| Hold a meeting | 1 slot | Free-form conversation with any council member; orders extracted at the end |
| Study documents | 1 slot | Unlocks close reading of the month's paperwork (line-level pinning) |
| Leisure (hawk, feast, hunt) | 1 slot | Prestige and relationship gains; occasionally a stray rumor — courtiers talk when you're relaxed |

Ending the month advances the simulation: revenues flow, agendas advance, events fire,
documents are written and delivered, and the morning briefing arrives.

### 3.2 The information surfaces

- **The Solar (dashboard):** the date, treasury *as reported to you*, action slots, prestige,
  pending petitions, the council roster.
- **Meetings:** streaming chat with one NPC. At meeting end, the game shows you the orders it
  believes you gave and asks you to confirm — the guardrail against misextraction, diegetic
  as "the clerk reads back your instructions."
- **The Archive:** every document you have ever received, cross-referenceable. Documents have
  **line items**; the player can pin lines. Pin two lines that contradict each other and the
  discrepancy is *surfaced* — it becomes citable evidence.
- **The Briefing:** each new month opens with a digest of what your officers chose to tell you.
- **The Reveal:** at game end (any ending), the hidden ground-truth journal replays as a
  timeline: what was actually happening while you hawked.

### 3.3 The slice's mystery: the Chamberlain's Skim

Master Nicholas, your chamberlain-receiver, is skimming manor receipts — modestly at first,
then greedily. The evidence trail (planted at game start, solution-first):

1. **The numbers.** His monthly receiver's rolls understate receipts from two specific manors.
   The bailiffs' own receipts — which you must think to send for, or audit — carry the true
   figures. The rolls are *internally* consistent; only cross-document comparison exposes them.
2. **The witness.** Brother Anselm, the wardrobe clerk, has noticed Nicholas making entries
   after hours. He'll share it — if your relationship is warm, or if you ask him directly.
3. **The lifestyle tell.** Nicholas has bought a fine palfrey and silver plate. The constable
   mentions it in passing; it can also surface during leisure.
4. **The behavioral tell.** Asked about the affected manors, Nicholas deflects — his Actor
   prompt carries the agenda directive, and a perceptive player feels the evasion.

Resolutions:

- **Justice:** accuse with sufficient surfaced evidence → confession, partial recovery of the
  stolen funds, council loyalties shift (some respect, some fear).
- **False accusation:** accuse with thin evidence → he weathers it; your court's trust in you
  drops; the skim pauses, then resumes more carefully.
- **The Audit:** never catch it → in December, the Dublin exchequer's yearly audit exposes the
  shortfall — and your negligence. Reputation ending.

All three endings reach the Reveal screen.

---

## 4. Architecture

TypeScript monorepo (npm workspaces). Zod schemas are shared end-to-end: they define the
action/event/document types, validate every LLM output, and generate the JSON Schema tool
definitions handed to the model.

```
ulster/
  docs/design.md
  packages/
    engine/          # deterministic sim kernel — zero LLM imports, zero I/O
    llm/             # LLM orchestration: Actor, Adjudicator, DM, Scribe
    content-ulster/  # Ulster 1300 data + personas + prompt text
    server/          # Fastify session server, Anthropic SDK, SSE, JSON saves
    web/             # Vite + React UI
```

Dependency rule: `engine ← content-ulster`, `engine ← llm`, `engine+llm+content ← server`,
`server ← web` (via HTTP only). The engine never imports the llm package.

### 4.1 Engine (deterministic sim kernel)

- **Entities:** `Person` (traits, skills, loyalty, relationship-with-player, agenda,
  knowledge view), `Holding` (manor: base revenue, condition, bailiff), `Office`, treasury,
  documents, evidence, active plot.
- **RNG:** seeded (mulberry32). Same seed → identical year, byte for byte. LLM prose varies;
  the world does not.
- **Tick (monthly):**
  1. Manor revenues computed (base × condition × seasonal curve).
  2. Plot agendas advance — the skim is applied *between* the true receipts and the reported
     roll; both values recorded.
  3. Scheduled and random events fire (raid, murrain, storm, war summons).
  4. Player orders from confirmed meetings execute.
  5. Documents are generated through the distortion pipeline and delivered.
  6. Everything appends to the **journal** — the ground-truth, event-sourced log.
- **Saves = journal + transcripts.** Replayable, debuggable, and the Reveal screen is just a
  rendering of it.

### 4.2 Epistemics layer (inside engine)

- **KnowledgeView:** per-NPC belief set (facts with confidence, possibly false), updated by
  what each NPC would plausibly observe. This is the *only* world data an Actor prompt sees.
- **Distortion filters**, applied to true data before a `DocumentSpec` is emitted:
  - `falsify` — agenda-driven: subtract the skim from target line items, keep the document
    internally consistent (the forger is competent);
  - `noise` — competence-driven: ± error on estimates (raid damage, herd counts);
  - `slant` — bias-driven: shapes the *claims* and tone, not the numbers.
- **Discrepancies** are first-class entities computed when a falsified document is generated:
  `{docA/line, docB/line, description}`. When the player's pins cover both sides — or the
  Adjudicator detects the player citing it in a meeting — it flips to *surfaced*.

### 4.3 LLM layer

One interface, two implementations: `AnthropicClient` and `FakeLLM` (a deterministic scripted
fake). Without an API key, the whole game runs on the fake — dev and CI never require a key,
and the fake doubles as the fallback when live output fails validation twice.

| Role | Job | Runs | Model tier |
|---|---|---|---|
| **Actor** | Roleplay one NPC in a meeting. Prompt = persona + knowledge view + relationship + secret agenda directives. Streams. | per meeting message | Sonnet (council), Haiku (minor) |
| **Adjudicator** | Extract typed actions from the transcript: orders, document requests, promises, accusations, freeform intents; rate the player's tone for relationship effects. | meeting end | Haiku |
| **DM / Narrator** | Between turns: instantiate events from the weighted template library (schema-validated, must reference real entities); parameterize plots from the plot library and derive their evidence trails; adjudicate accusations against the planted trail; price freeform actions under effect caps. | end of turn / game start | Sonnet/Opus |
| **Scribe** | Render DocumentSpecs and briefings into period prose around the fixed numbers. | end of turn | Haiku/Sonnet |

Every output is schema-validated with one repair-retry, then falls back to templated
rendering. The game never wedges on a bad completion.

### 4.4 Action schema (Adjudicator output)

```ts
type Action =
  | { type: 'request_document'; docKind; holdingId?; period }
  | { type: 'order_audit'; target: HoldingId | OfficeId }      // clerk dispatched; true figures next month
  | { type: 'accuse'; accusedId; citedEvidence: EvidenceId[] }
  | { type: 'adjust_garrison'; holdingId; delta }
  | { type: 'grant'; personId; amount }                        // gifts, bribes, rewards
  | { type: 'freeform'; description; proposedEffects: BoundedEffect[] }
```

`BoundedEffect` deltas are clamped by the engine per category (treasury, loyalty,
relationship, condition, reputation). The DM proposes; the engine disposes.

### 4.5 Server and client

- **Fastify** server: create/load game, meeting start/message (SSE streaming)/end, order
  confirmation, pin/unpin, leisure, end-turn, document fetch. JSON save files per game.
- **Player-view projection:** the client only ever receives the player's epistemic state —
  reported treasury, received documents, impressions of people. Ground truth (skim amounts,
  agendas, the journal) never crosses the wire until the Reveal.
- **Web UI:** text-forward, parchment-flavored. No map. That absence is the aesthetic.

---

## 5. Fairness, Cost, and Failure

- **Fairness:** solution-first plots (P5) mean every mystery is guaranteed solvable, and the
  Reveal screen proves it to the player after the fact.
- **Cost/latency:** model tiering (hot loop on small models), knowledge views summarized, and
  meeting context kept to persona + relevant beliefs + rolling transcript summary. A full
  playthrough should cost cents, not dollars.
- **Failure:** validation + one repair-retry + template fallback at every LLM boundary;
  deterministic core means a crashed session replays from the journal.
- **Testing:** the engine is pure and unit-tested (determinism, skim arithmetic, discrepancy
  planting); LLM roles are tested against the FakeLLM and recorded fixtures; two scripted
  bot playthroughs (diligent → Justice ending; negligent → Audit ending) run end-to-end in CI
  with zero API calls.

---

## 6. Content Pack: Ulster, 1300

Real start, free divergence — the setup is authentic; history diverges from your play.

- **You:** Richard de Burgh, 2nd Earl of Ulster and Lord of Connacht, the most powerful
  magnate in Ireland, seated at Carrickfergus.
- **Council (the slice's cast):**
  - *Sir Thomas de Mandeville*, Seneschal of Ulster — old Anglo-Irish stock, competent, proud.
  - *Master Nicholas of Downpatrick*, Chamberlain-Receiver — the money passes through his hands.
  - *Sir Walter de Logan*, Constable of Carrickfergus — blunt soldier, counts spears not pence.
  - *Brother Anselm*, clerk of the wardrobe — quiet, observant, underestimated.
- **Holdings (slice):** the demesne manors — Twescard, Coleraine, Antrim, Carrickfergus,
  Greencastle, Dundonald — each with a bailiff, base revenue, and condition.
- **The world outside** (felt only through reports): Domnall Ó Néill, king of Tír Eoghain,
  restless on the marches; the Dublin administration and its exchequer; and Edward I's
  Scottish war — a summons to serve at Caerlaverock arrives mid-year, as it truly did in 1300.
- **Event templates (slice):** border cattle-raid, murrain, storm at the Coleraine fisheries,
  petitioner disputes, the war summons, the December exchequer audit.

## 7. Roadmap

- **v0 (this repo, first commit):** this document.
- **v1 — vertical slice:** everything in §3–§6. One year, one plot, three endings, playable
  in the browser, fully playable offline on the FakeLLM.
- **v2 — breadth:** multiple concurrent plots and plot archetypes (poisoning the earl's ear,
  a treasonous correspondence, a bailiff's fraud ring); marriage and diplomacy actions;
  petitioner court sessions; leisure with real mechanical identity; the Connacht estates as
  remote, badly-observed holdings.
- **v3 — the engine proves itself:** harden the engine/content boundary; ship a second, toy
  content pack (the startup sim) to force out every Ulster assumption; consider a real
  hex/point map behind the sim (still invisible — but making distances and travel times real).
- **Later:** multi-year campaigns (the Bruce invasion of 1315 as a DM masterstroke), NPC
  memory across years, reputation that travels to Dublin and Westminster.
