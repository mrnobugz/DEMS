/**
 * Procedural 3D mouth (Three.js/WebGL) — the progressive enhancement layer from
 * architecture Section 10.2. Teeth are parametric shapes placed along elliptical
 * arch curves; per-tooth status colors, click-to-select via raycasting, orbit
 * controls, and an optional orthodontic archwire + brackets overlay.
 *
 * Default-exported so it can be code-split behind React.lazy (see Mouth3DLazy).
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { archPoint, archTeeth, toothScale, type Dentition, type ToothDef } from "./teeth";

export type Mouth3DLayers = {
  /** Inferior alveolar nerve canals along the mandible (CS 3D nerve tracing analog). */
  nerves?: boolean;
  /** FDI numbers with a virtual implant fixture. */
  implants?: string[];
  /** FDI numbers treated as extracted (socket, no crown). */
  missing?: string[];
  /** FDI numbers with an endodontic access / canal highlight. */
  endo?: string[];
};

export type Mouth3DProps = {
  dentition?: Dentition;
  /** fill color per FDI tooth */
  colors?: Record<string, string | undefined>;
  selected?: string | null;
  onSelect?: (fdi: string) => void;
  /** render an orthodontic archwire + brackets on these arches */
  wire?: "upper" | "lower" | "both" | null;
  layers?: Mouth3DLayers;
  height?: number;
  autoRotate?: boolean;
};

const ARCH_W = 6.2;
const ARCH_D = 4.4;
const JAW_GAP = 1.15;
const ENAMEL = "#f5f2e9";

function toothMesh(tooth: ToothDef): THREE.Mesh {
  const s = toothScale(tooth.type);
  let geo: THREE.BufferGeometry;
  if (tooth.type === "incisor") {
    geo = new THREE.CylinderGeometry(0.26 * s, 0.2 * s, 0.9, 12);
  } else if (tooth.type === "canine") {
    geo = new THREE.CylinderGeometry(0.16 * s, 0.3 * s, 0.95, 12);
  } else {
    geo = new THREE.CylinderGeometry(0.34 * s, 0.28 * s, 0.8, 14);
  }
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ENAMEL),
    roughness: 0.35,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  if (tooth.type === "incisor") mesh.scale.z = 0.55;
  mesh.userData.fdi = tooth.fdi;
  mesh.userData.baseScaleZ = mesh.scale.z;
  return mesh;
}

function placeTooth(mesh: THREE.Mesh, tooth: ToothDef): void {
  const p = archPoint(tooth.t, ARCH_W, ARCH_D, "down");
  const y = tooth.arch === "upper" ? JAW_GAP : -JAW_GAP;
  // incisors toward the camera (+z)
  mesh.position.set(p.x, y, -p.y);
  if (tooth.arch === "upper") mesh.rotation.x = Math.PI; // crowns face down
  // orient the flattened incisors along the arch tangent
  mesh.rotation.y = (-p.angle * Math.PI) / 180;
}

function gumTube(teeth: ToothDef[], arch: "upper" | "lower"): THREE.Mesh {
  const y = arch === "upper" ? JAW_GAP + 0.42 : -(JAW_GAP + 0.42);
  const points = teeth.map((tooth) => {
    const p = archPoint(tooth.t, ARCH_W, ARCH_D, "down");
    return new THREE.Vector3(p.x, y, -p.y);
  });
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 48, 0.42, 10, false);
  const mat = new THREE.MeshStandardMaterial({ color: "#e8938c", roughness: 0.7 });
  return new THREE.Mesh(geo, mat);
}

function wireGroup(teeth: ToothDef[], arch: "upper" | "lower"): THREE.Group {
  const group = new THREE.Group();
  const y = arch === "upper" ? JAW_GAP - 0.05 : -(JAW_GAP - 0.05);
  const facial = teeth.map((tooth) => {
    const s = toothScale(tooth.type);
    // push outward from the arch centre to sit on the facial surface
    const p = archPoint(tooth.t, ARCH_W + 0.34 * s * 2 + 0.3, ARCH_D + 0.55, "down");
    return new THREE.Vector3(p.x, y, -p.y);
  });
  const curve = new THREE.CatmullRomCurve3(facial);
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 64, 0.035, 8, false),
    new THREE.MeshStandardMaterial({ color: "#c9ced6", metalness: 0.9, roughness: 0.25 }),
  );
  group.add(wire);
  const bracketGeo = new THREE.BoxGeometry(0.16, 0.16, 0.08);
  const bracketMat = new THREE.MeshStandardMaterial({
    color: "#aab2bd",
    metalness: 0.85,
    roughness: 0.3,
  });
  for (const v of facial) {
    const b = new THREE.Mesh(bracketGeo, bracketMat);
    b.position.copy(v);
    b.lookAt(0, v.y, 0);
    group.add(b);
  }
  return group;
}

