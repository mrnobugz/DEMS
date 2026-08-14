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
import { MM, crownColor, type CrownPlan } from "./virtualCrown";

export type ImplantPlan = { diameter: number; length: number; angle: number };

export type RenderPreset = "teeth" | "bone" | "transparent";

export type Mouth3DLayers = {
  /** Inferior alveolar nerve canals along the mandible (CS 3D nerve tracing analog). */
  nerves?: boolean;
  /** FDI numbers with a virtual implant fixture. */
  implants?: string[];
  /** FDI numbers treated as extracted (socket, no crown). */
  missing?: string[];
  /** FDI numbers with an endodontic access / canal highlight. */
  endo?: string[];
  /** CS panoramic curve objects (maxilla / mandible / canal arch). */
  maxillaArch?: boolean;
  mandibleArch?: boolean;
  canalArch?: boolean;
  /** Teeth with a traced root canal (MPR tool). */
  canalTeeth?: string[];
  implantPlans?: Record<string, ImplantPlan>;
  /** CS AI / manual virtual crowns (PDIP wax-up). */
  crowns?: Record<string, CrownPlan>;
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
  /** CS 3D rendering preset: enamel, bone, or transparent for canal tracing. */
  preset?: RenderPreset;
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

function nerveCanal(teeth: ToothDef[], canalArch = false): THREE.Group {
  const group = new THREE.Group();
  const molars = teeth.filter((t) => t.arch === "lower" && (t.type === "molar" || t.type === "premolar"));
  if (molars.length < 2) return group;
  const sides = [molars.filter((t) => t.t <= 0.5), molars.filter((t) => t.t >= 0.5)];
  const mat = new THREE.MeshStandardMaterial({
    color: "#facc15",
    emissive: "#ca8a04",
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  for (const side of sides) {
    if (side.length < 2) continue;
    const path = side.map((tooth) => {
      const p = archPoint(tooth.t, ARCH_W * 0.92, ARCH_D * 0.88, "down");
      return new THREE.Vector3(p.x, -JAW_GAP - 0.55, -p.y);
    });
    const curve = new THREE.CatmullRomCurve3(path);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.07, 8, false), mat.clone()));
  }
  if (canalArch && molars.length >= 2) {
    const path = molars.map((tooth) => {
      const p = archPoint(tooth.t, ARCH_W * 0.92, ARCH_D * 0.88, "down");
      return new THREE.Vector3(p.x, -JAW_GAP - 0.72, -p.y);
    });
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 48, 0.035, 6, false),
        new THREE.MeshStandardMaterial({ color: "#eab308", emissive: "#ca8a04", emissiveIntensity: 0.5 }),
      ),
    );
  }
  return group;
}

function archRibbon(teeth: ToothDef[], color: string, y: number): THREE.Mesh {
  const points = teeth.map((tooth) => {
    const p = archPoint(tooth.t, ARCH_W, ARCH_D, "down");
    return new THREE.Vector3(p.x, y, -p.y);
  });
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, 0.045, 6, false),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }),
  );
}

function implantMesh(tooth: ToothDef, plan?: ImplantPlan): THREE.Mesh {
  const r = ((plan?.diameter ?? 4.1) / 4.1) * 0.2;
  const h = ((plan?.length ?? 10) / 10) * 1.15;
  const geo = new THREE.CylinderGeometry(r * 0.9, r, h, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: "#9ca3af",
    metalness: 0.92,
    roughness: 0.22,
  });
  const mesh = new THREE.Mesh(geo, mat);
  placeTooth(mesh, tooth);
  mesh.position.y += tooth.arch === "upper" ? 0.15 : -0.15;
  mesh.rotation.z += ((plan?.angle ?? 0) * Math.PI) / 180;
  mesh.userData.fdi = tooth.fdi;
  mesh.userData.kind = "implant";
  return mesh;
}

function crownMaterial(plan: CrownPlan): THREE.MeshStandardMaterial {
  const metal = plan.material === "ssc" || plan.material === "pfm";
  return new THREE.MeshStandardMaterial({
    color: crownColor(plan.material),
    metalness: metal ? 0.85 : plan.material === "lithium_disilicate" ? 0.08 : 0.18,
    roughness: plan.material === "ssc" ? 0.22 : plan.material === "waxup" ? 0.78 : 0.28,
    transparent: plan.material === "lithium_disilicate",
    opacity: plan.material === "lithium_disilicate" ? 0.92 : 1,
  });
}

