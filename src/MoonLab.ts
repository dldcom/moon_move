import * as THREE from 'three';
import { daylightAmount, formatKoreanTime, getLunarMoment, wrapCycle } from './astronomy';

type Mode = 'intro' | 'sky' | 'journey' | 'split';

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

const SKY_NIGHT = new THREE.Color('#06111f');
const PLAYBACK_DAYS_PER_SECOND = 1 / 6;
const SKY_HORIZON_Y = -2.35;
const SKY_MOON_ALTITUDE_RANGE = 5.1;
const SPACE_MOON_ORBIT_RADIUS = 3.15;
const EARTH_RADIUS = 0.78;
const OBSERVER_SURFACE_RADIUS = 0.86;

export class MoonLab {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly introScene = new THREE.Scene();
  private readonly skyScene = new THREE.Scene();
  private readonly spaceScene = new THREE.Scene();
  private readonly introCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  private readonly skyCamera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 50);
  private readonly spaceCamera = new THREE.OrthographicCamera(-7, 7, 4.5, -4.5, 0.1, 50);
  private readonly journeyCamera = new THREE.PerspectiveCamera(46, 1, 0.1, 50);
  private readonly introMoon: MoonModel;
  private readonly skyMoon: SkyMoonModel;
  private readonly spaceMoon: THREE.Mesh;
  private readonly earth: THREE.Mesh;
  private readonly spaceSun: THREE.Group;
  private readonly spaceObserver: THREE.Group;
  private readonly observerView: THREE.Group;
  private readonly sunLabel: THREE.Sprite;
  private readonly earthLabel: THREE.Sprite;
  private readonly moonLabel: THREE.Sprite;
  private readonly observerLabel: THREE.Sprite;
  private readonly skyStars: THREE.Points;
  private readonly introStars: THREE.Points;
  private readonly skyBackdrop: SkyBackdrop;
  private readonly skyHorizon: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly moonTexture: THREE.CanvasTexture;
  private readonly resizeObserver: ResizeObserver;

  private mode: Mode = 'intro';
  private elapsedDays = 2 + 19 / 24;
  private isPlaying = true;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private frameId = 0;
  private lastTime = performance.now();
  private frame = 0;
  private introElapsed = 0;
  private journeyElapsed = 0;
  private pausedForScreenshot = false;
  private disposed = false;

  private readonly introUi = required<HTMLElement>('intro');
  private readonly labUi = required<HTMLElement>('lab-ui');
  private readonly dialogueText = required<HTMLParagraphElement>('dialogue-text');
  private readonly startButton = required<HTMLButtonElement>('start-button');
  private readonly dateLabel = required<HTMLElement>('date-label');
  private readonly timeLabel = required<HTMLElement>('time-label');
  private readonly phaseLabel = required<HTMLElement>('phase-label');
  private readonly slider = required<HTMLInputElement>('time-slider');
  private readonly playButton = required<HTMLButtonElement>('play-button');
  private readonly viewButton = required<HTMLButtonElement>('view-button');
  private readonly splitLabels = required<HTMLElement>('split-labels');
  private readonly guideNote = required<HTMLElement>('guide-note');
  private readonly skipJourney = required<HTMLButtonElement>('skip-journey');

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
    addMoonRotationMarker(this.spaceMoon);
    this.earth = createEarth();
    this.spaceSun = createSpaceSun();
    this.spaceObserver = createSpaceObserver();
    this.observerView = createObserverView();
    this.sunLabel = createSpaceLabel('태양', '#5c4616');
    this.earthLabel = createSpaceLabel('지구', '#174a68');
    this.moonLabel = createSpaceLabel('달', '#4b4a45');
    this.observerLabel = createSpaceLabel('관측자', '#18536a');
    this.skyStars = createStars(180, 19);
    this.introStars = createStars(110, 7);
    this.skyBackdrop = createSkyBackdrop();
    this.skyHorizon = createSkyHorizon();

    this.setupScenes();
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
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.renderer.dispose();
    this.moonTexture.dispose();
    delete window.__THREE_GAME_DIAGNOSTICS__;
    delete window.__THREE_GAME_TEST_HOOKS__;
  }

  private setupScenes(): void {
    this.introCamera.position.set(0, 0, 7.3);
    this.skyCamera.position.set(0, 0, 12);
    this.spaceCamera.position.set(-1, 0, 14);
    this.introScene.background = SKY_NIGHT.clone();
    this.skyScene.background = null;
    this.spaceScene.background = new THREE.Color('#050b15');

    this.introScene.add(this.introStars, this.introMoon.root, this.introMoon.light, this.introMoon.lightTarget);
    this.skyScene.add(this.skyBackdrop.mesh, this.skyStars, this.skyMoon.root, this.skyHorizon);

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
    this.spaceScene.add(
      this.spaceSun,
      orbit,
      this.observerView,
      this.earth,
      this.spaceMoon,
      this.spaceObserver,
      this.sunLabel,
      this.earthLabel,
      this.moonLabel,
      this.observerLabel,
      new THREE.AmbientLight('#4e6682', 0.045),
    );
    this.sunLabel.position.set(-5.45, -1.35, 0.95);
    this.earthLabel.position.set(0, 1.35, 0.95);
  }

  private bindUi(): void {
    this.startButton.addEventListener('click', () => this.enterSky());
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
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.mode === 'intro' || this.mode === 'journey') return;
    event.preventDefault();
    this.isPlaying = false;
    this.elapsedDays = wrapCycle(this.elapsedDays + event.deltaY * 0.003);
    this.updatePlayButton();
    this.updateUi();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.mode === 'intro' || this.mode === 'journey') return;
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
        this.elapsedDays = wrapCycle(this.elapsedDays + delta * PLAYBACK_DAYS_PER_SECOND);
      }
      if (this.mode === 'journey') this.updateJourney(delta);
    }

    this.updateSimulation();
    this.render();
    this.publishDiagnostics();
    this.frameId = requestAnimationFrame(this.tick);
  };

  private updateIntro(delta: number): void {
    this.introElapsed += delta;
    const first = '안녕? 나는 달이야.';
    const second = '나는 날짜가 바뀔 때마다 모양이 변하지! 어떻게 변하는지 보여줄까?';
    const firstStart = 0.6;
    const firstEnd = firstStart + first.length * 0.085;
    const secondStart = firstEnd + 0.8;
    const secondEnd = secondStart + second.length * 0.06;

    let text = '';
    if (this.reducedMotion) {
      text = second;
    } else if (this.introElapsed >= secondStart) {
      text = second.slice(0, Math.floor((this.introElapsed - secondStart) / 0.06));
    } else if (this.introElapsed >= firstStart) {
      text = first.slice(0, Math.floor((this.introElapsed - firstStart) / 0.085));
    }
    if (this.dialogueText.textContent !== text) this.dialogueText.textContent = text;

    const finished = this.reducedMotion || this.introElapsed > secondEnd + 0.2;
    this.startButton.disabled = !finished;
    this.startButton.classList.toggle('is-ready', finished);

    const phaseProgress = this.reducedMotion ? 0.48 : THREE.MathUtils.clamp((this.introElapsed - secondStart) / Math.max(0.1, secondEnd - secondStart), 0.04, 0.96);
    const angle = phaseProgress * Math.PI * 2;
    this.introMoon.light.position.set(Math.sin(angle) * 6, 1.2, -Math.cos(angle) * 6);
    this.introMoon.root.rotation.y = Math.sin(this.introElapsed * 0.7) * 0.035;
    this.introMoon.root.position.y = Math.sin(this.introElapsed * 1.25) * 0.06 + 0.65;
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
    this.skyHorizon.material.color.copy(palette.bottom).multiplyScalar(0.38);
    const starsMaterial = this.skyStars.material as THREE.PointsMaterial;
    starsMaterial.opacity = Math.pow(1 - daylight, 1.8) * 0.9;

    this.spaceMoon.position.set(spaceMoonX, spaceMoonY, 0);
    this.spaceMoon.rotation.z = orbitAngle + Math.PI;
    this.moonLabel.position.set(spaceMoonX, spaceMoonY - 0.78, 0.95);

    this.earth.rotation.z = observerAngle;
    this.spaceObserver.position.set(observerX, observerY, 0.82);
    this.spaceObserver.rotation.z = observerAngle - Math.PI / 2;
    this.observerLabel.position.set(observerX * 1.48, observerY * 1.48, 1.05);
    this.observerView.position.set(observerX, observerY, -0.82);
    this.observerView.rotation.z = observerAngle - Math.PI / 2;
    this.spaceSun.rotation.z = moment.cycleDay * 0.08;
    this.slider.value = String(moment.cycleDay);
    this.updateUi(moment);
  }

  private updateUi(moment = getLunarMoment(this.elapsedDays)): void {
    this.dateLabel.textContent = `음력 ${moment.lunarDay}일`;
    this.timeLabel.textContent = formatKoreanTime(moment.hour);
    this.phaseLabel.textContent = moment.phaseName;
    this.phaseLabel.classList.toggle('is-empty', !moment.phaseName);
  }

  private updateJourney(delta: number): void {
    this.journeyElapsed += delta;
    const duration = this.reducedMotion ? 0.25 : 4.5;
    const t = easeInOutCubic(Math.min(1, this.journeyElapsed / duration));
    const moonPosition = this.spaceMoon.position;
    const start = new THREE.Vector3(moonPosition.x * 0.18, moonPosition.y * 0.18, 1.22);
    const end = new THREE.Vector3(0, 0, 11.5);
    this.journeyCamera.position.lerpVectors(start, end, t);
    const target = moonPosition.clone().lerp(new THREE.Vector3(0, 0, 0), t);
    this.journeyCamera.lookAt(target);
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
    this.skipJourney.classList.add('is-hidden');
    this.viewButton.textContent = '우주에서도 살펴볼까?';
    this.isPlaying = true;
    this.updatePlayButton();
    this.resize();
  }

  private beginJourney(): void {
    this.mode = 'journey';
    this.isPlaying = false;
    this.journeyElapsed = 0;
    this.labUi.classList.add('journey-hidden');
    this.skipJourney.classList.remove('is-hidden');
    this.updateJourney(0);
  }

  private enterSplit(): void {
    this.mode = 'split';
    this.labUi.classList.remove('journey-hidden');
    this.splitLabels.classList.remove('is-hidden');
    this.guideNote.classList.remove('is-hidden');
    this.guideNote.textContent = '빛 받은 쪽만 밝아요 · 시야 안의 달만 하늘에 보여요';
    this.skipJourney.classList.add('is-hidden');
    this.viewButton.textContent = '하늘만 볼까?';
    this.isPlaying = true;
    this.updatePlayButton();
    this.resize();
  }

  private updatePlayButton(): void {
    this.playButton.textContent = this.isPlaying ? 'Ⅱ' : '▶';
    this.playButton.setAttribute('aria-label', this.isPlaying ? '시간 일시정지' : '시간 재생');
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
    this.updateOrtho(this.spaceCamera, this.mode === 'split' && width >= 720 ? width / 2 : width, this.mode === 'split' && width < 720 ? height / 2 : height, 6.25);
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
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsedDays: this.elapsedDays,
      mode: this.mode,
      isPlaying: this.isPlaying,
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
        } else if (name === 'split') {
          this.enterSky();
          this.enterSplit();
          this.isPlaying = false;
          this.updatePlayButton();
          this.updateSimulation();
        }
        else {
          this.enterSky();
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

function createSkyHorizon(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const height = 12;
  const geometry = new THREE.PlaneGeometry(40, height);
  const material = new THREE.MeshBasicMaterial({ color: '#03080d', toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, SKY_HORIZON_Y - height / 2, 1.2);
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  return mesh;
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

function addMoonRotationMarker(moon: THREE.Mesh): void {
  const marker = new THREE.Mesh(
    new THREE.CircleGeometry(0.075, 20),
    new THREE.MeshBasicMaterial({ color: '#69675f', transparent: true, opacity: 0.86, depthWrite: false }),
  );
  marker.name = 'moonRotationMarker';
  marker.position.set(0.18, 0.12, 0.445);
  moon.add(marker);
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
    new THREE.RingGeometry(0.15, 0.18, 28),
    new THREE.MeshBasicMaterial({ color: '#7edcff', transparent: true, opacity: 0.76, side: THREE.DoubleSide, toneMapped: false }),
  );
  locationRing.position.y = 0.13;
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

function createSunDisc(radius: number): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color: '#fff0a4' })));
  const halo = new THREE.Mesh(new THREE.RingGeometry(radius * 1.12, radius * 1.8, 48), new THREE.MeshBasicMaterial({ color: '#ffd57a', transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  group.add(halo);
  return group;
}

function createSpaceLabel(text: string, background: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');

  context.fillStyle = background;
  context.beginPath();
  context.roundRect(10, 10, 236, 76, 30);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.42)';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = '#fffdf2';
  context.font = '700 42px "Noto Sans KR", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 128, 50);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }));
  sprite.scale.set(0.92, 0.345, 1);
  sprite.renderOrder = 30;
  return sprite;
}

function createSpaceSun(): THREE.Group {
  const group = createSunDisc(0.72);
  group.name = 'spaceSun';

  const rayPoints: THREE.Vector3[] = [];
  const rayCount = 40;
  for (let index = 0; index < rayCount; index += 1) {
    const angle = (index / rayCount) * Math.PI * 2;
    const innerRadius = 0.92 + (index % 3) * 0.04;
    const outerRadius = 7.8 + (index % 5) * 0.28;
    rayPoints.push(
      new THREE.Vector3(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius, -0.9),
      new THREE.Vector3(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius, -0.9),
    );
  }
  const rays = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(rayPoints),
    new THREE.LineBasicMaterial({ color: '#f6d675', transparent: true, opacity: 0.16, depthWrite: false }),
  );
  rays.name = 'radialSunlight';
  group.add(rays);

  for (const scale of [1.35, 1.62]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72 * scale, 0.76 * scale, 48), new THREE.MeshBasicMaterial({ color: '#f6c85c', transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
    group.add(ring);
  }
  group.add(new THREE.PointLight('#fff3c4', 3.4, 0, 0));
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
