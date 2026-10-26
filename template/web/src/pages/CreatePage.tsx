import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead, Panel, useTitle } from "../components/ui";
import { data } from "../lib/data";
import { friendlyError, isCancel } from "../lib/errors";
import { useToasts } from "../lib/toasts";

type Form = { id: string; name: string; summary: string };
const EMPTY: Form = { id: "", name: "", summary: "" };
const EXAMPLE: Form = { id: "my-first-item", name: "My first item", summary: "A short description of what it is." };

/** Problems with the form, in plain words, keyed by field. Shown as you type. */
function check(f: Form): Partial<Record<keyof Form, string>> {
  const p: Partial<Record<keyof Form, string>> = {};
  if (!f.id) p.id = "Choose an id.";
  else if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(f.id)) p.id = "Use 2 to 41 lowercase letters, digits or dashes.";
  if (!f.name.trim()) p.name = "Give it a name.";
  if (f.summary.length > 160) p.summary = `Keep it under 160 characters (${f.summary.length} now).`;
  return p;
}

/** A form that validates as you type, fills an example without overwriting, and reports each step. */
export function CreatePage() {
  useTitle("Create");
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const toasts = useToasts();
  const navigate = useNavigate();
  const problems = check(form);
  const shown = (k: keyof Form) => (touched[k] ? problems[k] : undefined);
  const update = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setTouched((t) => ({ ...t, [k]: true }));
  };
  const field = (k: keyof Form) => ({
    "aria-invalid": !!shown(k),
    "aria-describedby": `${k}-help`,
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
  });
  // Only empty fields are filled, so nothing typed is lost.
  const fillExample = () => setForm((f) => ({ id: f.id || EXAMPLE.id, name: f.name || EXAMPLE.name, summary: f.summary || EXAMPLE.summary }));

  const submit = async () => {
    setTouched({ id: true, name: true, summary: true });
    if (Object.keys(problems).length) return;
    setBusy(true);
    const step = toasts.start(`Creating ${form.name}`);
    try {
      step("Working");
      const item = await data.create(form);
      step("Done", "It's live. Opening it now.");
      navigate(`/items/${item.id}`, { viewTransition: true });
    } catch (e) {
      const msg = friendlyError(e);
      step(isCancel(msg) ? "Cancelled" : "Failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead eyebrow="Create" title={<>Add yours in <em>a minute</em></>}>
        One sentence on what creating one does, and what the person gets.
      </PageHead>
      <section className="split" style={{ marginTop: 0 }}>
        <div className="stack">
          <Panel eyebrow="Step 1" title="Describe it" sub="Everything here can be changed later, except the id.">
            <div className="grid cols-2" style={{ gap: "0 1rem" }}>
              <label className="field">
                <span>Id</span>
                <input type="text" value={form.id} onChange={update("id")} placeholder="my-first-item" {...field("id")} />
                {shown("id") ? <small id="id-help" className="bad">{shown("id")}</small> : <small id="id-help">Used in links. Can't be changed later.</small>}
              </label>
              <label className="field">
                <span>Name</span>
                <input type="text" value={form.name} onChange={update("name")} placeholder="My first item" {...field("name")} />
                <small id="name-help" className={shown("name") ? "bad" : ""}>
                  {shown("name") ?? "What people will see."}
                </small>
              </label>
            </div>
            <label className="field">
              <span>Summary</span>
              <textarea rows={2} value={form.summary} onChange={update("summary")} placeholder="A short description" {...field("summary")} />
              <small id="summary-help" className={shown("summary") ? "bad" : ""}>
                {shown("summary") ?? "Optional, one sentence."}
              </small>
            </label>
            <button type="button" className="btn secondary small" onClick={fillExample}>
              Try it with an example
            </button>
          </Panel>
        </div>
        <aside className="stack">
          <Panel className="glass" eyebrow="Step 2" title="Create it">
            <dl className="rows">
              <div>
                <dt>Id</dt>
                <dd>{form.id || "Not set"}</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{form.name || "Not set"}</dd>
              </div>
              <div className="total">
                <dt>Cost</dt>
                <dd>Free</dd>
              </div>
            </dl>
            <button className="btn block" style={{ marginTop: "1rem" }} onClick={submit} disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
            <p className="risk">What happens next, and anything that can't be undone, said before the click.</p>
          </Panel>
        </aside>
      </section>
    </>
  );
}
