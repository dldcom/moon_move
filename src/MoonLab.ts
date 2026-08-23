import * as THREE from 'three';
import { daylightAmount, formatKoreanTime, getLunarMoment, wrapCycle } from './astronomy';

type Mode = 'intro' | 'sky' | 'journey' | 'split';
type SpaceViewMode = 'free' | 'observer';

type MoonModel = {
  root: THREE.Group;
  light: THREE.DirectionalLight;
  lightTarget: THREE.Object3D;
};

type SkyMoonModel = {
  root: THREE.Group;
  material: THREE.ShaderMaterial;
};

type SkyBackdrop = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
};

type SkyLandscape = {
  group: THREE.Group;
  baseMaterial: THREE.MeshBasicMaterial;
  farMaterial: THREE.MeshBasicMaterial;
  nearMaterial: THREE.MeshBasicMaterial;
  detailMaterial: THREE.MeshBasicMaterial;
};

const SKY_NIGHT = new THREE.Color('#06111f');
const PLAYBACK_DAYS_PER_SECOND = 1 / 6;
const SKY_HORIZON_Y = -2.35;
const SKY_MOON_ALTITUDE_RANGE = 5.1;
const SPACE_MOON_ORBIT_RADIUS = 3.15;
const EARTH_RADIUS = 0.78;
const OBSERVER_FOOT_OFFSET = 0.038;
const OBSERVER_SURFACE_RADIUS = EARTH_RADIUS + OBSERVER_FOOT_OFFSET;
const OBSERVER_LATITUDE = THREE.MathUtils.degToRad(37);
const FREE_ORBIT_MIN_RADIUS = 11;
const FREE_ORBIT_MAX_RADIUS = 19;
const INITIAL_ORBIT_PITCH = 0.39;
const AUTO_CAMERA_ELEVATION = Math.PI * 28 / 180;
const AUTO_CAMERA_LOOK_AHEAD = 0.18;
const INITIAL_OBSERVER_CAMERA_BACKOFF = 2.35;
const PHASE_STOPS = [
  { day: 4, hour: 18, name: '초승달', guide: '음력 3~4일 무렵에는 초승달이 떠.', image: '/assets/learning-moons/waxing-crescent.webp' },
  { day: 7, hour: 19, name: '상현달', guide: '음력 7~8일 무렵에는 상현달이 떠.', image: '/assets/learning-moons/first-quarter.webp' },
  { day: 15, hour: 0, name: '보름달', guide: '음력 15일 무렵에는 보름달이 떠.', image: '/assets/learning-moons/full-moon.webp' },
  { day: 22, hour: 3, name: '하현달', guide: '음력 22~23일 무렵에는 하현달이 떠.', image: '/assets/learning-moons/last-quarter.webp' },
  { day: 27, hour: 6, name: '그믐달', guide: '음력 27~28일 무렵에는 그믐달이 떠.', image: '/assets/learning-moons/waning-crescent.webp' },
] as const;

