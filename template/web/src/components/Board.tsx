import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Item } from "../lib/data";
import { Bar } from "./ui";

/**
 * A ranked list, best first. Whole rows are clickable (data-cursor shows
 * "View" on desktop); on narrow boxes, rows stack (a container query in CSS).
 */
export function Board({ items, label }: { items: Item[]; label: string }) {
  return (
    <div className="board" role="table" aria-label={label}>
      <div className="board-row head label" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Name</span>
        <span role="columnheader">Measure A</span>
        <span role="columnheader">Measure B</span>
        <span role="columnheader">Overall</span>
        <span role="columnheader">
          <span className="sr-only">Open</span>
        </span>
      </div>
      {items.map((it, i) => (
        <div key={it.id} className={`board-row${i === 0 ? " first" : ""}`} role="row" data-cursor="View" style={{ "--i": i } as CSSProperties}>
          <span className="rank" role="cell">
            {i + 1}
          </span>
          <span className="model" role="cell">
            {it.name}
            <small>{it.summary}</small>
          </span>
          <span className="metric m-a" role="cell">
            <span className="m-label label">Measure A</span>
            <span className="v">{it.a}%</span>
            <Bar value={it.a} delay={0.3 + i * 0.1} />
          </span>
          <span className="metric m-b" role="cell">
            <span className="m-label label">Measure B</span>
            <span className="v">{it.b}%</span>
            <Bar value={it.b} inverse delay={0.3 + i * 0.1} />
          </span>
          <span className="metric overall" role="cell">
            <span className="m-label label">Overall</span>
            <span className="v">{it.score.toFixed(1)}%</span>
          </span>
          <span className="go" role="cell">
            <Link viewTransition to={`/items/${it.id}`}>
              See details<span className="sr-only"> for {it.name}</span>
            </Link>
          </span>
        </div>
      ))}
    </div>
  );
}
