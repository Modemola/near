import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./lib/toasts";
import { WalletProvider } from "./lib/wallet";
import { CertificatePage } from "./pages/CertificatePage";
import { EvalPage } from "./pages/EvalPage";
import { Home } from "./pages/Home";
import { HowPage } from "./pages/HowPage";
import { NotFound } from "./pages/NotFound";
import { PublishPage } from "./pages/PublishPage";
import { SetPage } from "./pages/SetPage";
import { Sets } from "./pages/Sets";
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
      { index: true, element: <Home /> },
      { path: "sets", element: <Sets /> },
      { path: "sets/:setId", element: <SetPage /> },
      { path: "evals/:evalId", element: <EvalPage /> },
      { path: "certificates/:evalId", element: <CertificatePage /> },
      { path: "publish", element: <PublishPage /> },
      { path: "how", element: <HowPage /> },
      { path: "*", element: <NotFound /> },
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