export class MoonLab {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly introScene = new THREE.Scene();
  private readonly skyScene = new THREE.Scene();
  private readonly spaceScene = new THREE.Scene();
  private readonly introCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  private readonly skyCamera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 50);
  private readonly spaceCamera = new THREE.PerspectiveCamera(43, 1, 0.04, 80);
  private readonly journeyCamera = new THREE.PerspectiveCamera(46, 1, 0.1, 50);
  private readonly introMoon: MoonModel;
  private readonly skyMoon: SkyMoonModel;
  private readonly spaceMoon: THREE.Mesh;
  private readonly earth: THREE.Mesh;
  private readonly spaceSun: THREE.Group;
  private readonly spaceObserver: THREE.Group;
  private readonly observerView: THREE.Group;
  private readonly observerHorizon: THREE.Group;
  private readonly spaceGuides = new THREE.Group();
  private readonly observableLitRegion: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly sunLabel: THREE.Sprite;
  private readonly earthLabel: THREE.Sprite;
  private readonly moonLabel: THREE.Sprite;
  private readonly observerLabel: THREE.Sprite;
  private readonly skyStars: THREE.Points;
  private readonly spaceStars: THREE.Points;
  private readonly introStars: THREE.Points;
  private readonly skyBackdrop: SkyBackdrop;
  private readonly skyHorizon: SkyLandscape;
  private readonly moonTexture: THREE.CanvasTexture;
  private readonly resizeObserver: ResizeObserver;

  private mode: Mode = 'intro';
  private elapsedDays = 2 + 9.5 / 24;
  private isPlaying = true;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private frameId = 0;
  private lastTime = performance.now();
  private frame = 0;
  private introElapsed = 0;
  private journeyElapsed = 0;
  private pausedForScreenshot = false;
  private disposed = false;
  private spaceViewMode: SpaceViewMode = 'free';
  private orbitRadius = 14;
  private observerCameraBackoff = INITIAL_OBSERVER_CAMERA_BACKOFF;
  private readonly orbitTarget = new THREE.Vector3(0, 0, 0);
  private readonly spaceLookTarget = new THREE.Vector3(0, 0, 0);
  private readonly desiredCameraPosition = new THREE.Vector3(0, 0, 14);
  private readonly desiredLookTarget = new THREE.Vector3(0, 0, 0);
  private readonly observerCameraAxis = new THREE.Vector3();
  private readonly freeCameraDirection = new THREE.Vector3(0, Math.sin(INITIAL_ORBIT_PITCH), Math.cos(INITIAL_ORBIT_PITCH));
  private readonly freeCameraUp = new THREE.Vector3(0, Math.cos(INITIAL_ORBIT_PITCH), -Math.sin(INITIAL_ORBIT_PITCH));
  private readonly freeCameraRight = new THREE.Vector3(1, 0, 0);
  private readonly orbitRotation = new THREE.Quaternion();
  private readonly autoCameraMoonDirection = new THREE.Vector3();
  private readonly autoCameraWorldUp = new THREE.Vector3(0, 0, 1);
  private readonly journeyStartPosition = new THREE.Vector3();
  private readonly journeyEndPosition = new THREE.Vector3();
  private readonly journeyStartTarget = new THREE.Vector3();
  private readonly journeyEndTarget = new THREE.Vector3();
  private readonly journeyLookTarget = new THREE.Vector3();
  private readonly journeyStartUp = new THREE.Vector3(0, 1, 0);
  private lastTrackedMoonAngle: number | null = null;
  private readonly currentObserverPosition = new THREE.Vector3();
  private readonly observerSurfaceNormal = new THREE.Vector3();
  private readonly observerLocalUp = new THREE.Vector3(0, 1, 0);
  private readonly currentMoonPosition = new THREE.Vector3();
  private currentSpaceExpectedIllumination = 0;
  private currentSpaceRedIllumination = 0;

  private readonly introUi = required<HTMLElement>('intro');
  private readonly labUi = required<HTMLElement>('lab-ui');
  private readonly startButton = required<HTMLButtonElement>('start-button');
  private readonly gameButton = required<HTMLButtonElement>('game-button');
  private readonly dateLabel = required<HTMLElement>('date-label');
  private readonly timeLabel = required<HTMLElement>('time-label');
  private readonly phaseLabel = required<HTMLElement>('phase-label');
  private readonly slider = required<HTMLInputElement>('time-slider');
  private readonly playButton = required<HTMLButtonElement>('play-button');
  private readonly phaseMarkers = required<HTMLElement>('phase-markers');
  private readonly skyPhaseName = required<HTMLElement>('sky-phase-name');
  private readonly viewButton = required<HTMLButtonElement>('view-button');
  private readonly phaseMarkerButtons: HTMLButtonElement[] = [];
  private readonly splitLabels = required<HTMLElement>('split-labels');
  private readonly guideNote = required<HTMLElement>('guide-note');
  private readonly skipJourney = required<HTMLButtonElement>('skip-journey');
  private readonly learningGuide = required<HTMLElement>('learning-guide');
  private readonly learningGuideVisual = required<HTMLElement>('learning-guide-visual');
  private readonly learningGuideMoon = required<HTMLImageElement>('learning-guide-moon');
  private readonly learningGuideKicker = required<HTMLElement>('learning-guide-kicker');
  private readonly learningGuideTitle = required<HTMLElement>('learning-guide-title');
  private readonly learningGuideMessage = required<HTMLElement>('learning-guide-message');
  private readonly learningGuideConfirm = required<HTMLButtonElement>('learning-guide-confirm');
  private readonly automaticStopsShown = new Set<number>();
  private readonly phaseGuideImages = new Map<string, HTMLImageElement>();
  private phaseGuideRequest = 0;
  private guideStep: 'closed' | 'intro' | 'phase' = 'closed';
  private resumeAfterGuide = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.autoClear = false;

    this.moonTexture = createMoonTexture();
    this.introMoon = createMoonModel(this.moonTexture, 1.28, true);
    this.skyMoon = createSkyMoonModel(this.moonTexture, 0.78);
    this.spaceMoon = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 48, 32),
      new THREE.MeshStandardMaterial({ map: this.moonTexture, roughness: 0.94, color: '#f4f0df', metalness: 0 }),
    );
    this.earth = createEarth();
    this.spaceSun = createSpaceSun();
    this.spaceObserver = createSpaceObserver();
    this.observerView = createObserverView();
    this.observerHorizon = createObserverEarthHorizon();
    this.observableLitRegion = createObservableLitRegion();
    this.sunLabel = createSpaceLabel('태양', '#5c4616');
    this.earthLabel = createSpaceLabel('지구', '#174a68');
    this.moonLabel = createSpaceLabel('달', '#4b4a45');
    this.observerLabel = createSpaceLabel('관측자', '#18536a');
    this.skyStars = createStars(180, 19);
    this.spaceStars = createSpaceStars(320, 73);
    this.introStars = createStars(110, 7);
    this.skyBackdrop = createSkyBackdrop();
    this.skyHorizon = createSkyHorizon();

    this.setupScenes();
    this.preloadPhaseGuideImages();
    this.bindUi();
    this.installTestHooks();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  start(): void {
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    this.renderer.dispose();
    this.moonTexture.dispose();
    delete window.__THREE_GAME_DIAGNOSTICS__;
    delete window.__THREE_GAME_TEST_HOOKS__;
  }

  private setupScenes(): void {
    this.introCamera.position.set(0, 0, 7.3);
    this.skyCamera.position.set(0, 0, 12);
    this.spaceCamera.position.copy(this.desiredCameraPosition);
    this.spaceCamera.lookAt(this.spaceLookTarget);
    this.spaceCamera.add(this.observerHorizon);
    this.introScene.background = SKY_NIGHT.clone();
    this.skyScene.background = null;
    this.spaceScene.background = new THREE.Color('#050b15');

    this.introScene.add(this.introStars, this.introMoon.root, this.introMoon.light, this.introMoon.lightTarget);
    this.skyScene.add(this.skyBackdrop.mesh, this.skyStars, this.skyMoon.root, this.skyHorizon.group);

    const orbit = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 128 }, (_, index) => {
          const angle = (index / 128) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(angle) * SPACE_MOON_ORBIT_RADIUS, Math.sin(angle) * SPACE_MOON_ORBIT_RADIUS, 0);
        }),
      ),
      new THREE.LineBasicMaterial({ color: '#6686a2', transparent: true, opacity: 0.34 }),
    );
    this.spaceSun.position.set(-5.45, 0, 0);
    const sunlight = new THREE.DirectionalLight('#fff3c4', 3.4);
    sunlight.position.set(-10, 0, 0);
    sunlight.target.position.set(0, 0, 0);
    this.spaceGuides.add(orbit, this.observerView, this.spaceObserver, this.sunLabel, this.earthLabel, this.moonLabel, this.observerLabel);
    this.spaceScene.add(
      this.spaceSun,
      this.spaceStars,
      this.spaceGuides,
      this.spaceCamera,
      this.earth,
      this.spaceMoon,
      this.observableLitRegion,
      sunlight,
      sunlight.target,
      new THREE.AmbientLight('#4e6682', 0.045),
    );
    this.sunLabel.position.set(-5.45, -1.35, 0.95);
    this.earthLabel.position.set(0, 1.35, 0.95);
    this.observableLitRegion.visible = false;
    this.observerHorizon.visible = false;
  }

  private bindUi(): void {
    this.setupPhaseMarkers();
    this.startButton.addEventListener('click', () => this.showIntroGuide());
    this.learningGuideConfirm.addEventListener('click', () => this.confirmLearningGuide());
    this.playButton.addEventListener('click', () => {
      this.isPlaying = !this.isPlaying;
      this.updatePlayButton();
    });
    this.slider.addEventListener('pointerdown', () => { this.isPlaying = false; this.updatePlayButton(); });
    this.slider.addEventListener('input', () => {
      this.elapsedDays = wrapCycle(Number(this.slider.value));
      this.updateUi();
    });
    this.viewButton.addEventListener('click', () => {
      if (this.mode === 'split') this.enterSky();
      else this.beginJourney();
    });
    this.skipJourney.addEventListener('click', () => this.enterSplit());
    window.addEventListener('keydown', this.onKeyDown);
  }

  private setupPhaseMarkers(): void {
    PHASE_STOPS.forEach((stop, index) => {
      const value = stop.day - 1 + stop.hour / 24;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'phase-marker';
      button.textContent = `${stop.day}일`;
      button.title = `${stop.day}일 ${stop.name} 보기`;
      button.setAttribute('aria-label', `음력 ${stop.day}일 ${stop.name} 보기`);
      button.dataset.day = String(stop.day);
      button.style.left = `${(value / Number(this.slider.max)) * 100}%`;
      button.addEventListener('click', () => {
        this.isPlaying = false;
        this.elapsedDays = value;
        this.updatePlayButton();
        this.updateSimulation();
        void this.showPhaseGuide(index, false);
      });
      this.phaseMarkers.append(button);
      this.phaseMarkerButtons.push(button);
    });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.guideStep !== 'closed' || this.mode === 'intro' || this.mode === 'journey') return;
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight' && event.code !== 'Space') return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.isPlaying = !this.isPlaying;
      this.updatePlayButton();
      return;
    }
    event.preventDefault();
    const direction = event.code === 'ArrowRight' ? 1 : -1;
    this.isPlaying = false;
    this.elapsedDays = wrapCycle(this.elapsedDays + direction * (event.shiftKey ? 0.25 : 0.05));
    this.updatePlayButton();
    this.updateUi();
  };

  private readonly tick = (now: number): void => {
    if (this.disposed) return;
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.frame += 1;

    if (!this.pausedForScreenshot) {
      if (this.mode === 'intro') this.updateIntro(delta);
      if ((this.mode === 'sky' || this.mode === 'split') && this.isPlaying) {
        this.advancePlayback(delta);
      }
      if (this.mode === 'journey') this.updateJourney(delta);
    }

    this.updateSimulation();
    this.updateSpaceCamera(delta);
    this.render();
    this.publishDiagnostics();
    this.frameId = requestAnimationFrame(this.tick);
  };

  private advancePlayback(delta: number): void {
    const previous = this.elapsedDays;
    const cycleLength = Number(this.slider.max);
    const unwrappedNext = previous + delta * PLAYBACK_DAYS_PER_SECOND;
    const next = wrapCycle(unwrappedNext);
    const crossedStop = PHASE_STOPS.findIndex((stop, index) => {
      if (this.automaticStopsShown.has(index)) return false;
      const value = stop.day - 1 + stop.hour / 24;
      if (unwrappedNext < cycleLength) return value > previous && value <= unwrappedNext;
      return value > previous || value <= next;
    });
    if (crossedStop < 0) {
      this.elapsedDays = next;
      return;
    }
    const stop = PHASE_STOPS[crossedStop];
    this.elapsedDays = stop.day - 1 + stop.hour / 24;
    this.isPlaying = false;
    void this.showPhaseGuide(crossedStop, true);
  }

  private showIntroGuide(): void {
    this.isPlaying = false;
    this.guideStep = 'intro';
    this.resumeAfterGuide = false;
    this.learningGuideVisual.classList.add('is-hidden');
    this.learningGuideKicker.classList.remove('is-hidden');
    this.learningGuideKicker.textContent = '달 관찰 안내';
    this.learningGuideTitle.textContent = '달의 모양이 어떻게 변하는지 관찰해 보자!';
    this.learningGuideMessage.classList.add('is-hidden');
    this.learningGuide.classList.remove('is-phase');
    this.learningGuide.classList.remove('is-hidden');
    this.learningGuideConfirm.focus();
  }

  private preloadPhaseGuideImages(): void {
    for (const stop of PHASE_STOPS) {
      const image = new Image();
      image.decoding = 'async';
      image.src = stop.image;
      this.phaseGuideImages.set(stop.image, image);
      void image.decode().catch(() => { /* The modal retries decoding before it opens. */ });
    }
  }

  private async showPhaseGuide(index: number, resumeAfterConfirm: boolean): Promise<void> {
    const stop = PHASE_STOPS[index];
    const request = ++this.phaseGuideRequest;
    if (resumeAfterConfirm) this.automaticStopsShown.add(index);
    this.isPlaying = false;
    this.guideStep = 'phase';
    this.resumeAfterGuide = resumeAfterConfirm;
    this.learningGuide.classList.add('is-hidden');

    const preloadedImage = this.phaseGuideImages.get(stop.image);
    if (preloadedImage) {
      try { await preloadedImage.decode(); } catch { /* The visible image performs one final retry. */ }
    }
    if (request !== this.phaseGuideRequest) return;

    this.learningGuideMoon.src = stop.image;
    try { await this.learningGuideMoon.decode(); } catch { /* Show the browser's image fallback if decoding fails. */ }
    if (request !== this.phaseGuideRequest) return;

    this.learningGuideMoon.alt = `${stop.name}의 실제 달 모습`;
    this.learningGuideVisual.classList.remove('is-hidden');
    this.learningGuideKicker.classList.add('is-hidden');
    this.learningGuideTitle.textContent = `음력 ${stop.day}일 ${stop.name}`;
    this.learningGuideMessage.classList.add('is-hidden');
    this.learningGuide.classList.add('is-phase');
    this.learningGuide.classList.remove('is-hidden');
    this.updatePlayButton();
    this.learningGuideConfirm.focus();
  }

  private confirmLearningGuide(): void {
    if (this.guideStep === 'intro') {
      this.automaticStopsShown.clear();
      this.enterSky();
      this.elapsedDays = 3 + 6 / 24;
      this.learningGuide.classList.add('is-hidden');
      this.guideStep = 'closed';
      this.resumeAfterGuide = false;
      this.isPlaying = true;
      this.updateSimulation();
      this.updatePlayButton();
      return;
    }
    const shouldResume = this.resumeAfterGuide;
    this.learningGuide.classList.add('is-hidden');
    this.guideStep = 'closed';
    this.resumeAfterGuide = false;
    this.isPlaying = shouldResume;
    this.updatePlayButton();
  }

  private updateIntro(delta: number): void {
    this.introElapsed += delta;
    this.startButton.disabled = false;
    this.startButton.classList.add('is-ready');
    this.gameButton.classList.add('is-ready');

    const phaseProgress = this.reducedMotion ? 0.48 : (this.introElapsed % 18) / 18;
    const angle = phaseProgress * Math.PI * 2;
    this.introMoon.light.position.set(Math.sin(angle) * 6, 1.2, -Math.cos(angle) * 6);
    this.introMoon.root.rotation.y = Math.sin(this.introElapsed * 0.7) * 0.035;
    this.introMoon.root.position.y = Math.sin(this.introElapsed * 1.25) * 0.06 - 0.12;
  }

  private updateSimulation(): void {
    const moment = getLunarMoment(this.elapsedDays);
    const daylight = daylightAmount(moment.hour);
    const sunHourAngle = ((moment.hour - 12) / 24) * Math.PI * 2;
    const orbitAngle = Math.PI + moment.phaseAngle;
    const observerAngle = Math.PI + sunHourAngle;

    const spaceMoonX = Math.cos(orbitAngle) * SPACE_MOON_ORBIT_RADIUS;
    const spaceMoonY = Math.sin(orbitAngle) * SPACE_MOON_ORBIT_RADIUS;
    const observerX = Math.cos(observerAngle) * OBSERVER_SURFACE_RADIUS;
    const observerY = Math.sin(observerAngle) * OBSERVER_SURFACE_RADIUS;
    const toMoonX = spaceMoonX - observerX;
    const toMoonY = spaceMoonY - observerY;
    const toMoonLength = Math.max(0.001, Math.hypot(toMoonX, toMoonY));
    const observerUpX = Math.cos(observerAngle);
    const observerUpY = Math.sin(observerAngle);
    const moonAltitude = (observerUpX * toMoonX + observerUpY * toMoonY) / toMoonLength;
    const moonLateral = (observerUpX * toMoonY - observerUpY * toMoonX) / toMoonLength;

    const horizontalTravel = this.skyCamera.right * 0.78;
    const moonX = -moonLateral * horizontalTravel;
    const moonY = SKY_HORIZON_Y + moonAltitude * SKY_MOON_ALTITUDE_RANGE;
    this.skyMoon.root.position.set(moonX, moonY, 0);
    const lightDirection = this.skyMoon.material.uniforms.uLightDirection.value as THREE.Vector3;
    lightDirection.set(Math.sin(moment.phaseAngle), 0, -Math.cos(moment.phaseAngle)).normalize();
    this.skyMoon.material.uniforms.uVisibility.value = moonVisibility(moment.hour);

    const palette = sampleSkyPalette(moment.hour);
    (this.skyBackdrop.material.uniforms.uTop.value as THREE.Color).copy(palette.top);
    (this.skyBackdrop.material.uniforms.uBottom.value as THREE.Color).copy(palette.bottom);
    this.skyHorizon.farMaterial.color.copy(palette.bottom).multiplyScalar(0.55);
    this.skyHorizon.nearMaterial.color.copy(palette.bottom).multiplyScalar(0.39);
    this.skyHorizon.baseMaterial.color.copy(palette.bottom).multiplyScalar(0.3);
    this.skyHorizon.detailMaterial.color.copy(palette.bottom).multiplyScalar(0.24);
    const starsMaterial = this.skyStars.material as THREE.PointsMaterial;
    starsMaterial.opacity = Math.pow(1 - daylight, 1.8) * 0.9;

    this.spaceMoon.position.set(spaceMoonX, spaceMoonY, 0);
    this.spaceMoon.rotation.z = orbitAngle + Math.PI;
    this.observableLitRegion.position.set(spaceMoonX, spaceMoonY, 0);
    this.currentMoonPosition.set(spaceMoonX, spaceMoonY, 0);
    this.trackFreeCameraWithMoon(orbitAngle);
    const sunDirection = this.observableLitRegion.material.uniforms.uSunDirection.value as THREE.Vector3;
    sunDirection.set(-1, 0, 0);
    const observerDirection = this.observableLitRegion.material.uniforms.uObserverDirection.value as THREE.Vector3;
    observerDirection.set(-spaceMoonX, -spaceMoonY, 0).normalize();
    this.currentSpaceExpectedIllumination = moment.illumination;
    this.currentSpaceRedIllumination = (1 + sunDirection.dot(observerDirection)) / 2;
    this.moonLabel.position.set(spaceMoonX, spaceMoonY - 0.78, 0.95);

    this.earth.rotation.z = observerAngle;
    const observerLatitudeRadius = Math.cos(OBSERVER_LATITUDE);
    this.observerSurfaceNormal.set(
      Math.cos(observerAngle) * observerLatitudeRadius,
      Math.sin(observerAngle) * observerLatitudeRadius,
      Math.sin(OBSERVER_LATITUDE),
    ).normalize();
    this.spaceObserver.position.copy(this.observerSurfaceNormal).multiplyScalar(OBSERVER_SURFACE_RADIUS);
    this.spaceObserver.quaternion.setFromUnitVectors(this.observerLocalUp, this.observerSurfaceNormal);
    this.currentObserverPosition.copy(this.spaceObserver.position);
    this.earthLabel.position.copy(this.freeCameraRight).multiplyScalar(-1.16)
      .addScaledVector(this.freeCameraUp, 0.36);
    this.observerLabel.position.copy(this.spaceObserver.position)
      .addScaledVector(this.freeCameraRight, 0.5)
      .addScaledVector(this.freeCameraUp, 0.26);
    this.observerView.position.set(observerX, observerY, -0.82);
    this.observerView.rotation.z = observerAngle - Math.PI / 2;
    this.slider.value = String(moment.cycleDay);
    this.updateUi(moment);
    this.positionSkyPhaseName();
  }

  private updateUi(moment = getLunarMoment(this.elapsedDays)): void {
    this.dateLabel.textContent = `음력 ${moment.lunarDay}일`;
    this.timeLabel.textContent = formatKoreanTime(moment.hour);
    this.phaseLabel.textContent = moment.phaseName;
    this.phaseLabel.classList.toggle('is-empty', !moment.phaseName);
    this.skyPhaseName.textContent = moment.phaseName;
    for (const button of this.phaseMarkerButtons) {
      button.classList.toggle('is-active', Number(button.dataset.day) === moment.lunarDay);
    }
  }

  private positionSkyPhaseName(): void {
    const phaseName = this.skyPhaseName.textContent?.trim() ?? '';
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const splitDesktop = this.mode === 'split' && width >= 720;
    const splitMobile = this.mode === 'split' && width < 720;
    const skyWidth = splitDesktop ? width / 2 : width;
    const skyHeight = splitMobile ? height / 2 : height;
    const cameraWidth = this.skyCamera.right - this.skyCamera.left;
    const cameraHeight = this.skyCamera.top - this.skyCamera.bottom;
    const x = ((this.skyMoon.root.position.x - this.skyCamera.left) / cameraWidth) * skyWidth;
    const moonCenterY = ((this.skyCamera.top - this.skyMoon.root.position.y) / cameraHeight) * skyHeight;
    const moonRadiusPixels = (0.78 / cameraHeight) * skyHeight;
    const y = moonCenterY + moonRadiusPixels + 14;
    const onScreen = x > 26 && x < skyWidth - 26 && y > 44 && y < skyHeight - 26;
    this.skyPhaseName.classList.toggle('is-hidden', !phaseName || !onScreen || this.mode === 'intro' || this.mode === 'journey');
    this.skyPhaseName.style.left = `${x}px`;
    this.skyPhaseName.style.top = `${y}px`;
  }

  private updateJourney(delta: number): void {
    this.journeyElapsed += delta;
    const duration = this.reducedMotion ? 0.25 : 4.5;
    const t = easeInOutCubic(Math.min(1, this.journeyElapsed / duration));
    this.journeyCamera.position.lerpVectors(this.journeyStartPosition, this.journeyEndPosition, t);
    this.journeyLookTarget.lerpVectors(this.journeyStartTarget, this.journeyEndTarget, t);
    this.journeyCamera.up.lerpVectors(this.journeyStartUp, this.freeCameraUp, t).normalize();
    this.journeyCamera.lookAt(this.journeyLookTarget);
    if (t >= 1) this.enterSplit();
  }

  private render(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, width, height);
    this.renderer.clear();

    if (this.mode === 'intro') {
      this.renderer.render(this.introScene, this.introCamera);
      return;
    }
    if (this.mode === 'sky') {
      this.renderer.render(this.skyScene, this.skyCamera);
      return;
    }
    if (this.mode === 'journey') {
      this.renderer.render(this.spaceScene, this.journeyCamera);
      return;
    }

    const vertical = width < 720;
    this.renderer.setScissorTest(true);
    if (vertical) {
      const half = Math.floor(height / 2);
      this.renderViewport(this.skyScene, this.skyCamera, 0, half, width, height - half);
      this.renderViewport(this.spaceScene, this.spaceCamera, 0, 0, width, half);
    } else {
      const half = Math.floor(width / 2);
      this.renderViewport(this.skyScene, this.skyCamera, 0, 0, half, height);
      this.renderViewport(this.spaceScene, this.spaceCamera, half, 0, width - half, height);
    }
    this.renderer.setScissorTest(false);
  }

  private renderViewport(scene: THREE.Scene, camera: THREE.Camera, x: number, y: number, width: number, height: number): void {
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.render(scene, camera);
  }

  private enterSky(): void {
    this.mode = 'sky';
    this.introUi.classList.add('is-hidden');
    this.labUi.classList.remove('is-hidden', 'journey-hidden');
    this.splitLabels.classList.add('is-hidden');
    this.guideNote.classList.add('is-hidden');
    this.observableLitRegion.visible = false;
    this.spaceGuides.visible = true;
    this.earth.visible = true;
    this.viewButton.classList.remove('is-hidden');
    this.skipJourney.classList.add('is-hidden');
    this.viewButton.textContent = '우주에서도 살펴볼까?';
    this.isPlaying = true;
    this.updatePlayButton();
    this.resize();
  }

  private beginJourney(): void {
    this.mode = 'journey';
    this.isPlaying = false;
    this.observableLitRegion.visible = false;
    this.spaceGuides.visible = true;
    this.earth.visible = true;
    this.viewButton.classList.add('is-hidden');
    this.journeyElapsed = 0;
    this.alignFreeCameraToMoon();
    this.journeyStartPosition.copy(this.currentMoonPosition)
      .addScaledVector(this.freeCameraDirection, 2.1)
      .addScaledVector(this.freeCameraUp, 0.25);
    this.journeyEndPosition.copy(this.freeCameraDirection)
      .multiplyScalar(this.orbitRadius)
      .add(this.orbitTarget);
    this.journeyStartTarget.copy(this.currentMoonPosition);
    this.journeyEndTarget.copy(this.currentMoonPosition).multiplyScalar(AUTO_CAMERA_LOOK_AHEAD);
    this.journeyStartUp.copy(this.journeyCamera.up).normalize();
    this.labUi.classList.add('journey-hidden');
    this.skipJourney.classList.remove('is-hidden');
    this.updateJourney(0);
  }

  private enterSplit(): void {
    this.mode = 'split';
    this.labUi.classList.remove('journey-hidden');
    this.splitLabels.classList.remove('is-hidden');
    this.guideNote.classList.remove('is-hidden');
    this.viewButton.classList.remove('is-hidden');
    this.setSpaceViewMode('free');
    this.resetSpaceView();
    this.snapSpaceCameraToAutoFrame();
    this.observableLitRegion.visible = true;
    this.skipJourney.classList.add('is-hidden');
    this.viewButton.textContent = '하늘만 보기';
    this.isPlaying = true;
    this.updatePlayButton();
    this.resize();
  }

  private updatePlayButton(): void {
    this.playButton.textContent = this.isPlaying ? 'Ⅱ' : '▶';
    this.playButton.setAttribute('aria-label', this.isPlaying ? '시간 일시정지' : '시간 재생');
  }

  private setSpaceViewMode(mode: SpaceViewMode): void {
    this.spaceViewMode = mode;
    const observing = mode === 'observer';
    this.observerHorizon.visible = observing;
    if (observing) {
      this.spaceGuides.visible = false;
      this.earth.visible = false;
    } else {
      this.spaceGuides.visible = true;
      this.earth.visible = true;
    }
    this.guideNote.textContent = observing
      ? '지구에서 보는 방향으로 달의 밝은 모양을 살펴보세요.'
      : '달에서 밝은 부분이 우리가 볼 수 있는 달의 모습이에요.';
  }

  private resetSpaceView(): void {
    this.setSpaceViewMode('free');
    this.alignFreeCameraToMoon();
    this.orbitRadius = 14;
    this.observerCameraBackoff = INITIAL_OBSERVER_CAMERA_BACKOFF;
  }

  private snapSpaceCameraToAutoFrame(): void {
    this.desiredCameraPosition.copy(this.freeCameraDirection)
      .multiplyScalar(this.orbitRadius)
      .add(this.orbitTarget);
    this.desiredLookTarget.copy(this.currentMoonPosition).multiplyScalar(AUTO_CAMERA_LOOK_AHEAD);
    this.spaceCamera.position.copy(this.desiredCameraPosition);
    this.spaceLookTarget.copy(this.desiredLookTarget);
    this.spaceCamera.up.copy(this.freeCameraUp);
    this.spaceCamera.fov = 43;
    this.spaceCamera.updateProjectionMatrix();
    this.spaceCamera.lookAt(this.spaceLookTarget);
  }

  private alignFreeCameraToMoon(): void {
    if (this.currentMoonPosition.lengthSq() < 0.001) {
      this.setFreeCameraFromAngles(0, INITIAL_ORBIT_PITCH);
      return;
    }
    this.autoCameraMoonDirection.copy(this.currentMoonPosition).normalize();
    this.freeCameraDirection.copy(this.autoCameraMoonDirection).multiplyScalar(-Math.cos(AUTO_CAMERA_ELEVATION));
    this.freeCameraDirection.addScaledVector(this.autoCameraWorldUp, Math.sin(AUTO_CAMERA_ELEVATION)).normalize();
    this.freeCameraUp.copy(this.autoCameraMoonDirection);
    this.freeCameraUp.addScaledVector(
      this.freeCameraDirection,
      -this.freeCameraUp.dot(this.freeCameraDirection),
    ).normalize();
    this.freeCameraRight.crossVectors(this.freeCameraUp, this.freeCameraDirection).normalize();
    this.lastTrackedMoonAngle = Math.atan2(this.currentMoonPosition.y, this.currentMoonPosition.x);
  }

  private trackFreeCameraWithMoon(orbitAngle: number): void {
    if (this.lastTrackedMoonAngle === null) {
      this.lastTrackedMoonAngle = orbitAngle;
      return;
    }
    const angleDelta = Math.atan2(
      Math.sin(orbitAngle - this.lastTrackedMoonAngle),
      Math.cos(orbitAngle - this.lastTrackedMoonAngle),
    );
    this.lastTrackedMoonAngle = orbitAngle;
    if (Math.abs(angleDelta) < 1e-8) return;
    this.orbitRotation.setFromAxisAngle(this.autoCameraWorldUp, angleDelta);
    this.freeCameraDirection.applyQuaternion(this.orbitRotation).normalize();
    this.freeCameraUp.applyQuaternion(this.orbitRotation).normalize();
    this.freeCameraRight.crossVectors(this.freeCameraUp, this.freeCameraDirection).normalize();
  }

  private setFreeCameraFromAngles(azimuth: number, pitch: number): void {
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const sinAzimuth = Math.sin(azimuth);
    const cosAzimuth = Math.cos(azimuth);
    this.freeCameraDirection.set(sinAzimuth * cosPitch, sinPitch, cosAzimuth * cosPitch).normalize();
    this.freeCameraUp.set(-sinAzimuth * sinPitch, cosPitch, -cosAzimuth * sinPitch).normalize();
    this.freeCameraRight.crossVectors(this.freeCameraUp, this.freeCameraDirection).normalize();
  }

  private updateSpaceCamera(delta: number): void {
    if (this.mode !== 'split') return;
    if (this.spaceViewMode === 'observer') {
      this.observerCameraAxis.copy(this.currentMoonPosition).normalize();
      this.desiredCameraPosition.copy(this.observerCameraAxis).multiplyScalar(-this.observerCameraBackoff);
      this.desiredLookTarget.copy(this.currentMoonPosition);
      this.spaceCamera.up.set(0, 0, 1);
    } else {
      this.desiredCameraPosition.copy(this.freeCameraDirection).multiplyScalar(this.orbitRadius).add(this.orbitTarget);
      this.desiredLookTarget.copy(this.currentMoonPosition).multiplyScalar(AUTO_CAMERA_LOOK_AHEAD);
      this.spaceCamera.up.copy(this.freeCameraUp);
    }
    const response = this.reducedMotion || this.spaceViewMode === 'observer' ? 1 : 1 - Math.exp(-delta * 7.5);
    this.spaceCamera.position.lerp(this.desiredCameraPosition, response);
    this.spaceLookTarget.lerp(this.desiredLookTarget, response);
    this.spaceCamera.fov = THREE.MathUtils.lerp(this.spaceCamera.fov, this.spaceViewMode === 'observer' ? 56 : 43, response);
    this.spaceCamera.updateProjectionMatrix();
    this.spaceCamera.lookAt(this.spaceLookTarget);
    if (this.spaceViewMode === 'free') {
      const distanceFromEarth = this.spaceCamera.position.length();
      this.earth.visible = distanceFromEarth > EARTH_RADIUS * 1.5;
      this.spaceGuides.visible = distanceFromEarth > 2;
    }
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.introCamera.aspect = width / height;
    this.introCamera.updateProjectionMatrix();
    this.journeyCamera.aspect = width / height;
    this.journeyCamera.updateProjectionMatrix();
    this.updateOrtho(this.skyCamera, this.mode === 'split' && width >= 720 ? width / 2 : width, this.mode === 'split' && width < 720 ? height / 2 : height, 4.5);
    const spaceWidth = this.mode === 'split' && width >= 720 ? width / 2 : width;
    const spaceHeight = this.mode === 'split' && width < 720 ? height / 2 : height;
    this.spaceCamera.aspect = spaceWidth / Math.max(1, spaceHeight);
    this.spaceCamera.updateProjectionMatrix();
    this.positionSkyPhaseName();
  }

  private updateOrtho(camera: THREE.OrthographicCamera, width: number, height: number, halfHeight: number): void {
    const aspect = width / Math.max(1, height);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const cameraHorizontalLength = Math.hypot(this.freeCameraDirection.x, this.freeCameraDirection.y);
    const moonHorizontalLength = Math.hypot(this.currentMoonPosition.x, this.currentMoonPosition.y);
    const autoFrameAlignment = cameraHorizontalLength > 0 && moonHorizontalLength > 0
      ? -(this.freeCameraDirection.x * this.currentMoonPosition.x + this.freeCameraDirection.y * this.currentMoonPosition.y)
        / (cameraHorizontalLength * moonHorizontalLength)
      : 0;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsedDays: this.elapsedDays,
      mode: this.mode,
      isPlaying: this.isPlaying,
      spaceCamera: {
        viewMode: this.spaceViewMode,
        position: this.spaceCamera.position.toArray(),
        target: this.spaceLookTarget.toArray(),
        orbitRadius: this.orbitRadius,
        orbitAzimuth: Math.atan2(this.freeCameraDirection.x, this.freeCameraDirection.z),
        orbitPitch: Math.asin(THREE.MathUtils.clamp(this.freeCameraDirection.y, -1, 1)),
        cameraDirection: this.freeCameraDirection.toArray(),
        moonPosition: this.currentMoonPosition.toArray(),
        autoFrameAlignment,
        observerCameraBackoff: this.observerCameraBackoff,
        cameraUp: this.spaceCamera.up.toArray(),
        redRegionVisible: this.observableLitRegion.visible,
        observerHorizonVisible: this.observerHorizon.visible,
        observerSurfaceGap: this.currentObserverPosition.length() - OBSERVER_FOOT_OFFSET - EARTH_RADIUS,
      },
      spaceLighting: {
        expectedIllumination: this.currentSpaceExpectedIllumination,
        redIllumination: this.currentSpaceRedIllumination,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: this.renderer.getPixelRatio(),
      },
    };
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      setState: (name) => {
        if (name === 'intro') {
          this.mode = 'intro';
          this.introUi.classList.remove('is-hidden');
          this.labUi.classList.add('is-hidden');
        } else if (
          name === 'split'
          || name === 'split-observer'
          || name === 'split-observer-quarter'
          || name === 'split-angled'
          || name === 'split-day16'
          || name === 'split-day21'
          || name === 'split-day22'
          || name === 'split-day27'
        ) {
          this.enterSky();
          this.enterSplit();
          if (name === 'split-observer' || name === 'split-observer-quarter') this.setSpaceViewMode('observer');
          if (name === 'split-observer-quarter') this.elapsedDays = 6 + 15.75 / 24;
          if (name === 'split-day16') this.elapsedDays = 15 + 1.8 / 24;
          if (name === 'split-day21') this.elapsedDays = 20 + 6 / 24;
          if (name === 'split-day22') this.elapsedDays = 21 + 3 / 24;
          if (name === 'split-day27') this.elapsedDays = 26 + 10.7 / 24;
          if (name === 'split-angled') {
            this.setFreeCameraFromAngles(0.72, 0.51);
          }
          this.isPlaying = false;
          this.updatePlayButton();
          this.updateSimulation();
        }
        else {
          this.enterSky();
          if (name === 'sky-day7') this.elapsedDays = 6 + 19 / 24;
          if (name === 'sky-dawn') this.elapsedDays = 7 + 5.5 / 24;
          if (name === 'sky-morning') this.elapsedDays = 7 + 9 / 24;
          if (name === 'sky-evening') this.elapsedDays = 7 + 19 / 24;
          if (name === 'sky-night') this.elapsedDays = 7 + 22 / 24;
          if (name.startsWith('sky-')) {
            this.isPlaying = false;
            this.updatePlayButton();
            this.updateSimulation();
          }
        }
      },
      setTime: (days) => { this.elapsedDays = wrapCycle(days); this.updateSimulation(); },
      setSpaceView: (mode) => this.setSpaceViewMode(mode),
      setSpaceOrbit: (azimuth, pitch, radius = this.orbitRadius) => {
        this.setSpaceViewMode('free');
        this.setFreeCameraFromAngles(azimuth, pitch);
        this.lastTrackedMoonAngle = Math.atan2(this.currentMoonPosition.y, this.currentMoonPosition.x);
        this.orbitRadius = THREE.MathUtils.clamp(radius, FREE_ORBIT_MIN_RADIUS, FREE_ORBIT_MAX_RADIUS);
      },
      setPausedForScreenshot: (paused) => { this.pausedForScreenshot = paused; },
      setReducedMotion: (enabled) => { this.reducedMotion = enabled; },
      hideDebugUi: () => undefined,
    };
  }
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} element.`);
  return element as T;
}

function createMoonModel(texture: THREE.Texture, radius: number, withFace: boolean): MoonModel {
  const root = new THREE.Group();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 48),
    new THREE.MeshStandardMaterial({ map: texture, color: '#fff8de', roughness: 0.94, metalness: 0 }),
  );
  root.add(moon);

  if (withFace) {
    const face = new THREE.Group();
    face.position.z = radius * 0.965;
    const eyeGeometry = new THREE.CircleGeometry(radius * 0.075, 24);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#26303a', depthTest: false });
    for (const x of [-0.27, 0.27]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(x * radius, 0.13 * radius, 0.02);
      eye.scale.y = 1.35;
      face.add(eye);
    }
    const mouthCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.2 * radius, -0.16 * radius, 0.03),
      new THREE.Vector3(0, -0.34 * radius, 0.03),
      new THREE.Vector3(0.2 * radius, -0.16 * radius, 0.03),
    );
    face.add(new THREE.Mesh(new THREE.TubeGeometry(mouthCurve, 20, radius * 0.022, 8, false), eyeMaterial));
    root.add(face);
  }

  const light = new THREE.DirectionalLight('#fff0b6', 3.7);
  const lightTarget = new THREE.Object3D();
  light.target = lightTarget;
  light.position.set(4, 1, 2);
  return { root, light, lightTarget };
}

function createSkyMoonModel(texture: THREE.Texture, radius: number): SkyMoonModel {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uLightDirection: { value: new THREE.Vector3(1, 0, 0) },
      uVisibility: { value: 1 },
    },
    vertexShader: `
      varying vec2 vMoonUv;
      varying vec3 vMoonNormal;
      void main() {
        vMoonUv = uv;
        vMoonNormal = normalize(normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform vec3 uLightDirection;
      uniform float uVisibility;
      varying vec2 vMoonUv;
      varying vec3 vMoonNormal;
      void main() {
        float lightAmount = dot(normalize(vMoonNormal), normalize(uLightDirection));
        float phaseMask = smoothstep(-0.018, 0.025, lightAmount);
        vec3 lunarSurface = texture2D(uTexture, vMoonUv).rgb;
        float softLight = 0.72 + max(lightAmount, 0.0) * 0.28;
        gl_FragColor = vec4(lunarSurface * softLight, phaseMask * uVisibility);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), material));
  return { root, material };
}

