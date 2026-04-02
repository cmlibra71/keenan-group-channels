import * as THREE from "three";
import { getAtlasUVs } from "./loadTextureAtlas";

export interface WaveGridConfig {
  cols: number;
  rows: number;
  cellSize: number;
  imageCount: number;
}

export function buildWaveGeometry(config: WaveGridConfig): THREE.BufferGeometry {
  const { cols, rows, cellSize, imageCount } = config;

  const vertexCount = cols * rows * 4;
  const indexCount = cols * rows * 6;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(indexCount);

  let vi = 0;
  let ii = 0;

  const offsetX = -(cols * cellSize) / 2;
  const offsetZ = -(rows * cellSize) / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellSize + offsetX;
      const z0 = row * cellSize + offsetZ;
      const x1 = x0 + cellSize;
      const z1 = z0 + cellSize;

      // Distribute images across the grid — each cell gets a different image
      // Use a prime-based shuffle so adjacent cells don't get the same image
      const imgIdx = ((row * cols + col) * 7) % Math.max(imageCount, 1);
      const { u0, v0, u1, v1 } = getAtlasUVs(imgIdx, Math.max(imageCount, 1));

      const baseVertex = vi;

      // BL
      positions[vi * 3] = x0;
      positions[vi * 3 + 1] = 0;
      positions[vi * 3 + 2] = z1;
      uvs[vi * 2] = u0;
      uvs[vi * 2 + 1] = v0;
      normals[vi * 3 + 1] = 1;
      vi++;

      // BR
      positions[vi * 3] = x1;
      positions[vi * 3 + 1] = 0;
      positions[vi * 3 + 2] = z1;
      uvs[vi * 2] = u1;
      uvs[vi * 2 + 1] = v0;
      normals[vi * 3 + 1] = 1;
      vi++;

      // TR
      positions[vi * 3] = x1;
      positions[vi * 3 + 1] = 0;
      positions[vi * 3 + 2] = z0;
      uvs[vi * 2] = u1;
      uvs[vi * 2 + 1] = v1;
      normals[vi * 3 + 1] = 1;
      vi++;

      // TL
      positions[vi * 3] = x0;
      positions[vi * 3 + 1] = 0;
      positions[vi * 3 + 2] = z0;
      uvs[vi * 2] = u0;
      uvs[vi * 2 + 1] = v1;
      normals[vi * 3 + 1] = 1;
      vi++;

      indices[ii++] = baseVertex;
      indices[ii++] = baseVertex + 1;
      indices[ii++] = baseVertex + 2;
      indices[ii++] = baseVertex;
      indices[ii++] = baseVertex + 2;
      indices[ii++] = baseVertex + 3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.usage = THREE.DynamicDrawUsage;
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  return geometry;
}
