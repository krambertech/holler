import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { markdown } from "./markdown";

const html = (source: string) =>
  renderToStaticMarkup(createElement(Fragment, null, markdown(source)));

describe("markdown", () => {
  it("draws bold, italics, links and lists", () => {
    expect(html("Two minutes. **Thank you.** _Really._")).toBe(
      '<p>Two minutes. <strong class="font-normal text-ink">Thank you.</strong> <em>Really.</em></p>',
    );
    expect(html("- One\n- Two")).toBe('<ul class="list-disc ps-5"><li>One</li><li>Two</li></ul>');
    expect(html("[Agenda](https://example.com/a)")).toContain(
      'href="https://example.com/a" target="_blank" rel="noreferrer noopener"',
    );
  });

  it("never lets what a sender writes become markup or a script link", () => {
    const out = html('<img src=x onerror="alert(1)"> [x](javascript:alert(1))');
    expect(out).not.toContain("<img");
    expect(out).not.toContain('href="javascript');
    expect(out).toContain("&lt;img");
  });

  it("keeps paragraphs and line breaks", () => {
    expect(html("One\ntwo\n\nThree")).toBe("<p>One<br/>two</p><p>Three</p>");
  });
});
