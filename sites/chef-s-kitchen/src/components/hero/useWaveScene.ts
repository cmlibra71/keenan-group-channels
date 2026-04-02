import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildWaveGeometry, type WaveGridConfig } from "./buildWaveGeometry";
import { loadTextureAtlas } from "./loadTextureAtlas";

const WAVE_HEIGHT = 0.35;
const WAVE_SPEED = 0.45;

export function useWaveScene(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onReady: () => void,
  imageCount: number,
  reducedMotion: boolean
) {
  // Store mutable values in refs so they don't trigger re-init
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const imageCountRef = useRef(imageCount);
  imageCountRef.current = imageCount;

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current!;

    let disposed = false;
    let animationId = 0;
    let cleanupFn: (() => void) | null = null;

    async function init() {
      console.log("[hero-wave] init starting, container:", container.clientWidth, "x", container.clientHeight);
      // Renderer
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      // Camera — close overhead
      const fov = 50;
      const aspect = container.clientWidth / container.clientHeight;
      const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
      const camY = 8;
      const camZ = 2;
      camera.position.set(0, camY, camZ);
      camera.lookAt(0, 0, 0);

      // Calculate visible world size at y=0 plane so grid always covers viewport
      const fovRad = (fov * Math.PI) / 180;
      const dist = Math.sqrt(camY * camY + camZ * camZ);
      const visibleHeight = 2 * Math.tan(fovRad / 2) * dist;
      const visibleWidth = visibleHeight * aspect;

      // 2.5x margin — oblique camera angle means far edge of grid is much further
      const cellSize = 1.0;
      const cols = Math.ceil((visibleWidth * 2.5) / cellSize);
      const rows = Math.ceil((visibleHeight * 2.5) / cellSize);

      const gridConfig: WaveGridConfig = {
        cols,
        rows,
        cellSize,
        imageCount: imageCountRef.current,
      };

      // Scene
      const scene = new THREE.Scene();

      // Lights
      const ambient = new THREE.AmbientLight(0x444466, 0.4);
      scene.add(ambient);
      const directional = new THREE.DirectionalLight(0xffffff, 0.8);
      directional.position.set(5, 10, 5);
      scene.add(directional);

      // Load pre-generated texture atlas from /api/hero-atlas
      const { texture, imageCount } = await loadTextureAtlas(
        imageCountRef.current
      );

      console.log("[hero-wave] atlas loaded, imageCount:", imageCount);
      // Bail if unmounted during async load
      if (disposed) {
        texture.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        return;
      }

      gridConfig.imageCount = imageCount;

      // Tile the atlas across the grid
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;

      // Build geometry
      const geometry = buildWaveGeometry(gridConfig);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // State
      let isVisible = true;
      let time = 0;
      let lastTimestamp = performance.now();

      function updateWave(t: number) {
        const { cols, rows, cellSize } = gridConfig;
        const posAttr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        const vertsX = cols + 1;
        const vertsZ = rows + 1;

        for (let rz = 0; rz < vertsZ; rz++) {
          for (let rx = 0; rx < vertsX; rx++) {
            const vi = rz * vertsX + rx;
            const gx = rx * cellSize;
            const gz = rz * cellSize;
            posAttr.array[vi * 3 + 1] =
              Math.sin(gx * 0.3 + t * WAVE_SPEED) * WAVE_HEIGHT +
              Math.sin(gz * 0.4 + t * WAVE_SPEED * 0.7) * WAVE_HEIGHT * 0.6;
          }
        }

        posAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
      }

      function animate(timestamp: number) {
        if (!isVisible) {
          animationId = requestAnimationFrame(animate);
          return;
        }

        const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
        lastTimestamp = timestamp;
        time += delta;

        updateWave(time);

        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      }

      if (reducedMotionRef.current) {
        updateWave(0);
        renderer.render(scene, camera);
      } else {
        animationId = requestAnimationFrame(animate);
      }

      console.log("[hero-wave] scene ready, grid:", gridConfig.cols, "x", gridConfig.rows);
      onReadyRef.current();

      // Resize observer — rebuild geometry when viewport changes
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) return;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);

        // Recalculate grid to cover new aspect ratio
        const newVisibleH = 2 * Math.tan(fovRad / 2) * dist;
        const newVisibleW = newVisibleH * camera.aspect;
        const newCols = Math.ceil((newVisibleW * 1.4) / cellSize);
        const newRows = Math.ceil((newVisibleH * 1.4) / cellSize);

        if (newCols !== gridConfig.cols || newRows !== gridConfig.rows) {
          gridConfig.cols = newCols;
          gridConfig.rows = newRows;

          const newGeometry = buildWaveGeometry(gridConfig);
          mesh.geometry.dispose();
          mesh.geometry = newGeometry;
        }
      });
      resizeObserver.observe(container);

      // Intersection observer — pause when off-screen
      const intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          isVisible = entry.isIntersecting;
        },
        { threshold: 0 }
      );
      intersectionObserver.observe(container);

      cleanupFn = () => {
        cancelAnimationFrame(animationId);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        geometry.dispose();
        material.dispose();
        texture.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    }

    init().catch((err) => console.error("[hero-wave] init failed:", err));

    return () => {
      disposed = true;
      cleanupFn?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);
}
