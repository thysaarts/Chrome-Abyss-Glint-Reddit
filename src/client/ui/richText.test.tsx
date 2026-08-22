import { describe, expect, it } from "vitest";
import { isValidElement, Fragment, type ReactNode } from "react";
import { renderRich } from "./richText";

/* The suite runs in plain node — no DOM, no react-dom — so we assert on the
 * element tree renderRich hands back rather than on rendered HTML. `ser` walks
 * that tree into a compact string ("a <strong>b</strong>") which reads like the
 * markup a player would get, and blows up on anything unexpected so a silent
 * shape change can't slip through. */
function ser(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(ser).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    if (node.type === Fragment) return ser(props.children);
    if (typeof node.type !== "string") throw new Error("unexpected component in rich text");
    if (node.type === "br") return "<br/>";
    return `<${node.type}>${ser(props.children)}</${node.type}>`;
  }
  throw new Error("unexpected node in rich text: " + String(node));
}

const r = (s: string) => ser(renderRich(s));

describe("renderRich — plain text", () => {
  it("passes an unmarked line through untouched", () => {
    expect(r("Bank early, bank often.")).toBe("Bank early, bank often.");
  });
  it("hands back the raw string when there is nothing to do", () => {
    // the control case: a CMS field with no markers must render exactly as it
    // did before, so no site gains a stray wrapper or line break
    expect(renderRich("Bank early, bank often.")).toBe("Bank early, bank often.");
  });
  it("survives the empty string", () => {
    expect(r("")).toBe("");
  });
  it("keeps punctuation the markers share a keyboard with", () => {
    expect(r("snake_case and 100% and a - dash")).toBe("snake_case and 100% and a - dash");
  });
});

describe("renderRich — markers", () => {
  it("bolds **…**", () => {
    expect(r("a **bold** b")).toBe("a <strong>bold</strong> b");
  });
  it("italicises *…*", () => {
    expect(r("a *slant* b")).toBe("a <em>slant</em> b");
  });
  it("underlines __…__", () => {
    expect(r("a __under__ b")).toBe("a <u>under</u> b");
  });
  it("takes ** before * so bold never reads as two italics", () => {
    expect(r("**bold**")).toBe("<strong>bold</strong>");
  });
  it("carries two markers in one line", () => {
    expect(r("**bold** then *slant*")).toBe("<strong>bold</strong> then <em>slant</em>");
  });
  it("carries all three in one line", () => {
    expect(r("**b** *i* __u__")).toBe("<strong>b</strong> <em>i</em> <u>u</u>");
  });
  it("marks a whole line", () => {
    expect(r("__all of it__")).toBe("<u>all of it</u>");
  });
});

describe("renderRich — the ways authors get it wrong", () => {
  it("renders an unclosed ** literally", () => {
    expect(r("**bold")).toBe("**bold");
  });
  it("renders an unclosed * literally", () => {
    expect(r("6*4")).toBe("6*4");
  });
  it("renders an unclosed __ literally", () => {
    expect(r("__under")).toBe("__under");
  });
  it("renders empty markers literally", () => {
    expect(r("****")).toBe("****");
    expect(r("**")).toBe("**");
    expect(r("____")).toBe("____");
  });
  it("keeps a stray marker inside a marked span literal (no nesting)", () => {
    expect(r("**a*b**")).toBe("<strong>a*b</strong>");
  });
  it("never swallows text it could not parse", () => {
    // ** wins at the front, the leftover * is just a character — odd-looking,
    // but every character the author typed still reaches the player
    expect(r("*** three ***")).toBe("<strong>* three </strong>*");
  });
  it("does not carry a marker across a line break", () => {
    expect(r("**open\nclose**")).toBe("**open<br/>close**");
  });
});

describe("renderRich — line breaks", () => {
  it("breaks on \\n", () => {
    expect(r("one\ntwo")).toBe("one<br/>two");
  });
  it("keeps a blank line as its own break", () => {
    expect(r("one\n\ntwo")).toBe("one<br/><br/>two");
  });
  it("marks up across several lines", () => {
    expect(r("**title**\nbody *here*")).toBe("<strong>title</strong><br/>body <em>here</em>");
  });
  it("normalises CRLF", () => {
    expect(r("one\r\ntwo")).toBe("one<br/>two");
  });
});

describe("renderRich — totality", () => {
  it("never throws, whatever it is handed", () => {
    const junk = ["", "*", "**", "***", "____", "_", "\n", "\n\n\n", "**__*a*__**", "*".repeat(200), "a".repeat(5000) + "**"];
    for (const s of junk) expect(() => renderRich(s)).not.toThrow();
  });
  it("shrugs off a non-string from untyped callers", () => {
    expect(renderRich(undefined as unknown as string)).toBe("");
    expect(renderRich(null as unknown as string)).toBe("");
  });
  it("keeps lone marker characters as characters", () => {
    // NOTE the flip side, and it is by design: two stars anywhere on one line
    // DO pair up, so "2*3 and 4*5" italicises the middle. Authors get told.
    expect(r("6*4 tiles")).toBe("6*4 tiles");
    expect(r("a * b")).toBe("a * b");
    expect(r("a __ b")).toBe("a __ b");
    expect(r("a ** b")).toBe("a ** b");
  });
});

describe("hasMarkup", () => {
  it("spots what the preview should bother rendering", async () => {
    const { hasMarkup } = await import("./richText");
    expect(hasMarkup("plain copy")).toBe(false);
    expect(hasMarkup("a **bold** b")).toBe(true);
    expect(hasMarkup("a *slant* b")).toBe(true);
    expect(hasMarkup("a __under__ b")).toBe(true);
    expect(hasMarkup("two\nlines")).toBe(true);
    expect(hasMarkup("")).toBe(false);
  });
});
