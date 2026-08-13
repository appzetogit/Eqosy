import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const NEON = {
  orange: 0xff8a00,
  cyan: 0x35c7ff,
  green: 0x4fe08a,
  pink: 0xff18c8,
  violet: 0x9b5cff,
};

export default function SectionScene({
  variant = "orbs",
  className = "",
}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer = null;
    let scene = null;
    let camera = null;

    try {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(
        50,
        Math.max(mount.clientWidth, 1) / Math.max(mount.clientHeight, 1),
        0.1,
        100
      );
      camera.position.set(0, 0, 14);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, failIfMajorPerformanceCaveat: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);
    } catch {
      return;
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const l1 = new THREE.PointLight(NEON.orange, 260, 60);
    l1.position.set(6, 5, 8);
    scene.add(l1);
    const l2 = new THREE.PointLight(NEON.cyan, 220, 60);
    l2.position.set(-7, -4, 7);
    scene.add(l2);

    const group = new THREE.Group();
    scene.add(group);

    const spinners = [];

    if (variant === "grid") {
      const grid = new THREE.GridHelper(60, 40, NEON.orange, NEON.cyan);
      grid.material.transparent = true;
      grid.material.opacity = 0.25;
      grid.position.y = -4;
      group.add(grid);

      const colors = [NEON.orange, NEON.cyan, NEON.green, NEON.pink];
      for (let i = 0; i < 10; i++) {
        const geo = i % 2 === 0 ? new THREE.BoxGeometry(0.7, 0.7, 0.7) : new THREE.OctahedronGeometry(0.55);
        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            color: colors[i % colors.length],
            emissive: new THREE.Color(colors[i % colors.length]),
            emissiveIntensity: 0.55,
            metalness: 0.8,
            roughness: 0.25,
          })
        );
        mesh.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
        group.add(mesh);
        spinners.push(mesh);
      }
    } else {
      const colors = [NEON.orange, NEON.cyan, NEON.green, NEON.pink];
      for (let i = 0; i < 6; i++) {
        const c = colors[i % colors.length];
        const orb = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.7 + Math.random() * 0.5, 2),
          new THREE.MeshStandardMaterial({
            color: c,
            emissive: new THREE.Color(c),
            emissiveIntensity: 0.4,
            metalness: 0.9,
            roughness: 0.2,
            wireframe: i % 2 === 0,
          })
        );
        orb.position.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
        group.add(orb);
        spinners.push(orb);
      }
    }

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight || !camera || !renderer) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    let visible = true;
    const vo = new IntersectionObserver(
      ([e]) => {
        visible = !!e?.isIntersecting;
      },
      { rootMargin: "200px" }
    );
    vo.observe(mount);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visible || !renderer || !scene || !camera) return;
      const t = clock.getElapsedTime();

      spinners.forEach((m, i) => {
        m.rotation.x = t * (0.15 + i * 0.02);
        m.rotation.y = t * (0.2 + i * 0.015);
        m.position.y += Math.sin(t * 0.8 + i) * 0.003;
      });

      group.rotation.y = Math.sin(t * 0.15) * 0.2;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      vo.disconnect();
      if (scene) {
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            const m = obj.material;
            Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose();
          }
        });
      }
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      }
    };
  }, [variant]);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
    />
  );
}