function placeCrown(group: THREE.Group, tooth: ToothDef, plan: CrownPlan): void {
  const p = archPoint(tooth.t, ARCH_W, ARCH_D, "down");
  const extrude = plan.extrusion * MM;
  const y =
    tooth.arch === "upper" ? JAW_GAP - 0.02 - extrude * 0.5 : -(JAW_GAP - 0.02) + extrude * 0.5;
  group.position.set(p.x, y, -p.y);
  group.rotation.order = "YXZ";
  group.rotation.y = (-p.angle * Math.PI) / 180 + (plan.rotation * Math.PI) / 180;
  group.rotation.x = (tooth.arch === "upper" ? Math.PI : 0) + (plan.tiltBl * Math.PI) / 180;
  group.rotation.z = (plan.tiltMd * Math.PI) / 180;
}

/** Anatomic virtual crown: tapered body + type-specific occlusal anatomy. */
function crownGroup(tooth: ToothDef, plan: CrownPlan): THREE.Group {
  const group = new THREE.Group();
  const w = plan.md * MM;
  const d = plan.bl * MM;
  const h = Math.max(0.35, (plan.height + plan.extrusion) * MM);
  const mat = crownMaterial(plan);
  const sides = tooth.type === "molar" ? 8 : tooth.type === "incisor" ? 6 : 7;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.46, w * 0.4, h, sides), mat);
  body.scale.z = Math.max(0.45, d / Math.max(0.2, w));
  group.add(body);

  if (plan.material === "pfm") {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.42, w * 0.4, h * 0.22, sides),
      new THREE.MeshStandardMaterial({ color: "#9aa3ad", metalness: 0.92, roughness: 0.2 }),
    );
    collar.position.y = -h * 0.4;
    collar.scale.z = body.scale.z;
    group.add(collar);
  }

  const occlusalY = h / 2 - 0.02;
  if (tooth.type === "molar") {
    const cusp = new THREE.ConeGeometry(w * 0.12, h * 0.18, 6);
    for (const [x, z] of [
      [0.18, 0.16],
      [-0.18, 0.16],
      [0.18, -0.16],
      [-0.18, -0.16],
    ] as const) {
      const m = new THREE.Mesh(cusp, mat);
      m.position.set(x * w, occlusalY, z * d);
      group.add(m);
    }
  } else if (tooth.type === "premolar") {
    const cusp = new THREE.ConeGeometry(w * 0.14, h * 0.2, 6);
    for (const z of [0.2, -0.18]) {
      const m = new THREE.Mesh(cusp, mat);
      m.position.set(0, occlusalY, z * d);
      group.add(m);
    }
  } else if (tooth.type === "canine") {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 0.16, h * 0.28, 6), mat);
    tip.position.y = occlusalY + 0.04;
    group.add(tip);
  } else {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, h * 0.08, d * 0.22), mat);
    edge.position.y = occlusalY;
    group.add(edge);
  }

  placeCrown(group, tooth, plan);
  group.userData.fdi = tooth.fdi;
  group.userData.kind = "crown";
  group.traverse((o) => {
    o.userData.fdi = tooth.fdi;
  });
  return group;
}

function abutmentMesh(tooth: ToothDef, implant?: ImplantPlan): THREE.Mesh {
  const r = ((implant?.diameter ?? 4.1) / 4.1) * 0.12;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.1, 0.28, 10),
    new THREE.MeshStandardMaterial({ color: "#d4d4d8", metalness: 0.9, roughness: 0.2 }),
  );
  placeTooth(mesh, tooth);
  mesh.userData.kind = "abutment";
  return mesh;
}

