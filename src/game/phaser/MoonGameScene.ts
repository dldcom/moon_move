import Phaser from 'phaser';
import { FX_ASSETS, HUD_ASSETS, MOON_ASSETS } from '../assets/manifest';
import { ArcadeState, MOON_PHASES, type MoonPhase } from '../simulation/state';

type ActiveMoon = {
  image: Phaser.GameObjects.Image;
  phase: MoonPhase;
  resolved: boolean;
};

export class MoonGameScene extends Phaser.Scene {
  private readonly moons = new Set<ActiveMoon>();
  private spawnTimer = 0;
  private stageBlockedUntil = 0;
  private spawnsSinceTarget = 0;

  constructor(private readonly state: ArcadeState, private readonly onStateChange: (stageChanged?: boolean) => void) {
    super('MoonGame');
  }

  preload(): void {
    for (const [key, url] of Object.entries(MOON_ASSETS)) this.load.image(key, url);
    for (const [key, url] of Object.entries(FX_ASSETS)) this.load.image(key, url);
    this.load.image('hud-heart-full', HUD_ASSETS.heartFull);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#031e45');
    this.stageBlockedUntil = this.time.now + 1400;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { delete window.__MOON_ARCADE_DEBUG__; });
  }

  update(_time: number, deltaMs: number): void {
    this.publishDebug();
    if (this.state.gameOver) return;
    const stageChanged = this.state.update(deltaMs / 1000);
    if (stageChanged) {
      this.stageBlockedUntil = this.time.now + 1200;
      this.spawnsSinceTarget = 0;
      this.clearMoons();
      this.onStateChange(true);
    }
    if (this.time.now < this.stageBlockedUntil) return;
    this.spawnTimer -= deltaMs;
    if (this.spawnTimer <= 0) {
      this.spawnSingle();
      const speedUp = Math.min(150, (this.state.round - 1) * 22);
      this.spawnTimer = Phaser.Math.Between(480 - speedUp, 940 - speedUp);
    }
  }

  restartRun(): void {
    this.tweens.killAll();
    this.clearMoons();
    this.spawnTimer = 0;
    this.spawnsSinceTarget = 0;
    this.stageBlockedUntil = this.time.now + 1400;
  }

  private spawnSingle(): void {
    const targets = this.state.targets;
    const mustSpawnTarget = this.spawnsSinceTarget >= 3;
    const spawnTarget = mustSpawnTarget || Math.random() < 0.3;
    const distractors = MOON_PHASES.filter((phase) => !targets.includes(phase.key));
    const phase = spawnTarget
      ? Phaser.Utils.Array.GetRandom(targets)
      : Phaser.Utils.Array.GetRandom(distractors).key;
    this.spawnsSinceTarget = this.state.isTarget(phase) ? 0 : this.spawnsSinceTarget + 1;

    const margin = 58;
    const x = Phaser.Math.Between(margin, Math.max(margin, this.scale.width - margin));
    this.spawnMoon(phase, x);
  }

  private spawnMoon(phase: MoonPhase, x: number): void {
    const phaseInfo = MOON_PHASES.find((entry) => entry.key === phase)!;
    const size = 108;
    const startY = this.scale.height + size;
    const apexY = Phaser.Math.Between(Math.floor(this.scale.height * 0.26), Math.floor(this.scale.height * 0.68));
    const image = this.add.image(x, startY, phaseInfo.sprite).setDisplaySize(size, size).setDepth(apexY);
    image.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 24 });
    const moon: ActiveMoon = { image, phase, resolved: false };
    this.moons.add(moon);
    image.on('pointerdown', () => this.handleMoonClick(moon));

    const speedFactor = Math.max(0.82, 1 - (this.state.round - 1) * 0.02);
    this.tweens.chain({
      targets: image,
      tweens: [
        {
          y: apexY,
          duration: 560 * speedFactor,
          ease: 'Quad.Out',
        },
        { y: startY, duration: 1180 * speedFactor, ease: 'Quad.In' },
      ],
      onComplete: () => {
        if (!moon.resolved && this.state.miss(moon.phase)) this.onStateChange();
        this.destroyMoon(moon);
      },
    });
  }

  private handleMoonClick(moon: ActiveMoon): void {
    if (moon.resolved || this.state.gameOver || this.time.now < this.stageBlockedUntil) return;
    moon.resolved = true;
    moon.image.disableInteractive();
    const result = this.state.select(moon.phase);
    this.onStateChange();
    if (result.correct) {
      this.playCorrectHit(moon, result.gainedScore);
      if (result.gainedLife) this.playLifeGain(moon.image.x, moon.image.y);
    }
    else this.playWrongHit(moon);
  }

  private playCorrectHit(moon: ActiveMoon, score: number): void {
    const info = MOON_PHASES.find((entry) => entry.key === moon.phase)!;
    this.tweens.killTweensOf(moon.image);
    moon.image.setTexture(info.hurtSprite);
    this.time.delayedCall(90, () => {
      if (!moon.image.active) return;
      const left = this.add.image(moon.image.x, moon.image.y, info.hurtSprite)
        .setDisplaySize(moon.image.displayWidth, moon.image.displayHeight).setCrop(0, 0, 64, 128);
      const right = this.add.image(moon.image.x, moon.image.y, info.hurtSprite)
        .setDisplaySize(moon.image.displayWidth, moon.image.displayHeight).setCrop(64, 0, 64, 128);
      moon.image.setVisible(false);
      this.playEffect(moon.image.x, moon.image.y, ['fx-sparkle-01', 'fx-sparkle-02', 'fx-sparkle-03', 'fx-sparkle-04'], moon.image.displayWidth * 1.7, 64);
      const popup = this.add.text(moon.image.x, moon.image.y - moon.image.displayHeight * 0.58, `+${score}`, {
        fontFamily: 'monospace', fontSize: '26px', color: '#fff3a6', stroke: '#392700', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(100);
      this.tweens.add({ targets: left, x: left.x - 42, y: left.y + 70, angle: -35, alpha: 0, duration: 360, ease: 'Quad.In' });
      this.tweens.add({ targets: right, x: right.x + 42, y: right.y + 70, angle: 35, alpha: 0, duration: 360, ease: 'Quad.In' });
      this.tweens.add({ targets: popup, y: popup.y - 42, alpha: 0, duration: 460, onComplete: () => popup.destroy() });
      this.time.delayedCall(380, () => { left.destroy(); right.destroy(); this.destroyMoon(moon); });
    });
  }

  private playWrongHit(moon: ActiveMoon): void {
    this.tweens.killTweensOf(moon.image);
    this.cameras.main.shake(130, 0.008);
    moon.image.setVisible(false);
    this.playEffect(moon.image.x, moon.image.y, ['fx-explosion-01', 'fx-explosion-02', 'fx-explosion-03', 'fx-explosion-04'], moon.image.displayWidth * 1.75, 58);
    this.time.delayedCall(245, () => this.destroyMoon(moon));
    if (this.state.gameOver) this.time.delayedCall(220, () => this.clearMoons());
  }

  private playLifeGain(x: number, y: number): void {
    const heart = this.add.image(x, y, 'hud-heart-full').setDepth(260);
    const targetScale = 54 / heart.width;
    heart.setScale(0);
    this.tweens.add({
      targets: heart,
      scale: targetScale,
      y: y - 72,
      duration: 420,
      ease: 'Back.Out',
      onComplete: () => this.tweens.add({
        targets: heart, y: heart.y - 28, alpha: 0, duration: 460, ease: 'Quad.In', onComplete: () => heart.destroy(),
      }),
    });
  }

  private playEffect(x: number, y: number, frames: string[], size: number, frameDuration: number): void {
    const effect = this.add.image(x, y, frames[0]).setDisplaySize(size, size).setDepth(200);
    frames.slice(1).forEach((frame, index) => {
      this.time.delayedCall(frameDuration * (index + 1), () => {
        if (effect.active) effect.setTexture(frame);
      });
    });
    this.time.delayedCall(frameDuration * frames.length, () => effect.destroy());
  }

  private destroyMoon(moon: ActiveMoon): void {
    if (!this.moons.delete(moon)) return;
    moon.image.destroy();
  }

  private clearMoons(): void {
    for (const moon of this.moons) moon.image.destroy();
    this.moons.clear();
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.resize(gameSize.width, gameSize.height);
  }

  private publishDebug(): void {
    if (!import.meta.env.DEV) return;
    window.__MOON_ARCADE_DEBUG__ = {
      target: this.state.target.key,
      hp: this.state.hp,
      score: this.state.score,
      moons: [...this.moons].map((moon) => ({
        x: moon.image.x,
        y: moon.image.y,
        phase: moon.phase,
        visible: moon.image.visible && !moon.resolved && moon.image.y < this.scale.height - 20,
      })),
    };
  }
}
