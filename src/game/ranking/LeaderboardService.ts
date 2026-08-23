import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RunSummary } from '../simulation/state';

export type StudentProfile = { school: string; grade: number; classNo: number; studentNo: number };
export type RankingEntry = StudentProfile & {
  id: string; rank: number; score: number; round: number; bestCombo: number; createdAt: string;
};
export type RankingResult = { entries: RankingEntry[]; currentRank: number; currentRunId: string; remote: boolean };

const PROFILE_KEY = 'moon-arcade-recent-profile-v1';
const LOCAL_RANKING_KEY = 'moon-arcade-local-ranking-v1';

export class LeaderboardService {
  private readonly client: SupabaseClient | null;
  private runId = '';
  private seed = Date.now();
  private remoteRun = false;

  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL?.trim();
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
    this.client = url && key ? createClient(url, key) : null;
  }

  get connected(): boolean { return Boolean(this.client); }
  get runSeed(): number { return this.seed; }

  loadRecentProfile(): StudentProfile | null {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as StudentProfile | null; }
    catch { return null; }
  }

  saveRecentProfile(profile: StudentProfile): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  clearRecentProfile(): void { localStorage.removeItem(PROFILE_KEY); }

  async startRun(profile: StudentProfile): Promise<number> {
    this.saveRecentProfile(profile);
    this.runId = crypto.randomUUID();
    this.seed = crypto.getRandomValues(new Uint32Array(1))[0];
    this.remoteRun = false;
    if (!this.client) return this.seed;
    try {
      const { error: authError } = await this.ensureAuth();
      if (authError) throw authError;
      const { data, error } = await this.client.functions.invoke('start-run', { body: profile });
      if (error || !data?.runId) throw error ?? new Error('게임 세션을 만들지 못했습니다.');
      this.runId = data.runId;
      this.seed = Number(data.seed) || this.seed;
      this.remoteRun = true;
    } catch (error) {
      console.warn('Supabase start-run unavailable; using local ranking.', error);
    }
    return this.seed;
  }

  async submit(profile: StudentProfile, summary: RunSummary): Promise<RankingResult> {
    if (this.client && this.remoteRun) {
      try {
        const { data, error } = await this.client.functions.invoke('submit-score', {
          body: { runId: this.runId, ...summary },
        });
        if (error || !data?.entries) throw error ?? new Error('랭킹을 불러오지 못했습니다.');
        return { entries: data.entries, currentRank: data.currentRank, currentRunId: data.currentRunId, remote: true };
      } catch (error) {
        console.warn('Supabase score submission unavailable; using local ranking.', error);
      }
    }
    return this.submitLocal(profile, summary);
  }

  private async ensureAuth() {
    const existing = await this.client!.auth.getSession();
    if (existing.data.session) return { error: null };
    return this.client!.auth.signInAnonymously();
  }

  private submitLocal(profile: StudentProfile, summary: RunSummary): RankingResult {
    const record = {
      id: this.runId, ...profile, score: summary.score, round: summary.round,
      bestCombo: summary.bestCombo, durationMs: summary.durationMs, createdAt: new Date().toISOString(),
    };
    let records: Array<typeof record> = [];
    try { records = JSON.parse(localStorage.getItem(LOCAL_RANKING_KEY) ?? '[]'); } catch { records = []; }
    records.push(record);
    records.sort((a, b) => b.score - a.score || b.round - a.round || a.durationMs - b.durationMs || a.createdAt.localeCompare(b.createdAt));
    localStorage.setItem(LOCAL_RANKING_KEY, JSON.stringify(records.slice(0, 500)));
    const currentRank = records.findIndex((entry) => entry.id === this.runId) + 1;
    const entries = records.slice(0, 100).map((entry, index) => ({ ...entry, rank: index + 1 }));
    return { entries, currentRank, currentRunId: this.runId, remote: false };
  }
}
