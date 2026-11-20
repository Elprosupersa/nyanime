import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd());
const UI_EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u20E3)/gu;

function collectFiles(relDir: string, exts: RegExp): string[] {
  const absDir = path.join(ROOT_DIR, relDir);
  if (!fs.existsSync(absDir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const relPath = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      results.push(...collectFiles(relPath, exts));
    } else if (exts.test(entry.name)) {
      results.push(relPath);
    }
  }
  return results;
}

describe('UI Copy Hygiene — Zero Unicode Emojis', () => {
  it('contains zero Unicode emojis across index.html, active src/ modules, styles, and service workers', () => {
    const targetFiles = [
      'index.html',
      'public/sw-push.js',
      'public/firebase-messaging-sw.js',
      ...collectFiles('src', /\.(ts|tsx|js|css)$/)
    ].filter((rel) => fs.existsSync(path.join(ROOT_DIR, rel)));

    expect(targetFiles.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const relPath of targetFiles) {
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const matches = line.match(UI_EMOJI_REGEX);
        if (matches && matches.length > 0) {
          violations.push(`${relPath}:${idx + 1} [${[...new Set(matches)].join(' ')}] ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
