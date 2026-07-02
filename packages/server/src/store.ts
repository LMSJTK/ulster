import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState } from '@redearl/engine';

/**
 * Saves are plain JSON of the whole GameState — the journal is the
 * event-sourced record, so a save is also a full replay/debug artifact.
 * Ground truth lives only here and in memory; it never crosses the wire.
 */
export class GameStore {
  private games = new Map<string, GameState>();

  constructor(private dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
  }

  private fileOf(id: string): string {
    return join(this.dataDir, `${id.replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
  }

  get(id: string): GameState | undefined {
    const cached = this.games.get(id);
    if (cached) return cached;
    const file = this.fileOf(id);
    if (!existsSync(file)) return undefined;
    const state = JSON.parse(readFileSync(file, 'utf8')) as GameState;
    this.games.set(id, state);
    return state;
  }

  save(state: GameState): void {
    this.games.set(state.id, state);
    writeFileSync(this.fileOf(state.id), JSON.stringify(state));
  }
}