function createSkyBackdrop(): SkyBackdrop {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color('#06111f') },
      uBottom: { value: new THREE.Color('#0b1b2e') },
    },
    vertexShader: `varying vec2 vSkyUv; void main(){ vSkyUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vSkyUv;
      uniform vec3 uTop;
      uniform vec3 uBottom;
      void main(){
        float gradient = smoothstep(0.0, 1.0, vSkyUv.y);
        gl_FragColor = vec4(mix(uBottom, uTop, gradient), 1.0);
      }
    `,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), material);
  mesh.position.z = -8;
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return { mesh, material };
}

function createSkyHorizon(): SkyLandscape {
  const group = new THREE.Group();
  const baseMaterial = new THREE.MeshBasicMaterial({ color: '#03080d', toneMapped: false });
  const farMaterial = new THREE.MeshBasicMaterial({ color: '#0a1721', toneMapped: false });
  const nearMaterial = new THREE.MeshBasicMaterial({ color: '#061019', toneMapped: false });
  const detailMaterial = new THREE.MeshBasicMaterial({ color: '#03090f', toneMapped: false });

  const base = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), baseMaterial);
  base.position.set(0, SKY_HORIZON_Y - 6.22, 1.2);

  const farRidge = createLandscapeShape([
    [-20, -0.1], [-17.8, 0.17], [-15.5, 0.08], [-13.1, 0.39], [-10.8, 0.16],
    [-8.4, 0.52], [-5.9, 0.21], [-3.4, 0.46], [-0.8, 0.18], [1.8, 0.38],
    [4.2, 0.15], [6.8, 0.48], [9.2, 0.2], [11.8, 0.42], [14.4, 0.12],
    [17.1, 0.36], [20, 0.08],
  ], farMaterial, 1.28);

  const nearRidge = createLandscapeShape([
    [-20, -0.22], [-17.6, 0.04], [-15.2, -0.08], [-12.7, 0.18], [-10.1, -0.02],
    [-7.5, 0.23], [-4.8, -0.04], [-2.1, 0.2], [0.6, -0.08], [3.3, 0.16],
    [6.1, -0.05], [8.8, 0.22], [11.5, -0.03], [14.2, 0.2], [17, -0.06], [20, 0.12],
  ], nearMaterial, 1.38);

  const details = new THREE.Group();
  const treeData = [[-14.7, 0.12, 0.22], [-11.4, 0.17, 0.18], [-5.1, 0.13, 0.24], [4.9, 0.12, 0.2], [10.7, 0.16, 0.23], [15.2, 0.1, 0.18]];
  for (const [x, ridgeOffset, scale] of treeData) {
    const tree = createDistantTree(detailMaterial, scale);
    tree.position.set(x, SKY_HORIZON_Y + ridgeOffset, 1.49);
    details.add(tree);
  }
  const buildingData = [[-8.8, 0.12, 0.42, 0.22], [7.7, 0.08, 0.48, 0.25], [12.8, 0.05, 0.34, 0.18]];
  for (const [x, ridgeOffset, width, height] of buildingData) {
    const building = new THREE.Mesh(new THREE.PlaneGeometry(width, height), detailMaterial);
    building.position.set(x, SKY_HORIZON_Y + ridgeOffset + height / 2, 1.48);
    details.add(building);
  }

  group.add(base, farRidge, nearRidge, details);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.renderOrder = 10;
      object.frustumCulled = false;
    }
  });
  return { group, baseMaterial, farMaterial, nearMaterial, detailMaterial };
}

