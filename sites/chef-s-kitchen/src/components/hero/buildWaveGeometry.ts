import * as THREE from "three";

export interface WaveGridConfig {
  cols: number;
  rows: number;
  cellSize: number;
  imageCount: number;
}

const ATLAS_GRID = 5; // 5x5 atlas — must match loadTextureAtlas

/**
 * Builds a shared-vertex triangular mesh.
 * (cols+1) * (rows+1) vertices, 2 triangles per cell.
 * UVs tile the atlas every ATLAS_GRID cells using texture RepeatWrapping.
 * Adjacent triangles share vertices so the surface is watertight — no cracks.
 */
export function buildWaveGeometry(config: WaveGridConfig): THREE.BufferGeometry {
  const { cols, rows, cellSize } = config;

  const vertsX = cols + 1;
  const vertsZ = rows + 1;
  const vertexCount = vertsX * vertsZ;
  const indexCount = cols * rows * 6;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);

  const offsetX = -(cols * cellSize) / 2;
  const offsetZ = -(rows * cellSize) / 2;

  // Vertices — shared grid
  for (let rz = 0; rz < vertsZ; rz++) {
    for (let rx = 0; rx < vertsX; rx++) {
      const vi = rz * vertsX + rx;
      positions[vi * 3] = rx * cellSize + offsetX;
      positions[vi * 3 + 1] = 0;
      positions[vi * 3 + 2] = rz * cellSize + offsetZ;

      // UVs tile the atlas: every ATLAS_GRID cells = 1 full atlas repeat
      uvs[vi * 2] = rx / ATLAS_GRID;
      uvs[vi * 2 + 1] = 1 - rz / ATLAS_GRID;
    }
  }

  // Indices — 2 triangles per cell
  let ii = 0;
  for (let rz = 0; rz < rows; rz++) {
    for (let rx = 0; rx < cols; rx++) {
      const bl = rz * vertsX + rx;
      const br = bl + 1;
      const tl = (rz + 1) * vertsX + rx;
      const tr = tl + 1;

      // Triangle 1: BL → TR → TL
      indices[ii++] = bl;
      indices[ii++] = tr;
      indices[ii++] = tl;
      // Triangle 2: BL → BR → TR
      indices[ii++] = bl;
      indices[ii++] = br;
      indices[ii++] = tr;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.usage = THREE.DynamicDrawUsage;
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  return geometry;
}