function canalTraceMesh(tooth: ToothDef): THREE.Mesh {
  const p = archPoint(tooth.t, ARCH_W, ARCH_D, "down");
  const y0 = tooth.arch === "upper" ? JAW_GAP - 0.15 : -(JAW_GAP - 0.15);
  const y1 = tooth.arch === "upper" ? JAW_GAP - 0.9 : -(JAW_GAP - 0.9);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(p.x, y0, -p.y),
    new THREE.Vector3(p.x * 0.98, (y0 + y1) / 2, -p.y * 0.98),
    new THREE.Vector3(p.x * 0.95, y1, -p.y * 0.95),
  ]);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 16, 0.04, 6, false),
    new THREE.MeshStandardMaterial({
      color: "#7c3aed",
      emissive: "#5b21b6",
      emissiveIntensity: 0.55,
    }),
  );
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
  preset = "teeth",
}: Mouth3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const crownsRef = useRef<Map<string, THREE.Group>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const presetRef = useRef(preset);
  presetRef.current = preset;

  function applyAppearance() {
    const p = presetRef.current;
    for (const [fdi, mesh] of meshesRef.current) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const fallback = p === "bone" ? "#d6cbb8" : ENAMEL;
      mat.color.set(colorsRef.current[fdi] ?? fallback);
      mat.transparent = p === "transparent";
      mat.opacity = p === "transparent" ? 0.3 : 1;
      mat.depthWrite = p !== "transparent";
      mat.roughness = p === "bone" ? 0.85 : 0.35;
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
    for (const [fdi, g] of crownsRef.current) {
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = o.material as THREE.MeshStandardMaterial;
        if (selectedRef.current === fdi) {
          mat.emissive.set("#0b5fff");
          mat.emissiveIntensity = 0.35;
        } else {
          mat.emissive.set("#000000");
          mat.emissiveIntensity = 0;
        }
      });
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
    const crowns = layers?.crowns ?? {};
    const extracted = new Set(
      Object.values(crowns)
        .filter((c) => c.extract)
        .map((c) => c.fdi),
    );
    const missing = new Set([...(layers?.missing ?? []), ...extracted]);
    const implantSites = new Set(layers?.implants ?? []);
    const endoSites = new Set(layers?.endo ?? []);
    const canalSites = new Set(layers?.canalTeeth ?? []);
    const plans = layers?.implantPlans ?? {};
    const meshes = new Map<string, THREE.Mesh>();
    const crownGroups = new Map<string, THREE.Group>();
    const clickable: THREE.Object3D[] = [];
    for (const tooth of [...upper, ...lower]) {
      if (missing.has(tooth.fdi)) continue;
      const mesh = toothMesh(tooth);
      placeTooth(mesh, tooth);
      meshes.set(tooth.fdi, mesh);
      scene.add(mesh);
      clickable.push(mesh);
      if (endoSites.has(tooth.fdi) || canalSites.has(tooth.fdi)) scene.add(endoAccess(tooth));
      if (canalSites.has(tooth.fdi)) scene.add(canalTraceMesh(tooth));
    }
    for (const tooth of [...upper, ...lower]) {
      if (implantSites.has(tooth.fdi)) scene.add(implantMesh(tooth, plans[tooth.fdi]));
      const crown = crowns[tooth.fdi];
      if (crown) {
        if (implantSites.has(tooth.fdi)) scene.add(abutmentMesh(tooth, plans[tooth.fdi]));
        const cg = crownGroup(tooth, crown);
        scene.add(cg);
        clickable.push(cg);
        crownGroups.set(tooth.fdi, cg);
      }
    }
    meshesRef.current = meshes;
    crownsRef.current = crownGroups;
    applyAppearance();
    const gumColor = preset === "bone" ? "#9a7a72" : "#e8938c";
    const upperGum = gumTube(upper, "upper");
    const lowerGum = gumTube(lower, "lower");
    (upperGum.material as THREE.MeshStandardMaterial).color.set(gumColor);
    (lowerGum.material as THREE.MeshStandardMaterial).color.set(gumColor);
    if (preset === "transparent") {
      for (const g of [upperGum, lowerGum]) {
        const m = g.material as THREE.MeshStandardMaterial;
        m.transparent = true;
        m.opacity = 0.18;
        m.depthWrite = false;
      }
    }
    scene.add(upperGum);
    scene.add(lowerGum);
    if (wire === "upper" || wire === "both") scene.add(wireGroup(upper, "upper"));
    if (wire === "lower" || wire === "both") scene.add(wireGroup(lower, "lower"));
    if (layers?.nerves || layers?.canalArch) scene.add(nerveCanal(lower, Boolean(layers?.canalArch)));
    if (layers?.maxillaArch) scene.add(archRibbon(upper, "#ef4444", JAW_GAP + 0.08));
    if (layers?.mandibleArch) scene.add(archRibbon(lower, "#f97316", -(JAW_GAP + 0.08)));

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
      const hits = raycaster.intersectObjects(clickable, true);
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
      crownsRef.current = new Map();
    };
  }, [dentition, wire, height, autoRotate, preset, layers?.nerves, layers?.maxillaArch, layers?.mandibleArch, layers?.canalArch, layers?.implants?.join("|"), layers?.missing?.join("|"), layers?.endo?.join("|"), layers?.canalTeeth?.join("|"), JSON.stringify(layers?.implantPlans ?? {}), JSON.stringify(layers?.crowns ?? {})]);

  // Update colors / selection in place — no scene rebuild
  useEffect(() => {
    applyAppearance();
  }, [colors, selected, preset]);

  return <div ref={hostRef} style={{ width: "100%", height }} aria-label="3D dental model" />;
}
