'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { SqlViewProps } from '../contracts';

/**
 * Generated-SQL view — monospace, syntax-highlighted, copy-pasteable, with a copy button
 * and a "SELECT-only / safe to paste into Hex" tag. Ported from the legacy static/app.js
 * `renderSql` tokenizer + copy handler.
 */

const KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'in', 'any', 'order', 'by', 'desc', 'asc',
  'nulls', 'last', 'true', 'false', 'as', 'case', 'when', 'then', 'else', 'end', 'is',
  'not', 'null', 'greatest', 'coalesce', 'substring',
]);

type Token = { cls: string; text: string };

/** Tokenize a single line into highlighted spans (mirrors the legacy regex tokenizer). */
function tokenizeLine(line: string): Token[] {
  if (/^\s*--/.test(line)) return [{ cls: 'com', text: line }];
  const tokens: Token[] = [];
  // Capture groups: 1=string literal, 2=word/keyword, 3=number, 4=whitespace,
  // 5=punctuation, 6=any other single char.
  const re = /('[^']*')|([A-Za-z_][A-Za-z0-9_]*)|(\d+\.?\d*)|(\s+)|([(),;>=<]+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1]) tokens.push({ cls: 'str', text: m[1] });
    else if (m[2]) tokens.push({ cls: KEYWORDS.has(m[2].toLowerCase()) ? 'kw' : 'pl', text: m[2] });
    else if (m[3]) tokens.push({ cls: 'num', text: m[3] });
    else tokens.push({ cls: 'pl', text: m[0] });
  }
  return tokens;
}

export function SqlView({ sql }: SqlViewProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400); // Revert "Copied!" label after 1.4s.
    } catch {
      /* clipboard unavailable — leave the button unchanged */
    }
  };

  const lines = sql.split('\n');

  return (
    <div id="sqlPane">
      <div className="sql-bar">
        <span className="sql-tag">SELECT-only · safe to paste into Hex</span>
        <button
          type="button"
          className="btn-copy"
          onClick={copy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied!' : 'Copy SQL'}
        </button>
      </div>
      <pre className="sql">
        <code>
          {lines.map((line, i) => (
            <span key={i}>
              {tokenizeLine(line).map((t, j) => (
                <span key={j} className={t.cls}>
                  {t.text}
                </span>
              ))}
              {i < lines.length - 1 ? '\n' : ''}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
