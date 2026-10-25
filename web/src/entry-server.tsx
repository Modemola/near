// Build-time rendering of the pages in PRERENDERED (see scripts/prerender.mjs).
// The HTML is each page's first render, before any data arrives, so the
// browser can draw it at once and React then attaches to it in place.
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router-dom/server";
import { WalletProvider } from "./lib/wallet";
import { routes } from "./routes";

export { PRERENDERED } from "./routes";

export async function render(path: string): Promise<string> {
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`http://localhost${path}`));
  if (context instanceof Response) throw new Error(`${path} redirected`);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(
    <StrictMode>
      <WalletProvider>
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </WalletProvider>
    </StrictMode>,
  );
}
