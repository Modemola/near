import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { createBrowserRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { routes } from "./routes";
// Fonts ship with the site (no render-blocking request to another server),
// only the weights and Latin subsets the design uses.
import "@fontsource/fraunces/latin-300.css";
import "@fontsource/fraunces/latin-300-italic.css";
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/fraunces/latin-400-italic.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "./styles.css";

// A data router, so links can use the View Transitions API.
const app = (router: ReturnType<typeof createBrowserRouter>) => (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

const root = document.getElementById("root")!;
if (root.firstElementChild) {
  // Pre-rendered at build time (scripts/prerender.mjs): load this page's code
  // first so the first render matches the HTML, then attach to it in place.
  const lazy = matchRoutes(routes, window.location)?.filter((m) => m.route.lazy) ?? [];
  Promise.all(
    lazy.map(async (m) => Object.assign(m.route, { ...(await m.route.lazy!()), lazy: undefined })),
  ).then(() =>
    hydrateRoot(root, app(createBrowserRouter(routes)), {
      // A mismatch (for example a setting that only the browser knows) is
      // repaired by React re-rendering; only worth a note while developing.
      // Kept on window too, so the build checks can confirm there were none.
      onRecoverableError: (e) => {
        ((window as unknown as { __hydrationErrors?: unknown[] }).__hydrationErrors ??= []).push(String(e));
        if (import.meta.env.DEV) console.warn(e);
      },
    }),
  );
} else {
  createRoot(root).render(app(createBrowserRouter(routes)));
}
