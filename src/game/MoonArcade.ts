import Phaser from 'phaser';
import { HUD_ASSETS } from './assets/manifest';
import { MoonGameScene } from './phaser/MoonGameScene';
import { LeaderboardService, type RankingResult, type StudentProfile } from './ranking/LeaderboardService';
import { ArcadeState } from './simulation/state';

export class MoonArcade {
  private readonly state = new ArcadeState();
  private readonly leaderboard = new LeaderboardService();
  private readonly canvasRoot = required<HTMLElement>('arcade-canvas');
  private readonly hearts = required<HTMLElement>('arcade-hearts');
  private readonly targetName = required<HTMLElement>('arcade-target-name');
  private readonly score = required<HTMLElement>('arcade-score-value');
  private readonly combo = required<HTMLElement>('arcade-combo');
  private readonly stageCard = required<HTMLElement>('arcade-stage-card');
  private readonly stageLabel = required<HTMLElement>('arcade-stage-label');
  private readonly stageName = required<HTMLElement>('arcade-stage-name');
  private readonly gameOver = required<HTMLElement>('arcade-game-over');
  private readonly finalScore = required<HTMLElement>('arcade-final-score');
  private readonly bestCombo = required<HTMLElement>('arcade-best-combo');
  private readonly retryButton = required<HTMLButtonElement>('arcade-retry');
  private readonly backButton = required<HTMLButtonElement>('arcade-back');
  private readonly rankingPanel = required<HTMLElement>('arcade-game-over');
  private readonly rankingToggleButton: HTMLButtonElement;
  private readonly reviewButton: HTMLButtonElement;
  private readonly playerGate = required<HTMLElement>('arcade-player-gate');
  private readonly playerForm = required<HTMLFormElement>('arcade-player-form');
  private readonly schoolInput = required<HTMLInputElement>('arcade-school');
  private readonly gradeInput = required<HTMLInputElement>('arcade-grade');
  private readonly classInput = required<HTMLInputElement>('arcade-class');
  private readonly studentNoInput = required<HTMLInputElement>('arcade-student-no');
  private readonly clearProfileButton = required<HTMLButtonElement>('arcade-clear-profile');
  private readonly startRunButton = required<HTMLButtonElement>('arcade-start-run');
  private readonly playerStatus = required<HTMLElement>('arcade-player-status');
  private readonly currentRank = required<HTMLElement>('arcade-current-rank');
  private readonly rankingList = required<HTMLOListElement>('arcade-ranking-list');
  private readonly rankingSource = required<HTMLElement>('arcade-ranking-source');
  private game: Phaser.Game | null = null;
  private scene: MoonGameScene | null = null;
  private profile: StudentProfile | null = null;
  private stageCardTimer = 0;
  private submitted = false;

  constructor(_shell: HTMLElement) {
    const gameOverPanel = required<HTMLElement>('arcade-retry').parentElement!;
    this.rankingToggleButton = ensureActionButton('arcade-ranking-toggle', 'TOP 100 보기', gameOverPanel);
    this.reviewButton = ensureActionButton('arcade-review-learning', '헷갈린 달 다시 알아보기', gameOverPanel);
    this.rankingToggleButton.classList.add('game-over-secondary');
    this.reviewButton.classList.add('game-over-secondary');
  }

  start(): void {
    this.playerForm.addEventListener('submit', this.beginRun);
    this.clearProfileButton.addEventListener('click', this.clearProfile);
    this.retryButton.addEventListener('click', this.retry);
    this.backButton.addEventListener('click', this.back);
    this.rankingToggleButton.addEventListener('click', this.toggleRanking);
    this.reviewButton.addEventListener('click', this.reviewLearning);
    this.fillProfile(this.leaderboard.loadRecentProfile());
    this.playerStatus.textContent = this.leaderboard.connected
      ? '입력한 정보는 온라인 랭킹에 공개됩니다.'
      : 'Supabase 연결 전이라 이 기기의 임시 랭킹으로 실행됩니다.';
    this.playerGate.classList.remove('is-hidden');
  }

  dispose(): void {
    window.clearTimeout(this.stageCardTimer);
    this.playerForm.removeEventListener('submit', this.beginRun);
    this.clearProfileButton.removeEventListener('click', this.clearProfile);
    this.retryButton.removeEventListener('click', this.retry);
    this.backButton.removeEventListener('click', this.back);
    this.rankingToggleButton.removeEventListener('click', this.toggleRanking);
    this.reviewButton.removeEventListener('click', this.reviewLearning);
    this.destroyGame();
  }