function createLandscapeShape(
  ridge: number[][],
  material: THREE.MeshBasicMaterial,
  z: number,
): THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial> {
  const shape = new THREE.Shape();
  shape.moveTo(ridge[0][0], SKY_HORIZON_Y + ridge[0][1]);
  for (let index = 1; index < ridge.length; index += 1) {
    const previous = ridge[index - 1];
    const current = ridge[index];
    const midX = (previous[0] + current[0]) / 2;
    const midY = SKY_HORIZON_Y + (previous[1] + current[1]) / 2;
    shape.quadraticCurveTo(previous[0], SKY_HORIZON_Y + previous[1], midX, midY);
  }
  const last = ridge[ridge.length - 1];
  shape.lineTo(last[0], SKY_HORIZON_Y + last[1]);
  shape.lineTo(last[0], -9);
  shape.lineTo(ridge[0][0], -9);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), material);
  mesh.position.z = z;
  return mesh;
}

function createDistantTree(material: THREE.MeshBasicMaterial, scale: number): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.PlaneGeometry(scale * 0.18, scale * 0.8), material);
  trunk.position.y = scale * 0.4;
  const crown = new THREE.Mesh(new THREE.CircleGeometry(scale * 0.62, 7), material);
  crown.position.y = scale * 0.98;
  crown.scale.y = 1.18;
  group.add(trunk, crown);
  return group;
}

function createMoonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  context.fillStyle = '#b8b5a9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = seededRandom(42);
  for (let index = 0; index < 280; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 2 + random() * 22;
    const shade = Math.floor(105 + random() * 68);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(${shade},${shade},${Math.max(90, shade - 7)},${0.08 + random() * 0.16})`;
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createEarth(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  context.fillStyle = '#2d78ad';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#78a95a';
  const continents = [[80, 75, 52, 30], [210, 150, 70, 42], [340, 80, 95, 34], [425, 170, 42, 22]];
  for (const [x, y, rx, ry] of continents) {
    context.beginPath();
    context.ellipse(x, y, rx, ry, -0.28, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.86, metalness: 0 }),
  );
}

function createSpaceObserver(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'earthObserver';

  const skin = new THREE.MeshBasicMaterial({ color: '#f2b68f', toneMapped: false });
  const jacket = new THREE.MeshBasicMaterial({ color: '#ffd45c', toneMapped: false });
  const trousers = new THREE.MeshBasicMaterial({ color: '#315a8a', toneMapped: false });
  const cap = new THREE.MeshBasicMaterial({ color: '#ef6c66', toneMapped: false });
  const dark = new THREE.MeshBasicMaterial({ color: '#172130', toneMapped: false });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.09, 4, 10), jacket);
  body.position.y = 0.135;
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), skin);
  head.position.y = 0.285;
  root.add(head);

  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.071, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap);
  hat.position.y = 0.31;
  root.add(hat);

  const eyeGeometry = new THREE.CircleGeometry(0.008, 10);
  for (const x of [-0.022, 0.022]) {
    const eye = new THREE.Mesh(eyeGeometry, dark);
    eye.position.set(x, 0.292, 0.061);
    root.add(eye);
  }

  const limbGeometry = new THREE.CylinderGeometry(0.018, 0.022, 0.12, 8);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(limbGeometry, jacket);
    arm.position.set(side * 0.072, 0.145, 0);
    arm.rotation.z = side * 0.42;
    root.add(arm);

    const leg = new THREE.Mesh(limbGeometry, trousers);
    leg.position.set(side * 0.034, 0.025, 0);
    leg.rotation.z = side * 0.2;
    root.add(leg);
  }

  const locationRing = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.125, 28),
    new THREE.MeshBasicMaterial({ color: '#7edcff', transparent: true, opacity: 0.58, side: THREE.DoubleSide, toneMapped: false }),
  );
  locationRing.position.y = 0.004;
  locationRing.rotation.x = Math.PI / 2;
  locationRing.renderOrder = 20;
  root.add(locationRing);
  return root;
}

function createObserverView(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'observerVisibleSky';
  const radius = 4.45;
  const segments = 48;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI;
    shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();

  const sector = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: '#6ed7ff',
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  root.add(sector);

  const boundaryGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(radius, 0, 0),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-radius, 0, 0),
  ]);
  root.add(new THREE.LineSegments(
    boundaryGeometry,
    new THREE.LineBasicMaterial({ color: '#83dcff', transparent: true, opacity: 0.52, depthWrite: false }),
  ));

  const arcPoints = Array.from({ length: segments + 1 }, (_, index) => {
    const angle = (index / segments) * Math.PI;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.01);
  });
  root.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPoints),
    new THREE.LineBasicMaterial({ color: '#83dcff', transparent: true, opacity: 0.2, depthWrite: false }),
  ));
  return root;
}

function createObservableLitRegion(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(-1, 0, 0) },
      uObserverDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uObserverDirection;
      varying vec3 vWorldNormal;
      void main() {
        vec3 normalDirection = normalize(vWorldNormal);
        float receivesSunlight = smoothstep(-0.025, 0.035, dot(normalDirection, normalize(uSunDirection)));
        float facesObserver = smoothstep(-0.025, 0.035, dot(normalDirection, normalize(uObserverDirection)));
        float overlap = receivesSunlight * facesObserver;
        if (overlap < 0.02) discard;
        gl_FragColor = vec4(1.0, 0.08, 0.055, overlap * 0.18);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.468, 64, 48), material);
  mesh.name = 'observableLitRegion';
  mesh.renderOrder = 18;
  return mesh;
}

function createStars(count: number, seed: number): THREE.Points {
  const random = seededRandom(seed);
  const positions: number[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push((random() - 0.5) * 18, (random() - 0.5) * 10, -2 - random() * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#f8f4de', size: 0.045, transparent: true, opacity: 0.88, sizeAttenuation: true }));
}

function createSpaceStars(count: number, seed: number): THREE.Points {
  const random = seededRandom(seed);
  const positions: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const direction = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    const radius = 24 + random() * 12;
    positions.push(direction.x * radius, direction.y * radius, direction.z * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#f8f4de', size: 0.085, transparent: true, opacity: 0.72, sizeAttenuation: true }));
}

function createSpaceLabel(text: string, background: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const font = '700 42px "Noto Sans KR", sans-serif';
  const measurementContext = canvas.getContext('2d');
  if (!measurementContext) throw new Error('Canvas 2D context is unavailable.');
  measurementContext.font = font;
  const textWidth = Math.ceil(measurementContext.measureText(text).width);
  const horizontalPadding = 8;
  const verticalPadding = 5;
  canvas.width = textWidth + horizontalPadding * 2 + 6;
  canvas.height = 42 + verticalPadding * 2 + 6;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');

  context.fillStyle = background;
  context.beginPath();
  context.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 13);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.42)';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = '#fffdf2';
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }));
  const labelHeight = 0.345;
  sprite.scale.set(labelHeight * (canvas.width / canvas.height), labelHeight, 1);
  sprite.renderOrder = 30;
  return sprite;
}

function createSpaceSun(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'spaceSun';
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 40, 28),
    new THREE.MeshBasicMaterial({ color: '#fff0a4', toneMapped: false }),
  ));

  const haloTexture = createSunHaloTexture();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, transparent: true, depthWrite: false, toneMapped: false }));
  halo.scale.set(2.7, 2.7, 1);
  halo.renderOrder = -2;
  group.add(halo);

  return group;
}

function createSunHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  const gradient = context.createRadialGradient(64, 64, 18, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 225, 132, 0.46)');
  gradient.addColorStop(0.45, 'rgba(246, 200, 92, 0.18)');
  gradient.addColorStop(1, 'rgba(246, 200, 92, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createObserverEarthHorizon(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'observerEarthHorizon';

  const atmosphere = new THREE.Mesh(
    new THREE.CircleGeometry(4.32, 128),
    new THREE.MeshBasicMaterial({
      color: '#66d6ff',
      transparent: true,
      opacity: 0.38,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  atmosphere.position.set(0, -6.78, -6.55);
  atmosphere.scale.x = 1.82;
  atmosphere.renderOrder = 98;
  atmosphere.frustumCulled = false;

  const earth = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 128),
    new THREE.MeshBasicMaterial({
      color: '#123d61',
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  earth.position.set(0, -6.82, -6.5);
  earth.scale.x = 1.82;
  earth.renderOrder = 99;
  earth.frustumCulled = false;

  const groundShade = new THREE.Mesh(
    new THREE.CircleGeometry(4.08, 128),
    new THREE.MeshBasicMaterial({
      color: '#071827',
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  groundShade.position.set(0, -6.96, -6.45);
  groundShade.scale.x = 1.82;
  groundShade.renderOrder = 100;
  groundShade.frustumCulled = false;

  group.add(atmosphere, earth, groundShade);
  return group;
}

const SKY_KEYFRAMES = [
  { hour: 0, top: new THREE.Color('#020713'), bottom: new THREE.Color('#081426') },
  { hour: 4, top: new THREE.Color('#071126'), bottom: new THREE.Color('#18243b') },
  { hour: 5.5, top: new THREE.Color('#172944'), bottom: new THREE.Color('#9a6a7d') },
  { hour: 6.5, top: new THREE.Color('#477ba7'), bottom: new THREE.Color('#efb08a') },
  { hour: 8, top: new THREE.Color('#68add7'), bottom: new THREE.Color('#bdd9e8') },
  { hour: 12, top: new THREE.Color('#4e9ed4'), bottom: new THREE.Color('#a9d6ef') },
  { hour: 17, top: new THREE.Color('#5b99c2'), bottom: new THREE.Color('#d4c2bd') },
  { hour: 18.5, top: new THREE.Color('#344b76'), bottom: new THREE.Color('#d27a6c') },
  { hour: 20, top: new THREE.Color('#10182e'), bottom: new THREE.Color('#273452') },
  { hour: 22, top: new THREE.Color('#050b18'), bottom: new THREE.Color('#0a1425') },
  { hour: 24, top: new THREE.Color('#020713'), bottom: new THREE.Color('#081426') },
] as const;

const SKY_SAMPLE = { top: new THREE.Color(), bottom: new THREE.Color() };

function sampleSkyPalette(hourValue: number): { top: THREE.Color; bottom: THREE.Color } {
  const hour = ((hourValue % 24) + 24) % 24;
  for (let index = 0; index < SKY_KEYFRAMES.length - 1; index += 1) {
    const start = SKY_KEYFRAMES[index];
    const end = SKY_KEYFRAMES[index + 1];
    if (hour >= start.hour && hour <= end.hour) {
      const t = (hour - start.hour) / (end.hour - start.hour);
      SKY_SAMPLE.top.copy(start.top).lerp(end.top, t);
      SKY_SAMPLE.bottom.copy(start.bottom).lerp(end.bottom, t);
      return SKY_SAMPLE;
    }
  }
  SKY_SAMPLE.top.copy(SKY_KEYFRAMES[0].top);
  SKY_SAMPLE.bottom.copy(SKY_KEYFRAMES[0].bottom);
  return SKY_SAMPLE;
}

function moonVisibility(hourValue: number): number {
  const hour = ((hourValue % 24) + 24) % 24;
  const keyframes = [
    [0, 1], [3.5, 1], [4.5, 0.78], [5.5, 0.58], [6.5, 0.42],
    [16.5, 0.42], [18, 0.62], [19.5, 1], [24, 1],
  ] as const;
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const [startHour, startOpacity] = keyframes[index];
    const [endHour, endOpacity] = keyframes[index + 1];
    if (hour >= startHour && hour <= endHour) {
      const t = (hour - startHour) / (endHour - startHour);
      const eased = t * t * (3 - 2 * t);
      return THREE.MathUtils.lerp(startOpacity, endOpacity, eased);
    }
  }
  return 1;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}
