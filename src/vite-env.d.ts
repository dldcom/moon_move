/// <reference types="vite/client" />

interface MoonLabDiagnostics {
  frame: number;
  elapsedDays: number;
  mode: string;
  isPlaying: boolean;
  spaceCamera: {
    viewMode: 'free' | 'observer';
    position: number[];
    target: number[];
    orbitRadius: number;
    orbitAzimuth: number;
    orbitPitch: number;
    cameraDirection: number[];
    moonPosition: number[];
    autoFrameAlignment: number;
    observerCameraBackoff: number;
    cameraUp: number[];
    redRegionVisible: boolean;
    observerHorizonVisible: boolean;
    observerSurfaceGap: number;
  };
  spaceLighting: {
    expectedIllumination: number;
    redIllumination: number;
  };
  renderer: { calls: number; triangles: number; geometries: number; textures: number };
  canvas: { clientWidth: number; clientHeight: number; width: number; height: number; dpr: number };
}

interface MoonLabTestHooks {
  setState(name: string): void;
  setTime(days: number): void;
  setSpaceView(mode: 'free' | 'observer'): void;
  setSpaceOrbit(azimuth: number, pitch: number, radius?: number): void;
  setPausedForScreenshot(paused: boolean): void;
  setReducedMotion(enabled: boolean): void;
  hideDebugUi(hidden: boolean): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: MoonLabDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: MoonLabTestHooks;
  __MOON_ARCADE_DEBUG__?: {
    target: string;
    hp: number;
    score: number;
    moons: Array<{ x: number; y: number; phase: string; visible: boolean }>;
  };
}
