import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./lib/toasts";
import { WalletProvider } from "./lib/wallet";
import { CertificatePage } from "./pages/CertificatePage";
import { EvalPage } from "./pages/EvalPage";
import { Home } from "./pages/Home";
import { HowPage } from "./pages/HowPage";
import { PublishPage } from "./pages/PublishPage";
import { SetPage } from "./pages/SetPage";
import { NotFound } from "./pages/NotFound";
import { Sets } from "./pages/Sets";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="sets" element={<Sets />} />
            <Route path="sets/:setId" element={<SetPage />} />
            <Route path="evals/:evalId" element={<EvalPage />} />
            <Route path="certificates/:evalId" element={<CertificatePage />} />
            <Route path="publish" element={<PublishPage />} />
            <Route path="how" element={<HowPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </WalletProvider>
  </StrictMode>,
);
