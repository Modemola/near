import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { WalletProvider } from "./lib/wallet";
import { CertificatePage } from "./pages/CertificatePage";
import { EvalPage } from "./pages/EvalPage";
import { Home } from "./pages/Home";
import { HowPage } from "./pages/HowPage";
import { PublishPage } from "./pages/PublishPage";
import { SetPage } from "./pages/SetPage";
import { Sets } from "./pages/Sets";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
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
            <Route path="*" element={<p>Page not found.</p>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  </StrictMode>,
);
