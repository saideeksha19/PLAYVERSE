import * as THREE from 'three';
import { mulberry32 } from './geometry';

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Soft cumulus puff used by every cloud billboard. */
export function createCloudTexture(): THREE.CanvasTexture {
  const canvas = createCanvas(256, 160);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const puffs: Array<[number, number, number]> = [
      [64, 104, 42],
      [112, 84, 54],
      [168, 96, 46],
      [96, 112, 38],
      [146, 114, 40],
      [128, 122, 44],
      [196, 112, 30],
      [40, 116, 28],
    ];

    for (const [x, y, radius] of puffs) {
      const gradient = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,0.98)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Radial glow used by portals and mist. */
export function createGlowTexture(size = 256): THREE.CanvasTexture {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Vertical water streaks with a fading tail — scrolled for the waterfalls. */
export function createWaterfallTexture(seed = 5): THREE.CanvasTexture {
  const canvas = createCanvas(64, 256);
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(seed);

  if (ctx) {
    const vertical = ctx.createLinearGradient(0, 0, 0, 256);
    vertical.addColorStop(0, 'rgba(255,255,255,0.95)');
    vertical.addColorStop(0.62, 'rgba(214,242,255,0.82)');
    vertical.addColorStop(1, 'rgba(214,242,255,0)');
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, 64, 256);

    for (let i = 0; i < 16; i++) {
      const x = rand() * 64;
      const width = 1 + rand() * 3;
      ctx.fillStyle = `rgba(255,255,255,${(0.25 + rand() * 0.45).toFixed(2)})`;
      ctx.fillRect(x, 0, width, 256);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
