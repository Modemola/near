import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { SealedCube } from "../components/motion";
import { PageHead, Panel } from "../components/ui";
import { config } from "../lib/config";

export function HowPage() {
  return (
    <>
      <PageHead eyebrow="How it works" title={<>A fair exam, <em>proved</em></>} art={<SealedCube />}>
        A score you can trust needs three things: the model never saw the test, nobody changed the answers, and anyone
        can check the result. Here is how Proctor gets each one.
      </PageHead>

      <section className="split" style={{ marginTop: 0 }}>
        <div className="stack">
          <Panel eyebrow="Step by step" title="From sealed test to result">
            <ol className="flow">
              <li style={{ "--i": 0 } as CSSProperties}>
                <strong>Someone publishes a test</strong>
                <p>
                  A fraud team, say, collects scam and real messages and seals them on their own computer. Only one
                  open-source grader program can open the seal, and only inside secure hardware.
                </p>
              </li>
              <li style={{ "--i": 1 } as CSSProperties}>
                <strong>Someone asks for a model to be certified</strong>
                <p>They pay the test's price plus a refundable deposit for the grading.</p>
              </li>
              <li style={{ "--i": 2 } as CSSProperties}>
                <strong>The grader runs the exam in secure hardware</strong>
                <p>
                  It opens the test, checks its fingerprint, and shows each message to the model, which also runs in
                  secure hardware. Nobody outside can see the messages or the answers.
                </p>
              </li>
              <li style={{ "--i": 3 } as CSSProperties}>
                <strong>The model signs every answer</strong>
                <p>
                  The hardware the model runs on signs each answer together with the exact question. The grader sends
                  back only totals and those signatures, never the messages.
                </p>
              </li>
              <li style={{ "--i": 4 } as CSSProperties}>
                <strong>NEAR checks it all and records the result</strong>
                <p>
                  The Proctor contract on NEAR checks every signature before counting it, records the result for good,
                  and pays the test's author.
                </p>
              </li>
            </ol>
          </Panel>

          <Panel eyebrow="Read results fairly" title="Limits, stated plainly">
            <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-secondary)" }}>
              <li>
                Only models running in secure hardware can be tested. Sending a private test to any other model would
                show it to the model's provider.
              </li>
              <li>
                A signature proves which model gave an answer. That the grader scored it honestly rests on its
                published code and the hardware's proof that this exact code ran.
              </li>
              <li>
                Many runs on the same test could slowly reveal it, so each model gets only a few certifications per
                test and only totals are published.
              </li>
              <li>AI answers vary between runs, so every result combines several runs and shows the range.</li>
              <li>
                A result speaks for one test. Our demo test was written for this project and checked by hand; anyone
                can bring their own.
              </li>
            </ul>
          </Panel>
        </div>

        <aside className="stack">
          <Panel eyebrow="Who you trust" title="And who you don't">
            <dl className="rows">
              <div>
                <dt>Intel TDX and NVIDIA secure GPUs</dt>
                <dd>trusted</dd>
              </div>
              <div>
                <dt>The open-source grader</dt>
                <dd>checkable</dd>
              </div>
              <div>
                <dt>The model's signing key</dt>
                <dd>from its attestation</dd>
              </div>
              <div>
                <dt>Proctor's team</dt>
                <dd>not needed</dd>
              </div>
              <div>
                <dt>Model makers</dt>
                <dd>not needed</dd>
              </div>
              <div>
                <dt>Server operators</dt>
                <dd>not needed</dd>
              </div>
            </dl>
          </Panel>
          <Panel eyebrow="Built on NEAR" title="The parts">
            <p className="small" style={{ color: "var(--ink-secondary)", margin: 0 }}>
              <strong>OutLayer</strong> runs the grader in an Intel TDX enclave and holds the sealed test.{" "}
              <strong>NEAR AI Cloud</strong> serves the models on secure GPUs and signs their answers. The{" "}
              <strong>Proctor contract</strong> on NEAR checks every signature, keeps the results and pays authors.
            </p>
          </Panel>
          <Panel className="quiet">
            <p className="small" style={{ margin: 0 }}>
              Read the code, tests and design notes at <a href={config.sourceUrl}>{config.sourceUrl.replace("https://", "")}</a>,
              or <Link viewTransition to="/">see the results</Link>.
            </p>
          </Panel>
        </aside>
      </section>
    </>
  );
}
