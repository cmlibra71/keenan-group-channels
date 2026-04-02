import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildWaveGeometry, type WaveGridConfig } from "./buildWaveGeometry";
import { loadTextureAtlas } from "./loadTextureAtlas";

const WAVE_HEIGHT = 0.35;
const WAVE_SPEED = 0.45;
const CAMERA_EASE = 0.02;

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
      // Responsive grid size — large enough to fill viewport from overhead camera
      const isTablet = window.innerWidth < 1024;
      const gridConfig: WaveGridConfig = {
        cols: isTablet ? 14 : 20,
        rows: isTablet ? 10 : 12,
        cellSize: 1.2,
        imageCount: imageCountRef.current,
      };

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

      // Camera
      const camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        0.1,
        100
      );
      camera.position.set(0, 14, 3);
      camera.lookAt(0, 0, 0);

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
      const mouse = { x: 0, y: 0 };
      const cameraTarget = { x: 0, y: 0 };
      let lastTimestamp = performance.now();

      const totalCols = gridConfig.cols;
      const posAttr = geometry.getAttribute(
        "position"
      ) as THREE.BufferAttribute;

      function updateWave(t: number) {
        const { rows, cellSize } = gridConfig;

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < totalCols; col++) {
            const cellIndex = row * totalCols + col;
            const baseVertex = cellIndex * 4;

            const gx = col * cellSize;
            const gz = row * cellSize;

            const waveX = Math.sin(gx * 0.3 + t * WAVE_SPEED) * WAVE_HEIGHT;
            const waveZ =
              Math.sin(gz * 0.4 + t * WAVE_SPEED * 0.7) * WAVE_HEIGHT * 0.6;
            const y = waveX + waveZ;

            for (let v = 0; v < 4; v++) {
              posAttr.array[(baseVertex + v) * 3 + 1] = y;
            }
          }
        }

        posAttr.needsUpdate = true;
        geometry.computeVertexNormals();
      }

      function onMouseMove(e: MouseEvent) {
        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }
      container.addEventListener("mousemove", onMouseMove);

      function animate(timestamp: number) {
        if (!isVisible) {
          animationId = requestAnimationFrame(animate);
          return;
        }

        const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
        lastTimestamp = timestamp;
        time += delta;

        updateWave(time);

        cameraTarget.x = mouse.x * 1.5;
        cameraTarget.y = mouse.y * 0.8;
        camera.position.x +=
          (cameraTarget.x - camera.position.x) * CAMERA_EASE;
        camera.position.y +=
          (14 + cameraTarget.y - camera.position.y) * CAMERA_EASE;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      }

      if (reducedMotionRef.current) {
        updateWave(0);
        renderer.render(scene, camera);
      } else {
        animationId = requestAnimationFrame(animate);
      }

      onReadyRef.current();

      // Resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
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
        container.removeEventListener("mousemove", onMouseMove);
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

    init();

    return () => {
      disposed = true;
      cleanupFn?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);
}
