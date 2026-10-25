import { Link } from "react-router-dom";
import { PageHead, useTitle } from "../components/ui";

export function NotFound() {
  useTitle("Not found");
  return (
    <PageHead eyebrow="Not found" title="This page doesn't exist">
      The link may be old or mistyped. <Link viewTransition to="/">See the results</Link> instead.
    </PageHead>
  );
}
