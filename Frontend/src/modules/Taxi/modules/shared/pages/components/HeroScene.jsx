import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const BRAND = {
  orange: 0xff7a00,
  cyan: 0x0284c7,
  green: 0x16a34a,
  yellow: 0xf59e0b,
  red: 0xef4444,
};

export default function HeroScene({ onReady }) {
  const mountRef = useRef(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const isMobile = window.innerWidth < 768;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let scene = null;
    let camera = null;
    let renderer = null;

    try {
      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xf8fafc, 0.012);

      camera = new THREE.PerspectiveCamera(
        40,
        Math.max(mount.clientWidth, 1) / Math.max(mount.clientHeight, 1),
        0.1,
        220
      );
      camera.position.set(0, 6, 28);
      camera.lookAt(0, 1, 0);

      renderer = new THREE.WebGLRenderer({
        antialias: !isMobile,
        alpha: true,
        failIfMajorPerformanceCaveat: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
    } catch (e) {
      readyRef.current?.();
      return;
    }

    const world = new THREE.Group();
    scene.add(world);

    // Ambient & Accent Lights
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));

    const orangeLight = new THREE.PointLight(BRAND.orange, 350, 70);
    orangeLight.position.set(10, 14, 10);
    scene.add(orangeLight);

    const blueLight = new THREE.PointLight(BRAND.cyan, 300, 70);
    blueLight.position.set(-10, 8, 12);
    scene.add(blueLight);

    const greenLight = new THREE.PointLight(BRAND.green, 250, 60);
    greenLight.position.set(4, -4, 10);
    scene.add(greenLight);

    // 1. CURVED S-ROAD WITH TAXI & DELIVERY SCOOTER
    const roadCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-14, -4, 2),
      new THREE.Vector3(-5, -3, -1),
      new THREE.Vector3(2, -2.2, 0),
      new THREE.Vector3(9, -1.8, 3),
      new THREE.Vector3(16, -1, -2),
    ]);

    const roadPoints = roadCurve.getPoints(80);
    const roadLineGeo = new THREE.BufferGeometry().setFromPoints(roadPoints);
    const roadLineMat = new THREE.LineBasicMaterial({
      color: BRAND.cyan,
      linewidth: 3,
      transparent: true,
      opacity: 0.7,
    });
    const roadLine = new THREE.Line(roadLineGeo, roadLineMat);
    world.add(roadLine);

    // Taxi Mesh
    const taxiGroup = new THREE.Group();
    world.add(taxiGroup);

    const taxiBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 0.9),
      new THREE.MeshStandardMaterial({
        color: BRAND.yellow,
        metalness: 0.5,
        roughness: 0.2,
      })
    );
    taxiBody.position.y = 0.3;
    taxiGroup.add(taxiBody);

    const taxiRoof = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.45, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 })
    );
    taxiRoof.position.set(-0.08, 0.7, 0);
    taxiGroup.add(taxiRoof);

    const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 12);
    wheelGeo.rotateX(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    [
      [0.45, 0.2, 0.45],
      [0.45, 0.2, -0.45],
      [-0.45, 0.2, 0.45],
      [-0.45, 0.2, -0.45],
    ].forEach(([wx, wy, wz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx, wy, wz);
      taxiGroup.add(w);
    });

    // Delivery Scooter Mesh
    const scooterGroup = new THREE.Group();
    world.add(scooterGroup);

    const scooterBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.4, 0.45),
      new THREE.MeshStandardMaterial({ color: BRAND.orange, metalness: 0.6, roughness: 0.3 })
    );
    scooterBody.position.y = 0.28;
    scooterGroup.add(scooterBody);

    const deliveryBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.55),
      new THREE.MeshStandardMaterial({
        color: BRAND.green,
        roughness: 0.3,
      })
    );
    deliveryBox.position.set(-0.35, 0.65, 0);
    scooterGroup.add(deliveryBox);

    // 2. FLOATING 3D APP ELEMENTS (Glowing Rings & Floating Treats)
    const floatingItems = [];

    // Floating Ring 1 (Food Orange)
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.08, 16, 40),
      new THREE.MeshStandardMaterial({
        color: BRAND.orange,
        emissive: BRAND.orange,
        emissiveIntensity: 0.4,
        roughness: 0.2,
      })
    );
    ring1.position.set(12, 4.5, 1);
    world.add(ring1);
    floatingItems.push({ mesh: ring1, speedY: 0.7, speedR: 0.4, baseY: 4.5 });

    // Floating Ring 2 (Taxi Blue)
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.06, 16, 40),
      new THREE.MeshStandardMaterial({
        color: BRAND.cyan,
        emissive: BRAND.cyan,
        emissiveIntensity: 0.4,
        roughness: 0.2,
      })
    );
    ring2.position.set(-11, 3.5, 0);
    world.add(ring2);
    floatingItems.push({ mesh: ring2, speedY: 0.9, speedR: -0.5, baseY: 3.5 });

    // Floating Ring 3 (Grocery Green)
    const ring3 = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.05, 16, 32),
      new THREE.MeshStandardMaterial({
        color: BRAND.green,
        emissive: BRAND.green,
        emissiveIntensity: 0.4,
        roughness: 0.2,
      })
    );
    ring3.position.set(13, -1, 3);
    world.add(ring3);
    floatingItems.push({ mesh: ring3, speedY: 0.6, speedR: 0.3, baseY: -1 });

    // 3. COLORFUL AMBIENT FLOATING ORBS & PARTICLES
    const dustCount = isMobile ? 80 : 160;
    const pos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 20 - 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        size: 0.1,
        color: BRAND.cyan,
        transparent: true,
        opacity: 0.45,
      })
    );
    world.add(dust);

    // Pointer Interaction
    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (e) => {
      pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove);

    let scrollY = 0;
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight || !camera || !renderer) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    let visible = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
      },
      { threshold: 0 }
    );
    io.observe(mount);

    const clock = new THREE.Clock();
    let frame = 0;
    let signalled = false;
    let taxiT = 0;
    let scooterT = 0.45;

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      if (!signalled) {
        signalled = true;
        readyRef.current?.();
      }
      if (!visible || !renderer || !scene || !camera) return;

      camera.position.y = 6 + scrollY * 0.004;
      camera.position.z = 28 + scrollY * 0.006;
      camera.lookAt(0, 1 - scrollY * 0.002, 0);

      if (!reduced) {
        taxiT = (taxiT + dt * 0.12) % 1;
        const taxiPos = roadCurve.getPointAt(taxiT);
        const taxiTangent = roadCurve.getTangentAt(taxiT);
        taxiGroup.position.copy(taxiPos);
        taxiGroup.lookAt(taxiPos.clone().add(taxiTangent));

        scooterT = (scooterT + dt * 0.16) % 1;
        const scPos = roadCurve.getPointAt(scooterT);
        const scTangent = roadCurve.getTangentAt(scooterT);
        scooterGroup.position.copy(scPos).add(new THREE.Vector3(0, 0, 0.35));
        scooterGroup.lookAt(scPos.clone().add(scTangent));

        floatingItems.forEach((item) => {
          item.mesh.position.y = item.baseY + Math.sin(t * item.speedY) * 0.2;
          item.mesh.rotation.x = t * item.speedR;
          item.mesh.rotation.y = t * item.speedR * 0.8;
        });

        world.rotation.y = Math.sin(t * 0.04) * 0.03 + pointerX * 0.04;
        world.rotation.x = pointerY * 0.02;
        dust.rotation.y = t * 0.01;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      if (scene) {
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
            obj.geometry?.dispose();
            const m = obj.material;
            if (m) Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose();
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
  }, []);

  return <div ref={mountRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />;
}
