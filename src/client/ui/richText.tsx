import { createElement, Fragment, type ReactNode } from "react";

/**
 * RICH TEXT — the little formatting language the CMS body fields speak.
 *
 * The admin stores plain strings in content.json, so emphasis travels as
 * markers inside the string rather than as HTML: `**bold**`, `*italic*`,
 * `__underline__`, and a real newline for a line break. Nothing here ever
 * builds markup from author text — the markers only decide which React element
 * wraps a slice of that text — so a CMS field can never inject HTML.
 *
 * The rules, kept deliberately dumb so an author can predict them:
 *  - longest marker wins at any position (`**` before `*`; `_` alone is NOT a
 *    marker, so snake_case survives),
 *  - a marker closes at the next occurrence of the same marker ON THE SAME LINE,
 *  - anything that does not close, and anything that closes empty (`****`),
 *    renders as the literal characters the author typed,
 *  - no nesting: inside a marked span every other marker is just a character.
 *
 * renderRich is total: any string in, a sensible node out, never a throw. A
 * string with nothing to format comes back as itself, so a field without
 * markers renders byte-identically to how it did before this existed.
 */

type Mark = { mark: string; tag: "strong" | "em" | "u" };
// order matters: longest first, and that is the whole of the precedence rule
const MARKS: Mark[] = [
  { mark: "**", tag: "strong" },
  { mark: "__", tag: "u" },
  { mark: "*", tag: "em" },
];

type Seg = string | { tag: Mark["tag"]; text: string };

/** Split one line into plain runs and marked spans. */
function segments(line: string): Seg[] {
  const out: Seg[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  while (i < line.length) {
    const m = MARKS.find((x) => line.startsWith(x.mark, i));
    if (m) {
      const from = i + m.mark.length;
      const close = line.indexOf(m.mark, from);
      // close > from keeps `****` (an empty span) out — it falls through and
      // the stars are copied across one at a time as literal text
      if (close > from) {
        flush();
        out.push({ tag: m.tag, text: line.slice(from, close) });
        i = close + m.mark.length;
        continue;
      }
    }
    buf += line[i];
    i += 1;
  }
  flush();
  return out;
}

/** True when the string holds anything renderRich would actually change —
 *  used by the admin to decide whether a preview is worth showing. */
export function hasMarkup(text: string): boolean {
  return typeof text === "string" && (text.includes("*") || text.includes("__") || text.includes("\n"));
}

/** Render a CMS string with its markers applied. Drop this around any body
 *  field the admin edits as a paragraph: `{renderRich(c.body)}`. It emits its
 *  own <br/>s, so the render site must NOT also set whiteSpace: "pre-line". */
export function renderRich(text: string): ReactNode {
  if (typeof text !== "string" || text === "") return "";
  if (!hasMarkup(text)) return text; // the common case: hand back the very same string
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, li) => {
    if (li > 0) nodes.push(createElement("br", { key: `b${li}` }));
    segments(line).forEach((seg, si) => {
      // plain strings need no key; only the elements do
      if (typeof seg === "string") nodes.push(seg);
      else nodes.push(createElement(seg.tag, { key: `${li}.${si}` }, seg.text));
    });
  });
  return createElement(Fragment, null, ...nodes);
}
