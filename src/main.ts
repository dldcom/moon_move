import './styles.css';
import { MoonLab } from './MoonLab';
import type { MoonArcade } from './game/MoonArcade';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

const learningButton = document.querySelector<HTMLButtonElement>('#start-button');
const appRoot = document.querySelector<HTMLElement>('#app');
const globalActions = document.querySelector<HTMLElement>('#global-actions');
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-button');
const fullscreenLabel = document.querySelector<HTMLElement>('#fullscreen-label');
const homeButton = document.querySelector<HTMLButtonElement>('#home-button');
const fullscreenStatus = document.querySelector<HTMLElement>('#fullscreen-status');
if (!appRoot || !globalActions || !fullscreenButton || !fullscreenLabel || !homeButton || !fullscreenStatus) {
  throw new Error('Missing global screen controls.');
}

let app: MoonLab | null = new MoonLab(canvas);
let arcade: MoonArcade | null = null;
app.start();

const fullscreenSupported = document.fullscreenEnabled && typeof appRoot.requestFullscreen === 'function';

const showFullscreenStatus = (message: string, persistent = false): void => {
  fullscreenStatus.textContent = message;
  fullscreenStatus.classList.remove('is-hidden');
  if (!persistent) window.setTimeout(() => fullscreenStatus.classList.add('is-hidden'), 2800);
};

const syncFullscreenButton = (): void => {
  const active = document.fullscreenElement === appRoot;
  fullscreenLabel.textContent = active ? '창화면' : '전체화면';
  fullscreenButton.setAttribute('aria-label', active ? '창화면으로 돌아가기' : '전체화면으로 보기');
  appRoot.classList.toggle('is-fullscreen', active);
};

for (const eventName of ['pointerdown', 'pointerup', 'click']) {
  globalActions.addEventListener(eventName, (event) => event.stopPropagation());
}

if (!fullscreenSupported) {
  fullscreenButton.disabled = true;
  showFullscreenStatus('이 브라우저에서는 전체화면을 지원하지 않아요.', true);
} else {
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await appRoot.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      showFullscreenStatus('전체화면을 시작할 수 없어요. 브라우저 설정을 확인해 주세요.');
    }
  });
  document.addEventListener('fullscreenchange', syncFullscreenButton);
  document.addEventListener('fullscreenerror', () => {
    showFullscreenStatus('전체화면 전환에 실패했어요.');
  });
}

homeButton.addEventListener('click', async () => {
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* Reload still returns to the main screen. */ }
  }
  window.location.reload();
});

learningButton?.addEventListener('click', () => homeButton.classList.remove('is-hidden'));

if (sessionStorage.getItem('moon-open-learning') === '1') {
  sessionStorage.removeItem('moon-open-learning');
  requestAnimationFrame(() => learningButton?.click());
}

const gameButton = document.querySelector<HTMLButtonElement>('#game-button');
const arcadeShell = document.querySelector<HTMLElement>('#arcade-shell');
if (!gameButton || !arcadeShell) throw new Error('Missing arcade entry UI.');

gameButton.addEventListener('click', async () => {
  gameButton.disabled = true;
  homeButton.classList.remove('is-hidden');
  document.body.classList.add('is-arcade-active');
  const { MoonArcade } = await import('./game/MoonArcade');
  app?.dispose();
  app = null;
  canvas.classList.add('is-game-hidden');
  document.querySelector('#intro')?.classList.add('is-hidden');
  document.querySelector('#lab-ui')?.classList.add('is-hidden');
  arcadeShell.classList.remove('is-hidden');
  arcade = new MoonArcade(arcadeShell);
  arcade.start();
});

if (import.meta.hot) import.meta.hot.dispose(() => {
  app?.dispose();
  arcade?.dispose();
});
