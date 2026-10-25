import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./lib/toasts";
import { WalletProvider } from "./lib/wallet";
import { Home } from "./pages/Home";
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
const router = createBrowserRouter([
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
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
      <RouterProvider router={router} />
    </WalletProvider>
  </StrictMode>,
);
