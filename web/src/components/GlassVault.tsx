import { useEffect, useRef, useState } from "react";
import { reducedMotion, SealedCube } from "./motion";

const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

/** The sealed test in real 3D, with the CSS cube as the fallback while loading or without WebGL. */
export function GlassVault() {
  const host = useRef<HTMLDivElement>(null);
  const [gl, setGl] = useState(false);
  useEffect(() => {
    if (reducedMotion() || !hasWebGL() || !host.current) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("../lib/vault3d")
      .then(({ mountVault }) => {
        if (cancelled || !host.current) return;
        cleanup = mountVault(host.current);
        setGl(true);
      })
      .catch(() => setGl(false));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
  return (
    <div className={`vault${gl ? " gl" : ""}`} role="img" aria-label="A sealed test, readable only inside secure hardware">
      <div className="vault-gl" ref={host} aria-hidden="true" />
      {!gl && <SealedCube label="" />}
      <div className="vault-floor" aria-hidden="true" />
    </div>
  );
}
