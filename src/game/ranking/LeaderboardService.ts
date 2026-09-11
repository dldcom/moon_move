import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const MOON_MOVE_GAME_ID = 'moon-move';

export const MOON_MOVE_NICKNAMES = [
  '달토끼',
  '별가루',
  '초승달',
  '보름달',
  '우주비행사',
  '혜성',
  '밤구름',
  '은하수',
  '달빛탐험가',
  '별똥별',
  '우주고양이',
  '크레이터탐험대',
] as const;

export type PlayerProfile = { nickname: string };
export type RankingEntry = { id: string; rank: number; nickname: string; score: number };
export type RankingResult = {
  entries: RankingEntry[];
  currentRank: number;
  currentRunId: string;
  remote: boolean;
};

type LocalScore = { id: string; nickname: string; score: number };

const PROFILE_KEY = 'moon-arcade-recent-nickname-v1';
const LOCAL_RANKING_KEY = 'moon-arcade-local-ranking-v2';

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

  loadRecentProfile(): PlayerProfile | null {
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<PlayerProfile> | null;
      return value?.nickname && isAllowedNickname(value.nickname) ? { nickname: value.nickname } : null;
    } catch {
      return null;
    }
  }

  saveRecentProfile(profile: PlayerProfile): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  clearRecentProfile(): void { localStorage.removeItem(PROFILE_KEY); }

  async startRun(profile: PlayerProfile): Promise<number> {
    this.saveRecentProfile(profile);
    this.runId = crypto.randomUUID();
    this.seed = crypto.getRandomValues(new Uint32Array(1))[0];
    this.remoteRun = false;
    if (this.client) {
      try {
        const { error } = await this.ensureAuth();
        if (error) throw error;
        this.remoteRun = true;
      } catch (error) {
        console.warn('Supabase authentication unavailable; using local ranking.', error);
      }
    }
    return this.seed;
  }

  async submit(profile: PlayerProfile, score: number): Promise<RankingResult> {
    if (this.client && this.remoteRun) {
      try {
        const { data, error } = await this.client.functions.invoke('submit-score', {
          body: {
            gameId: MOON_MOVE_GAME_ID,
            roomId: null,
            nickname: profile.nickname,
            score,
          },
        });
        if (error || !data?.entries) throw error ?? new Error('점수를 등록하지 못했어요.');
        return {
          entries: data.entries as RankingEntry[],
          currentRank: Number(data.currentRank),
          currentRunId: String(data.currentRunId),
          remote: true,
        };
      } catch (error) {
        console.warn('Supabase score submission unavailable; using local ranking.', error);
      }
    }
    return this.submitLocal(profile, score);
  }

  private async ensureAuth() {
    const existing = await this.client!.auth.getSession();
    if (existing.data.session) return { error: null };
    return this.client!.auth.signInAnonymously();
  }

  private submitLocal(profile: PlayerProfile, score: number): RankingResult {
    const record: LocalScore = {
      id: this.runId,
      nickname: profile.nickname,
      score: Math.max(0, Math.trunc(score)),
    };
    let records: LocalScore[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(LOCAL_RANKING_KEY) ?? '[]') as unknown;
      records = Array.isArray(stored) ? stored.filter(isLocalScore) : [];
    } catch {
      records = [];
    }
    records.push(record);
    records.sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, 'ko') || a.id.localeCompare(b.id));
    records = records.slice(0, 500);
    localStorage.setItem(LOCAL_RANKING_KEY, JSON.stringify(records));

    const rankFor = (entry: LocalScore): number => records.filter((candidate) => candidate.score > entry.score).length + 1;
    const entries = records.slice(0, 10).map((entry) => ({ ...entry, rank: rankFor(entry) }));
    return {
      entries,
      currentRank: rankFor(record),
      currentRunId: this.runId,
      remote: false,
    };
  }
}

function isAllowedNickname(value: string): boolean {
  return (MOON_MOVE_NICKNAMES as readonly string[]).includes(value);
}

function isLocalScore(value: unknown): value is LocalScore {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LocalScore>;
  return typeof entry.id === 'string'
    && typeof entry.nickname === 'string'
    && isAllowedNickname(entry.nickname)
    && typeof entry.score === 'number'
    && Number.isFinite(entry.score);
}
