#!/usr/bin/env node
/**
 * 파일 이동 + 상대 import/jest.mock/require 지정자 재작성 (개발 도구).
 *
 *   node scripts/dev/mv-rewrite.mjs '{"src/old/a.ts":"src/new/a.ts", ...}'
 *   node scripts/dev/mv-rewrite.mjs --map moves.json
 *
 * 경로는 리포 루트 기준. `git mv` 를 쓰므로 이력이 보존된다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];
const SCAN_ROOTS = ['src', 'App.tsx', 'index.ts', 'scripts', 'config'];
const ASSET_RE = /\.(png|jpg|jpeg|gif|svg|json|pem|otf|ttf)$/;

function readMap(argv) {
  const mapIdx = argv.indexOf('--map');
  const raw = mapIdx >= 0 ? readFileSync(argv[mapIdx + 1], 'utf8') : argv[0];
  if (!raw) throw new Error('usage: mv-rewrite.mjs <json map> | --map <file>');
  return JSON.parse(raw);
}

function walk(target, out = []) {
  if (!existsSync(target)) return out;
  if (statSync(target).isFile()) {
    out.push(target);
    return out;
  }
  for (const entry of readdirSync(target)) {
    if (['node_modules', 'android', 'ios', '.git', 'dev'].includes(entry)) continue;
    walk(join(target, entry), out);
  }
  return out;
}

function resolveSpecifier(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, `index${e}`))];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

function relSpecifier(fromFile, toFile) {
  const rel = relative(dirname(fromFile), toFile)
    .split(sep)
    .join('/')
    .replace(/\.(ts|tsx|js|mjs|cjs)$/, '')
    .replace(/\/index$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function main() {
  const moves = Object.fromEntries(
    Object.entries(readMap(process.argv.slice(2))).map(([o, n]) => [resolve(ROOT, o), resolve(ROOT, n)]),
  );
  for (const o of Object.keys(moves)) if (!existsSync(o)) throw new Error(`missing: ${o}`);

  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r))).filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));
  const specRe = /(['"`])(\.{1,2}\/[^'"`\n]+)\1/g;
  const plans = files.map((file) => {
    const text = readFileSync(file, 'utf8');
    const edits = [];
    for (const m of text.matchAll(specRe)) {
      if (ASSET_RE.test(m[2])) continue;
      const target = resolveSpecifier(file, m[2]);
      if (target) edits.push({ quote: m[1], spec: m[2], target });
    }
    return { file, edits };
  });

  for (const [o, n] of Object.entries(moves)) {
    mkdirSync(dirname(n), { recursive: true });
    execFileSync('git', ['mv', o, n], { cwd: ROOT, stdio: 'inherit' });
  }

  let rewritten = 0;
  for (const { file, edits } of plans) {
    const newFile = moves[file] ?? file;
    let text = readFileSync(newFile, 'utf8');
    let changed = false;
    for (const e of edits) {
      const next = relSpecifier(newFile, moves[e.target] ?? e.target);
      if (next === e.spec) continue;
      const before = text;
      text = text.split(`${e.quote}${e.spec}${e.quote}`).join(`${e.quote}${next}${e.quote}`);
      changed ||= text !== before;
    }
    if (changed) {
      writeFileSync(newFile, text);
      rewritten += 1;
    }
  }
  process.stdout.write(`moved ${Object.keys(moves).length} files, rewrote specifiers in ${rewritten} files\n`);
}

main();
