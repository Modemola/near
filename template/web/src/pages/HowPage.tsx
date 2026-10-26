import type React from "react";
import { Link } from "react-router-dom";
import { GlassCube, Reveal } from "../components/motion";
import { PageHead, Panel, useTitle } from "../components/ui";

/** The explainer: three promises, then the steps, then the trust model in plain words. */
export function HowPage() {
  useTitle("How it works");
  return (
    <>
      <PageHead eyebrow="How it works" title={<>Simple to use, <em>easy to check</em></>} art={<GlassCube />}>
        A two-sentence summary for someone who reads nothing else on this page.
      </PageHead>
      <div className="points">
        {[
          ["1", "First promise", "What the user can rely on, and why."],
          ["2", "Second promise", "What stays private, or safe, and how."],
          ["3", "Third promise", "What anyone can verify for themselves."],
        ].map(([n, t, p]) => (
          <div key={n}>
            <span className="n">{n}</span>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 400, margin: "0.95rem 0 0.5rem" }}>{t}</h2>
            <p>{p}</p>
          </div>
        ))}
      </div>
      <section className="split">
        <Reveal>
          <Panel eyebrow="Step by step" title="What happens when you use it">
            <ol className="flow">
              {[
                ["You do the first thing", "One sentence."],
                ["The product does its work", "One sentence on the part that makes it trustworthy."],
                ["You get the result", "One sentence, and where to find it."],
                ["Anyone can check it", "One sentence on how."],
              ].map(([t, p], i) => (
                <li key={t} style={{ "--i": i } as React.CSSProperties}>
                  <strong>{t}</strong>
                  <p>{p}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </Reveal>
        <aside className="stack">
          <Panel className="quiet" eyebrow="What you have to trust">
            <p className="small" style={{ margin: 0, color: "var(--ink-secondary)" }}>
              Be specific: what is trusted, why, and what is not. Judges reward honesty about limits.
            </p>
          </Panel>
          <Panel className="quiet" eyebrow="Ready?">
            <Link viewTransition className="btn block" to="/new">
              Get started
            </Link>
          </Panel>
        </aside>
      </section>
    </>
  );
}
