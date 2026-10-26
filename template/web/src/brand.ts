/**
 * Everything that names the product, in one place. Change these first; the
 * header, footer, page titles and pre-rendered HTML all read from here.
 */
export const brand = {
  name: "Atlas",
  /** The home page's <title>, also used in link previews. */
  title: "Atlas: one plain sentence saying what it does",
  /** Footer line. */
  tagline: "Atlas. One sentence on what it does and for whom.",
  sourceUrl: "https://github.com/you/your-repo",
  /** Header links, in order. `end` marks the home link. */
  nav: [
    { to: "/", label: "Overview", end: true },
    { to: "/items", label: "Explore" },
    { to: "/how", label: "How it works" },
    { to: "/new", label: "Create" },
  ],
  /**
   * A notice chip in the header, for example while the data is simulated.
   * Set to null when everything shown is real.
   */
  notice: {
    chip: "Demo",
    text: "You are looking at sample data. It shows how the product works; it is not a real result.",
  } as { chip: string; text: string } | null,
};
