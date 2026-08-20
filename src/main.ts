import './styles.css';
import { MoonLab } from './MoonLab';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

const app = new MoonLab(canvas);
app.start();

if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
