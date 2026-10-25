import { useEffect, useRef, useState } from "react";
import { reducedMotion, SealedCube } from "./motion";

/**
 * Real 3D only where it runs well: a desktop pointer, a wide screen, and a
 * hardware GPU. Phones, small screens and software renderers (which draw on
 * the CPU and would make the page sluggish) get the light CSS cube instead.
 */
export function canRunVault(): boolean {
  if (!window.matchMedia("(pointer: fine) and (min-width: 900px)").matches) return false;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !/swiftshader|llvmpipe|software|softpipe/i.test(renderer);
  } catch {
    return false;
  }
}

/** The sealed test in real 3D, with the CSS cube as the fallback while loading or without WebGL. */
export function GlassVault() {
  const host = useRef<HTMLDivElement>(null);
  const [gl, setGl] = useState(false);
  useEffect(() => {
    if (reducedMotion() || !canRunVault() || !host.current) return;
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
