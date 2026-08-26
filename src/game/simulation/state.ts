export type MoonPhase = 'waxing-crescent' | 'first-quarter' | 'full-moon' | 'last-quarter' | 'waning-crescent';

export const MOON_PHASES: ReadonlyArray<{ key: MoonPhase; name: string; sprite: string; hurtSprite: string }> = [
  { key: 'waxing-crescent', name: '초승달', sprite: 'moon-waxing-crescent', hurtSprite: 'moon-waxing-crescent-hurt' },
  { key: 'first-quarter', name: '상현달', sprite: 'moon-first-quarter', hurtSprite: 'moon-first-quarter-hurt' },
  { key: 'full-moon', name: '보름달', sprite: 'moon-full-moon', hurtSprite: 'moon-full-moon-hurt' },
  { key: 'last-quarter', name: '하현달', sprite: 'moon-last-quarter', hurtSprite: 'moon-last-quarter-hurt' },
  { key: 'waning-crescent', name: '그믐달', sprite: 'moon-waning-crescent', hurtSprite: 'moon-waning-crescent-hurt' },
];

const FORBIDDEN_DUAL_PAIRS = new Set([
  ['waxing-crescent', 'waning-crescent'].sort().join(':'),
  ['first-quarter', 'last-quarter'].sort().join(':'),
]);

export type SelectionResult = { correct: boolean; gameOver: boolean; gainedScore: number; gainedLife: boolean };
export type RunSummary = {
  score: number; round: number; stageIndex: number; correctHits: number;
  wrongHits: number; missedTargets: number; bestCombo: number; durationMs: number;
};

export class ArcadeState {
  readonly stageDuration = 18;
  readonly maxHp = 3;
  readonly lifeChance = 0.01;
  hp = this.maxHp;
  score = 0;
  combo = 0;
  bestCombo = 0;
  stageIndex = 0;
  round = 1;
  stageElapsed = 0;
  gameOver = false;
  correctHits = 0;
  wrongHits = 0;
  missedTargets = 0;
  targets: MoonPhase[] = [MOON_PHASES[0].key];
  private startedAt = performance.now();
  private random = mulberry32(1);

  get target() { return MOON_PHASES.find((phase) => phase.key === this.targets[0])!; }
  get targetInfos() { return this.targets.map((key) => MOON_PHASES.find((phase) => phase.key === key)!); }
  isTarget(phase: MoonPhase): boolean { return this.targets.includes(phase); }

  reset(seed = Date.now()): void {
    this.hp = this.maxHp;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.stageIndex = 0;
    this.round = 1;
    this.stageElapsed = 0;
    this.gameOver = false;
    this.correctHits = 0;
    this.wrongHits = 0;
    this.missedTargets = 0;
    this.random = mulberry32(seed);
    this.startedAt = performance.now();
    this.targets = [MOON_PHASES[0].key];
  }

  update(deltaSeconds: number): boolean {
    if (this.gameOver) return false;
    this.stageElapsed += deltaSeconds;
    if (this.stageElapsed < this.stageDuration) return false;
    this.stageElapsed %= this.stageDuration;
    this.advanceStage();
    return true;
  }

  select(phase: MoonPhase): SelectionResult {
    if (this.gameOver) return { correct: false, gameOver: true, gainedScore: 0, gainedLife: false };
    if (this.isTarget(phase)) {
      this.correctHits += 1;
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const multiplier = Math.min(5, 1 + Math.floor((this.combo - 1) / 3));
      const gainedScore = 100 * multiplier;
      this.score += gainedScore;
      const gainedLife = this.hp < this.maxHp && this.random() < this.lifeChance;
      if (gainedLife) this.hp += 1;
      return { correct: true, gameOver: false, gainedScore, gainedLife };
    }
    this.wrongHits += 1;
    this.combo = 0;
    this.hp = Math.max(0, this.hp - 1);
    this.gameOver = this.hp === 0;
    return { correct: false, gameOver: this.gameOver, gainedScore: 0, gainedLife: false };
  }

  miss(phase: MoonPhase): boolean {
    if (this.gameOver || !this.isTarget(phase)) return false;
    this.missedTargets += 1;
    this.combo = 0;
    return true;
  }

  summary(): RunSummary {
    return {
      score: this.score, round: this.round, stageIndex: this.stageIndex,
      correctHits: this.correctHits, wrongHits: this.wrongHits,
      missedTargets: this.missedTargets, bestCombo: this.bestCombo,
      durationMs: Math.round(performance.now() - this.startedAt),
    };
  }

  private advanceStage(): void {
    this.stageIndex += 1;
    if (this.stageIndex >= MOON_PHASES.length) {
      this.stageIndex = 0;
      this.round += 1;
    }
    if (this.round === 1) this.targets = [MOON_PHASES[this.stageIndex].key];
    else if (this.round === 2) this.targets = [this.pickSingleTarget()];
    else this.targets = this.pickDualTargets();
  }

  private pickSingleTarget(): MoonPhase {
    const choices = MOON_PHASES.map((phase) => phase.key).filter((key) => key !== this.targets[0]);
    return choices[Math.floor(this.random() * choices.length)];
  }

  private pickDualTargets(): MoonPhase[] {
    const pairs: MoonPhase[][] = [];
    for (let first = 0; first < MOON_PHASES.length; first += 1) {
      for (let second = first + 1; second < MOON_PHASES.length; second += 1) {
        const pair = [MOON_PHASES[first].key, MOON_PHASES[second].key] as MoonPhase[];
        if (!FORBIDDEN_DUAL_PAIRS.has([...pair].sort().join(':'))) pairs.push(pair);
      }
    }
    return pairs[Math.floor(this.random() * pairs.length)];
  }
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
