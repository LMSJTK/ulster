import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ulster1300 } from '@redearl/content-ulster';
import { createOrchestrator } from '@redearl/llm';
import { buildApp } from './app.js';

const here = dirname(fileURLToPath(import.meta.url));
const webDist = join(here, '../../web/dist');
const orchestrator = createOrchestrator();

const app = buildApp({
  orchestrator,
  content: ulster1300,
  dataDir: join(here, '../data/games'),
  staticRoot: existsSync(webDist) ? webDist : undefined,
});

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`The Red Earl — server on http://localhost:${port}`);
  console.log(orchestrator.live
    ? 'LLM: live (Anthropic API)'
    : 'LLM: offline deterministic fake (set ANTHROPIC_API_KEY for the real thing)');
});
