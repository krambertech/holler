import { Fragment, type ReactNode } from "react";

/**
 * The little Markdown a Holler's description uses, the same set Slack's mrkdwn gets: paragraphs,
 * lists, bold, italics and links. Built as React elements, never as HTML, so nothing a sender
 * writes can run on the page. Links open in a new tab and only http and https are links.
 */

const inline =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;

function spans(text: string): ReactNode[] {
  return text.split(inline).map((part, index) => {
    const key = `${index}:${part}`;
    if (/^(\*\*|__).+\1$/.test(part)) {
      return (
        <strong key={key} className="font-normal text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^([*_]).+\1$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2"
        >
          {link[1]}
        </a>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

const bullet = /^\s*[-*]\s+/;

export function markdown(source: string): ReactNode {
  const blocks = source.trim().split(/\n\s*\n/);
  return blocks.map((block, index) => {
    const lines = block.split("\n");
    const key = `${index}:${block.slice(0, 20)}`;
    if (lines.every((line) => bullet.test(line))) {
      return (
        <ul key={key} className="list-disc ps-5">
          {lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines of a static description never move
            <li key={i}>{spans(line.replace(bullet, ""))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={key}>
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines of a static description never move
          <Fragment key={i}>
            {i > 0 && <br />}
            {spans(line.replace(/^#{1,6}\s+/, ""))}
          </Fragment>
        ))}
      </p>
    );
  });
}
