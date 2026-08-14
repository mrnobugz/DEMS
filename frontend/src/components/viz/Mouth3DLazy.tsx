/**
 * Code-split entry for the 3D mouth: three.js loads as a separate chunk only
 * when a page actually shows the 3D view (progressive enhancement).
 */

import { Suspense, lazy, useState } from "react";
import type { Mouth3DProps } from "./Mouth3D";

const Mouth3D = lazy(() => import("./Mouth3D"));

export function Mouth3DLazy(props: Mouth3DProps & { title?: string }) {
  const { title, ...rest } = props;
  const [enabled, setEnabled] = useState(false);
  const height = rest.height ?? 340;

  if (!enabled) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40"
        style={{ minHeight: height }}
      >
        <p className="text-sm font-semibold text-brand-900">{title ?? "3D view"}</p>
        <p className="max-w-xs text-center text-xs text-muted">
          Interactive WebGL model — rotate, zoom, and tap a tooth to select it.
        </p>
        <button type="button" className="btn-primary text-xs" onClick={() => setEnabled(true)}>
          Load 3D view
        </button>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center rounded-2xl bg-brand-50/40 text-xs text-muted"
          style={{ minHeight: height }}
        >
          Loading 3D engine…
        </div>
      }
    >
      <Mouth3D {...rest} />
    </Suspense>
  );
}
