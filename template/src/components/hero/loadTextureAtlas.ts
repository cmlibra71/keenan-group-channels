import * as THREE from "three";

const GRID = 5; // Must match the API route's grid

export interface AtlasResult {
  texture: THREE.Texture;
  imageCount: number;
}

/**
 * Loads the pre-generated hero atlas from /api/hero-atlas.
 * The atlas is built server-side, cached in S3, and served as a single image.
 */
export function loadTextureAtlas(imageCount: number): Promise<AtlasResult> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      "/api/hero-atlas",
      (texture) => {
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve({ texture, imageCount });
      },
      undefined,
      (err) => reject(err)
    );
  });
}

/** Get UV coordinates for a cell given its image index */
export function getAtlasUVs(imageIndex: number, totalImages: number) {
  const idx = imageIndex % totalImages;
  const col = idx % GRID;
  const row = Math.floor(idx / GRID);

  const u0 = col / GRID;
  const v0 = 1 - (row + 1) / GRID; // Flip Y for Three.js UV convention
  const u1 = (col + 1) / GRID;
  const v1 = 1 - row / GRID;

  return { u0, v0, u1, v1 };
}
