import Anthropic from '@anthropic-ai/sdk';
import { FakeOrchestrator } from './fake.js';
import { DEFAULT_MODELS, LiveOrchestrator } from './live.js';
import type { Orchestrator } from './types.js';

export * from './types.js';
export * from './fake.js';
export * from './live.js';
export * from './prompts.js';

/**
 * Live if ANTHROPIC_API_KEY is set, deterministic fake otherwise — dev and CI
 * never require a key.
 */
export function createOrchestrator(): Orchestrator {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    return new LiveOrchestrator(new Anthropic({ apiKey }), DEFAULT_MODELS);
  }
  return new FakeOrchestrator();
}
