#!/usr/bin/env node
/**
 * dev API(localhost) 응답을 src/test/fixtures/*.json 으로 캡처한다 (PLAN T-P0-08).
 *
 *   npm run fixtures:capture                 # 공개 엔드포인트
 *   G5_SMOKE_ID=… G5_SMOKE_PW=… npm run fixtures:capture   # + 회원 엔드포인트(로그인 후 Bearer)
 *
 * - 민감 필드는 scripts/lib/fixture-mask.js 로 마스킹한다(캡처본은 git 에 커밋).
 * - index.json 이 name → {method, path, status} 를 기록하고 msw 핸들러(src/test/msw)가 이를 그대로 재생한다.
 * - 실패한 엔드포인트는 건너뛰고 종료 코드 1 로 알린다(부분 캡처는 유지).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { maskFixture } = require('./lib/fixture-mask.js');

const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost/api/v1').replace(/\/+$/, '');
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/test/fixtures');
const TIMEOUT_MS = 15_000;

/** name 은 파일명이자 msw 핸들러 키. path 는 API_BASE 기준. `{placeholder}` 는 앞선 응답에서 채운다. */
const PUBLIC_ENDPOINTS = [
  { name: 'settings', path: '/settings' },
  { name: 'boards', path: '/boards' },
  { name: 'board-free', path: '/boards/free' },
  { name: 'posts-free', path: '/boards/free/posts?per_page=5' },
  { name: 'post-detail', path: '/posts/free/{firstPostId}' },
  { name: 'posts-latest', path: '/posts/latest?rows=5' },
  { name: 'search', path: '/search?q=a' },
  { name: 'search-popular', path: '/search/popular' },
  { name: 'menus', path: '/menus' },
  { name: 'content', path: '/content/01_01' },
  { name: 'faqs', path: '/faqs' },
  { name: 'polls', path: '/polls' },
  { name: 'poll-detail', path: '/polls/{firstPollId}' },
  { name: 'shop-categories', path: '/shop/categories' },
  { name: 'shop-category-products', path: '/shop/categories/{firstCategoryId}/products?per_page=5' },
  { name: 'shop-products', path: '/shop/products?per_page=5' },
  { name: 'shop-product-detail', path: '/shop/products/{firstProductId}' },
  { name: 'shop-cart-empty', path: '/shop/cart' },
  { name: 'shop-policy', path: '/shop/policy' },
  { name: 'shop-payment-config', path: '/shop/payment/config' },
  { name: 'shop-banners', path: '/shop/banners' },
  { name: 'shop-reviews', path: '/shop/reviews?per_page=5' },
  { name: 'shop-qna', path: '/shop/reviews/qna?per_page=5' },
];

const MEMBER_ENDPOINTS = [
  { name: 'auth-me', path: '/auth/me' },
  { name: 'members-me', path: '/members/me' },
  { name: 'shop-orders', path: '/shop/orders?per_page=5' },
];

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'X-Client-Platform': 'android', ...init.headers },
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function pickId(items, key) {
  const first = Array.isArray(items) ? items[0] : null;
  return first && first[key] !== undefined ? String(first[key]) : null;
}

async function login() {
  const id = process.env.G5_SMOKE_ID;
  const pw = process.env.G5_SMOKE_PW;
  if (!id || !pw) return null;
  const { status, json } = await fetchJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mb_id: id, mb_password: pw, device_label: 'capture-fixtures' }),
  });
  if (status !== 200 || !json?.success || !json?.data?.token) {
    console.warn(`  ! login failed (${status}) - member endpoints skipped`);
    return null;
  }
  return json.data.token;
}

function resolvePath(rawPath, placeholders) {
  let missing = false;
  const resolved = rawPath.replace(/\{(\w+)\}/g, (_, key) => {
    if (!placeholders[key]) missing = true;
    return placeholders[key] ?? '';
  });
  return missing ? null : resolved;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const index = [];
  const placeholders = {};
  let failures = 0;

  async function capture({ name, path: rawPath }, headers = {}) {
    const resolved = resolvePath(rawPath, placeholders);
    if (!resolved) {
      console.warn(`  - ${name}: placeholder unresolved, skipped`);
      failures += 1;
      return null;
    }
    const { status, json } = await fetchJson(`${API_BASE}${resolved}`, { headers });
    if (!json) {
      console.warn(`  ! ${name}: non-JSON (${status})`);
      failures += 1;
      return null;
    }
    const masked = maskFixture(json, { preserveHosts: [new URL(API_BASE).host] });
    await writeFile(path.join(OUT_DIR, `${name}.json`), `${JSON.stringify(masked, null, 2)}\n`);
    index.push({ name, method: 'GET', path: resolved, status, capturedAt: new Date().toISOString() });
    console.log(`  ${status === 200 ? '+' : '!'} ${name} (${status}) ${resolved}`);
    return json;
  }

  console.log(`capture from ${API_BASE}`);
  for (const endpoint of PUBLIC_ENDPOINTS) {
    const json = await capture(endpoint);
    const data = json?.data;
    if (endpoint.name === 'posts-free') placeholders.firstPostId = pickId(data, 'wr_id');
    if (endpoint.name === 'polls') placeholders.firstPollId = pickId(data, 'po_id');
    if (endpoint.name === 'shop-categories') placeholders.firstCategoryId = pickId(data, 'ca_id');
    if (endpoint.name === 'shop-products') placeholders.firstProductId = pickId(data, 'it_id');
  }

  const token = await login();
  if (token) {
    for (const endpoint of MEMBER_ENDPOINTS) await capture(endpoint, { Authorization: `Bearer ${token}` });
  } else {
    console.log('  (member endpoints skipped: set G5_SMOKE_ID / G5_SMOKE_PW)');
  }

  index.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`${index.length} fixtures written to ${path.relative(process.cwd(), OUT_DIR)}`);
  if (failures > 0) {
    console.warn(`${failures} endpoint(s) failed`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