  private readonly beginRun = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!this.playerForm.reportValidity()) return;
    this.profile = this.readProfile();
    this.startRunButton.disabled = true;
    this.startRunButton.textContent = '준비 중…';
    this.playerStatus.textContent = '게임 세션을 준비하고 있어요.';
    const seed = await this.leaderboard.startRun(this.profile);
    this.state.reset(seed);
    this.submitted = false;
    this.rankingList.replaceChildren();
    this.currentRank.textContent = '랭킹 계산 중…';
    this.gameOver.classList.add('is-hidden');
    this.rankingPanel.classList.remove('is-ranking-open');
    this.rankingToggleButton.textContent = 'TOP 100 보기';
    this.playerGate.classList.add('is-hidden');
    this.startRunButton.disabled = false;
    this.startRunButton.textContent = '게임 시작!';
    this.createGame();
  };

  private readonly retry = (): void => {
    this.destroyGame();
    this.gameOver.classList.add('is-hidden');
    this.fillProfile(this.leaderboard.loadRecentProfile());
    this.playerGate.classList.remove('is-hidden');
    this.schoolInput.focus();
  };

  private readonly clearProfile = (): void => {
    this.leaderboard.clearRecentProfile();
    this.fillProfile(null);
    this.schoolInput.focus();
  };

  private readonly back = (): void => window.location.reload();

  private readonly toggleRanking = (): void => {
    const opened = this.rankingPanel.classList.toggle('is-ranking-open');
    this.rankingToggleButton.textContent = opened ? '랭킹 닫기' : 'TOP 100 보기';
  };

  private readonly reviewLearning = (): void => {
    sessionStorage.setItem('moon-open-learning', '1');
    window.location.reload();
  };

  private createGame(): void {
    this.scene = new MoonGameScene(this.state, (stageChanged) => this.syncUi(Boolean(stageChanged)));
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.canvasRoot,
      width: this.canvasRoot.clientWidth,
      height: this.canvasRoot.clientHeight,
      transparent: true,
      pixelArt: true,
      roundPixels: true,
      scene: [this.scene],
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: false, pixelArt: true, roundPixels: true },
    });
    this.syncUi(true);
  }

  private destroyGame(): void {
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
    this.canvasRoot.replaceChildren();
  }

  private syncUi(stageChanged = false): void {
    const targetNames = this.state.targetInfos.map((target) => target.name);
    this.hearts.innerHTML = Array.from({ length: this.state.maxHp }, (_, index) => {
      const source = index < this.state.hp ? HUD_ASSETS.heartFull : HUD_ASSETS.heartEmpty;
      return `<img src="${source}" alt="${index < this.state.hp ? '남은 체력' : '잃은 체력'}">`;
    }).join('');
    this.targetName.textContent = targetNames.join(' · ');
    this.score.textContent = this.state.score.toLocaleString('ko-KR');
    this.combo.textContent = `COMBO ${this.state.combo}`;

    if (stageChanged) {
      this.stageLabel.textContent = `${this.state.stageIndex + 1}단계 · ${this.state.round}라운드`;
      this.stageName.textContent = `${targetNames.join('과 ')}을 찾아라!`;
      this.stageCard.classList.remove('is-hidden', 'is-leaving');
      window.clearTimeout(this.stageCardTimer);
      this.stageCardTimer = window.setTimeout(() => this.stageCard.classList.add('is-leaving'), 950);
      window.setTimeout(() => this.stageCard.classList.add('is-hidden'), 1300);
    }

    if (this.state.gameOver && !this.submitted) {
      this.submitted = true;
      this.finalScore.textContent = this.state.score.toLocaleString('ko-KR');
      this.bestCombo.textContent = `${this.state.bestCombo}`;
      this.gameOver.classList.remove('is-hidden');
      void this.finishRun();
    }
  }

  private async finishRun(): Promise<void> {
    if (!this.profile) return;
    this.currentRank.textContent = '점수를 등록하고 있어요…';
    const ranking = await this.leaderboard.submit(this.profile, this.state.summary());
    this.renderRanking(ranking);
  }

  private renderRanking(result: RankingResult): void {
    this.currentRank.textContent = result.currentRank <= 100
      ? `이번 기록은 ${result.currentRank}위예요!`
      : `이번 기록은 ${result.currentRank}위예요. TOP 100에 도전하세요!`;
    this.rankingSource.textContent = result.remote ? '온라인 랭킹' : '이 기기의 임시 랭킹';
    const rows = result.entries.map((entry) => {
      const row = document.createElement('li');
      if (entry.id === result.currentRunId) row.classList.add('is-current');
      const rank = document.createElement('strong');
      rank.textContent = `${entry.rank}`;
      const student = document.createElement('span');
      student.textContent = `${entry.school} ${entry.grade}학년 ${entry.classNo}반 ${entry.studentNo}번`;
      const score = document.createElement('b');
      score.textContent = entry.score.toLocaleString('ko-KR');
      row.append(rank, student, score);
      return row;
    });
    this.rankingList.replaceChildren(...rows);
  }

  private readProfile(): StudentProfile {
    const schoolPrefix = this.schoolInput.value.trim().replace(/초등학교$/, '');
    return {
      school: `${schoolPrefix}초등학교`, grade: Number(this.gradeInput.value),
      classNo: Number(this.classInput.value), studentNo: Number(this.studentNoInput.value),
    };
  }

  private fillProfile(profile: StudentProfile | null): void {
    this.schoolInput.value = profile?.school.replace(/초등학교$/, '') ?? '';
    this.gradeInput.value = profile ? String(profile.grade) : '';
    this.classInput.value = profile ? String(profile.classNo) : '';
    this.studentNoInput.value = profile ? String(profile.studentNo) : '';
  }
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function ensureActionButton(id: string, label: string, parent: HTMLElement): HTMLButtonElement {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLButtonElement) return existing;
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = label;
  parent.append(button);
  return button;
}
