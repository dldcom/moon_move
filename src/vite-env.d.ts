/// <reference types="vite/client" />

interface MoonLabDiagnostics {
  frame: number;
  elapsedDays: number;
  mode: string;
  isPlaying: boolean;
  renderer: { calls: number; triangles: number; geometries: number; textures: number };
  canvas: { clientWidth: number; clientHeight: number; width: number; height: number; dpr: number };
}

interface MoonLabTestHooks {
  setState(name: string): void;
  setTime(days: number): void;
  setPausedForScreenshot(paused: boolean): void;
  setReducedMotion(enabled: boolean): void;
  hideDebugUi(hidden: boolean): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: MoonLabDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: MoonLabTestHooks;
}
