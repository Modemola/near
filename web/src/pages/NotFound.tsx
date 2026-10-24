import { Link } from "react-router-dom";
import { PageHead } from "../components/ui";

export function NotFound() {
  return (
    <PageHead eyebrow="Not found" title="This page doesn't exist">
      The link may be old or mistyped. <Link to="/">See the results</Link> instead.
    </PageHead>
  );
}
