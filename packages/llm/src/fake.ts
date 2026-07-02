import type {
  AccusationResult, Action, ActorContext, AdjudicateContext, Adjudication, ChatMsg,
  ContentPack, DecisionItem, DecisionResult, GameDocument, TickResult,
} from '@redearl/engine';
import { fmtMoney, renderDocumentPlain } from '@redearl/engine';
import type { Orchestrator } from './types.js';

/**
 * Deterministic scripted orchestrator. Keyword-driven and dull, but it plays
 * the whole game offline: dev without a key, CI, and the fallback path when
 * live output fails validation. It honors the same knowledge-scoping
 * contract as the live one — it only reads what is in the given context.
 */
export class FakeOrchestrator implements Orchestrator {
  readonly live = false;

  async actorReply(
    ctx: ActorContext, transcript: ChatMsg[], _content: ContentPack,
    onToken?: (t: string) => void,
  ): Promise<string> {
    const lastPlayer = [...transcript].reverse().find((m) => m.role === 'player')?.text ?? '';
    const q = lastPlayer.toLowerCase();
    const isSchemer = ctx.agendaDirectives.length > 0;
    let reply: string;

    if (transcript.length === 0) {
      reply = `You sent for me, ${ctx.playerTitle}? ${ctx.smallTalk[0] ?? ''}`.trim();
    } else if (isSchemer && /confess|thief|stole|steal|skim|embezzl/.test(q)) {
      reply =
        `${ctx.playerTitle[0].toUpperCase()}${ctx.playerTitle.slice(1)}, I have served this house nine years ` +
        'with a clean pen. If someone has poured poison in your ear, let them show a single tally against me.';
    } else if (isSchemer && /receipt|roll|tall|account|figure|revenue|money/.test(q)) {
      reply =
        'The rolls are honest work, my lord, if lean — the season runs against us, and what the weather ' +
        'spares, the Irish and the roads take. There is nothing in the sums to trouble you.';
    } else if (/receipt|tall|record|roll|account/.test(q)) {
      reply = 'I shall see it done, my lord — the tallies will be brought to you as you command.';
    } else {
      // A direct question can touch a guarded confidence: quote it if any
      // keyword of the belief appears in the question.
      const guarded = ctx.beliefs.find(
        (b) => b.sensitivity === 'guarded' && beliefTouched(b.text, q),
      );
      if (guarded) {
        reply = `Since you ask it of me plainly, my lord: ${guarded.text}`;
      } else {
        const open = ctx.beliefs.filter((b) => b.sensitivity === 'open');
        const idx = transcript.length % Math.max(1, ctx.smallTalk.length);
        const extra = open.length > 0 ? ` ${open[transcript.length % open.length].text}` : '';
        reply = `${ctx.smallTalk[idx] ?? 'As you say, my lord.'}${extra}`;
      }
    }

    if (onToken) {
      for (const word of reply.split(/(?<=\s)/)) onToken(word);
    }
    return reply;
  }

  async adjudicate(
    ctx: AdjudicateContext, transcript: ChatMsg[], _content: ContentPack,
  ): Promise<Adjudication> {
    const playerText = transcript.filter((m) => m.role === 'player').map((m) => m.text).join('\n');
    const npcText = transcript.filter((m) => m.role === 'npc').map((m) => m.text).join('\n');
    const q = playerText.toLowerCase();
    const actions: Action[] = [];

    if (/\baudit\b|true tall|ride the manors|inquiry into the receipts/.test(q)) {
      actions.push({ type: 'order_audit' });
    }
    if (/receipt|tall(y|ies)/.test(q) && !/\baudit\b/.test(q)) {
      const named = ctx.holdings.filter((h) => q.includes(h.name.toLowerCase()));
      const wanted = /\b(?:all|every)\b/.test(q) && named.length === 0 ? ctx.holdings : named;
      for (const h of wanted.slice(0, 5)) {
        actions.push({ type: 'request_document', docKind: 'bailiff_receipts', holdingId: h.id });
      }
    }
    if (/accuse|arrest|charge|put .* to the question|thief|stolen|stole/.test(q)) {
      const accused = ctx.council.find((c) => q.includes(firstName(c.name).toLowerCase()));
      if (accused) {
        actions.push({
          type: 'accuse',
          accusedId: accused.id,
          citedEvidence: ctx.surfacedEvidence.map((e) => e.id),
        });
      }
    }
    const garrison = /(?:send|move)\s+(\d+)\s+(?:spears|men)[^.]*?\b(?:to)\b/.exec(q);
    if (garrison) {
      const target = ctx.holdings.find((h) => q.includes(h.name.toLowerCase()));
      if (target) {
        actions.push({
          type: 'adjust_garrison',
          holdingId: target.id,
          delta: Math.min(20, Number(garrison[1])),
        });
      }
    }
    const grant = /(?:grant|gift|give|reward)[^.]*?(\d+)\s*(?:shilling|s\b)/.exec(q);
    if (grant) {
      actions.push({
        type: 'grant',
        personId: ctx.actorId,
        amount: Math.min(400, Math.max(1, Number(grant[1]))),
      });
    }

    const disclosedBeliefs = ctx.candidateBeliefs
      .filter((b) => npcText.includes(stem(b.text)))
      .map((b) => b.id);

    let tone = 0;
    if (/thank|well done|good work|trust you|friend/.test(q)) tone = 1;
    if (/fool|dog|wretch|worthless|damn/.test(q)) tone = -1;
    if (/irons|dungeon|hang|flog/.test(q)) tone = -2;

    return {
      actions,
      disclosedBeliefs,
      tone,
      summary:
        `The earl met with ${ctx.actorName}` +
        (actions.length > 0 ? ` and gave ${actions.length} order${actions.length > 1 ? 's' : ''}.` : '.'),
    };
  }

