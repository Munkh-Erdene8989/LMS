import { Fragment, type ReactNode } from 'react';

/**
 * Багшийн бичсэн текст хичээлийг харуулах жижиг, аюулгүй Markdown renderer.
 * HTML огт тайлбарлахгүй (бүгд текст болж React escape хийнэ), линк зөвхөн http(s).
 * Дэмжих: # ## ### гарчиг, **тод**, *налуу*, `код`, ``` блок ```, - / 1. жагсаалт, [текст](https://…).
 */
export function Markdown({ source }: { source: string }) {
  return <div className="markdown">{blocks(source)}</div>;
}

function blocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) code.push(lines[i++]!);
      i++;
      out.push(
        <pre key={out.length}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const Tag = (['h2', 'h3', 'h4'] as const)[heading[1]!.length - 1]!;
      out.push(<Tag key={out.length}>{inline(heading[2]!)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      while (i < lines.length && re.test(lines[i]!)) items.push(re.exec(lines[i++]!)![1]!);
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={out.length}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]!)) para.push(lines[i++]!);
    out.push(
      <p key={out.length}>
        {para.map((p, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return out;
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, k) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return <code key={k}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={k}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = link[2]!;
      return /^https?:\/\//i.test(href) ? (
        <a key={k} href={href} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>
      ) : (
        link[1]
      );
    }
    return part;
  });
}
