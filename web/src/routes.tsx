import type { RouteObject } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./lib/toasts";
import { Home } from "./pages/Home";

// Shared by the browser and the build-time pre-renderer (entry-server.tsx).
export const routes: RouteObject[] = [
  {
    // Notifications live inside the router: their messages contain links.
    element: (
      <ToastProvider>
        <Layout />
      </ToastProvider>
    ),
    children: [
      // The landing page ships with the app; every other page loads its own
      // code when it's first visited.
      { index: true, element: <Home /> },
      { path: "sets", lazy: async () => ({ Component: (await import("./pages/Sets")).Sets }) },
      { path: "sets/:setId", lazy: async () => ({ Component: (await import("./pages/SetPage")).SetPage }) },
      { path: "evals/:evalId", lazy: async () => ({ Component: (await import("./pages/EvalPage")).EvalPage }) },
      { path: "certificates/:evalId", lazy: async () => ({ Component: (await import("./pages/CertificatePage")).CertificatePage }) },
      { path: "publish", lazy: async () => ({ Component: (await import("./pages/PublishPage")).PublishPage }) },
      { path: "how", lazy: async () => ({ Component: (await import("./pages/HowPage")).HowPage }) },
      { path: "*", lazy: async () => ({ Component: (await import("./pages/NotFound")).NotFound }) },
    ],
  },
];

/** Pages that read nothing from the chain before their first render, so they can be pre-rendered. */
export const PRERENDERED: Record<string, string> = {
  "/": "Proctor: independent results for AI scam filters",
  "/sets": "Tests · Proctor",
  "/publish": "Publish a test · Proctor",
  "/how": "How it works · Proctor",
};