  async renderDocument(doc: GameDocument, content: ContentPack): Promise<string> {
    return renderDocumentPlain(doc, content);
  }

  async renderBriefing(briefing: TickResult['briefing'], _content: ContentPack): Promise<string> {
    const parts = [
      `${briefing.monthClosed} has closed; it is now ${briefing.newMonth}.`,
      `The treasury stands at ${briefing.treasuryLabel}.`,
      ...briefing.notes,
    ];
    if (briefing.docTitles.length > 0) {
      parts.push(`Delivered to the archive: ${briefing.docTitles.join('; ')}.`);
    }
    return parts.join(' ');
  }

  async renderCourtScene(result: AccusationResult, _content: ContentPack): Promise<string> {
    switch (result.outcome) {
      case 'exposed':
        return (
          `You lay the proofs before the court, one atop another, and watch ${result.accusedName} ` +
          `grow pale. He falters, then kneels and confesses all. ${fmtMoney(result.recovered)} ` +
          'is recovered from his strongbox and his creditors. The hall is very quiet; every officer ' +
          'present has learned that the earl reads his rolls.'
        );
      case 'denied':
        return (
          `${result.accusedName} hears the accusation standing very straight. What you bring against him ` +
          'is whispers and coincidence, and he knows it; he answers with nine years of service and demands ' +
          'the proof. You have none that binds. The court murmurs, and the matter — for now — dies.'
        );
      case 'false':
        return (
          `${result.accusedName} stares as though struck. There is no proof because there is nothing to ` +
          'prove, and every face at the board knows it. The word will travel the earldom by Sunday: the ' +
          'earl sees thieves in honest men.'
        );
    }
  }

  async decide(
    decision: DecisionItem, responseText: string, _content: ContentPack,
  ): Promise<DecisionResult> {
    const q = responseText.toLowerCase();
    let choice = 'defer';
    if (/send|muster|march|go to|serve|troops|men to/.test(q)) choice = 'send_troops';
    else if (/pay|fine|scutage|coin/.test(q)) choice = 'pay_fine';
    else if (/refuse|deny|ignore|no\b|will not/.test(q)) choice = 'refuse';
    if (!decision.options.some((o) => o.id === choice) && choice !== 'defer') choice = 'defer';
    return { choice, note: `The earl's answer is carried out: ${responseText}` };
  }
}

function firstName(full: string): string {
  const parts = full.split(' ');
  // 'Sir Thomas de Mandeville' -> 'Thomas'; 'Master Nicholas of Downpatrick' -> 'Nicholas'
  if (['sir', 'master', 'brother', 'lady', 'dame'].includes(parts[0]?.toLowerCase())) {
    return parts[1] ?? parts[0];
  }
  return parts[0];
}

/** A distinctive prefix of a belief, for detecting verbatim disclosure. */
function stem(text: string): string {
  return text.split(' ').slice(0, 5).join(' ');
}

function beliefTouched(belief: string, question: string): boolean {
  const keywords = belief
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5);
  return keywords.some((w) => question.includes(w));
}