function nerveCanal(teeth: ToothDef[]): THREE.Group {
  const group = new THREE.Group();
  const molars = teeth.filter((t) => t.arch === "lower" && (t.type === "molar" || t.type === "premolar"));
  if (molars.length < 2) return group;
  const path = molars.map((tooth) => {
    const p = archPoint(tooth.t, ARCH_W * 0.92, ARCH_D * 0.88, "down");
    return new THREE.Vector3(p.x, -JAW_GAP - 0.55, -p.y);
  });
  const curve = new THREE.CatmullRomCurve3(path);
  const mat = new THREE.MeshStandardMaterial({
    color: "#facc15",
    emissive: "#ca8a04",
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.07, 8, false), mat));
  return group;
}

function implantMesh(tooth: ToothDef): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.18, 0.22, 1.15, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: "#9ca3af",
    metalness: 0.92,
    roughness: 0.22,
  });
  const mesh = new THREE.Mesh(geo, mat);
  placeTooth(mesh, tooth);
  // fixture sits in the socket, slightly apical
  mesh.position.y += tooth.arch === "upper" ? 0.15 : -0.15;
  mesh.userData.fdi = tooth.fdi;
  mesh.userData.kind = "implant";
  return mesh;
}

function endoAccess(tooth: ToothDef): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.12, 10, 10);
  const mat = new THREE.MeshStandardMaterial({
    color: "#7c3aed",
    emissive: "#5b21b6",
    emissiveIntensity: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  placeTooth(mesh, tooth);
  mesh.position.y += tooth.arch === "upper" ? -0.55 : 0.55;
  mesh.userData.kind = "endo";
  return mesh;
}

export default function Mouth3D({
  dentition = "permanent",
  colors = {},
  selected,
  onSelect,
  wire = null,
  layers,
  height = 340,
  autoRotate = false,
}: Mouth3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  function applyAppearance() {
    for (const [fdi, mesh] of meshesRef.current) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(colorsRef.current[fdi] ?? ENAMEL);
      const baseZ: number = mesh.userData.baseScaleZ ?? 1;
      if (selectedRef.current === fdi) {
        mat.emissive.set("#0b5fff");
        mat.emissiveIntensity = 0.45;
        mesh.scale.set(1.12, 1.12, 1.12 * baseZ);
      } else {
        mat.emissive.set("#000000");
        mat.emissiveIntensity = 0;
        mesh.scale.set(1, 1, baseZ);
      }
    }
  }

  // Build scene (once per dentition/wire layout)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      host.innerHTML =
        '<p style="font-size:12px;color:#51617a;padding:16px">3D view unavailable — WebGL is not supported on this device. The 2D chart remains fully functional.</p>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 1.4, 10.5);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, 6, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd3ff, 0.5);
    fill.position.set(-5, -2, -6);
    scene.add(fill);

    const { upper, lower } = archTeeth(dentition);
    const missing = new Set(layers?.missing ?? []);
    const implantSites = new Set(layers?.implants ?? []);
    const endoSites = new Set(layers?.endo ?? []);
    const meshes = new Map<string, THREE.Mesh>();
    for (const tooth of [...upper, ...lower]) {
      if (missing.has(tooth.fdi)) continue;
      const mesh = toothMesh(tooth);
      placeTooth(mesh, tooth);
      meshes.set(tooth.fdi, mesh);
      scene.add(mesh);
      if (endoSites.has(tooth.fdi)) scene.add(endoAccess(tooth));
    }
    for (const tooth of [...upper, ...lower]) {
      if (implantSites.has(tooth.fdi)) scene.add(implantMesh(tooth));
    }
    meshesRef.current = meshes;
    applyAppearance();
    scene.add(gumTube(upper, "upper"));
    scene.add(gumTube(lower, "lower"));
    if (wire === "upper" || wire === "both") scene.add(wireGroup(upper, "upper"));
    if (wire === "lower" || wire === "both") scene.add(wireGroup(lower, "lower"));
    if (layers?.nerves) scene.add(nerveCanal(lower));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 5;
    controls.maxDistance = 18;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.2;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt = 0;
    function onPointerDown() {
      downAt = Date.now();
    }
    function onPointerUp(ev: PointerEvent) {
      // ignore drags (orbiting)
      if (Date.now() - downAt > 250) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...meshes.values()]);
      const fdi = hits[0]?.object?.userData?.fdi;
      if (fdi) onSelectRef.current?.(fdi);
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resize = () => {
      const w = host.clientWidth || 300;
      const h = height;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let raf = 0;
    function tick() {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      meshesRef.current = new Map();
    };
  }, [dentition, wire, height, autoRotate, layers?.nerves, layers?.implants?.join("|"), layers?.missing?.join("|"), layers?.endo?.join("|")]);

  // Update colors / selection in place — no scene rebuild
  useEffect(() => {
    applyAppearance();
  }, [colors, selected]);

  return <div ref={hostRef} style={{ width: "100%", height }} aria-label="3D dental model" />;
}
