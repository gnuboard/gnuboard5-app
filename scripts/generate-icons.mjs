#!/usr/bin/env node
/**
 * 앱 아이콘 세트 생성 — G5 연결 모노그램(로고 시안 2, 2026-09-30 확정).
 *
 *   npm run icons        (= node scripts/generate-icons.mjs)
 *
 * 마크 원본은 이 파일의 `markSvg()` 한 곳이다. 여기서 assets/ 의 PNG 들과 assets/brand/g5-mark.svg 를 만든다.
 * 바꾼 뒤에는 `npx expo prebuild --platform android` 로 android/ 의 mipmap·drawable 을 다시 만든다(android/ 는 git 밖).
 *
 * 모양: 파란 G 고리 + 가로획, 짙은 5. G 의 가로획은 5 의 둥근 배 윗선과 같은 높이라 한 줄로 이어져 보인다.
 * G 와 5 사이 틈은 마스크로 **뚫는다**(흰 칠이 아니다) — 투명 배경·단색(테마 아이콘·알림 아이콘)에서도 G 와 5 가 갈린다.
 *
 * 만드는 파일(모두 PNG):
 *  - icon.png                     1024 불투명 흰 바탕 — iOS·기본 아이콘(iOS 가 모서리를 둥글린다)
 *  - adaptive-icon.png            1024 투명 — Android adaptive 전경. 마크는 가운데 안전 원 안(여백은 SAFE 참고)
 *  - adaptive-icon-monochrome.png 1024 투명 검정 한 색 — Android 13+ 테마 아이콘
 *  - notification-icon.png        96 투명 흰색 한 색 — Android 상태 표시줄 알림 아이콘(색은 무시되고 알파만 쓰인다)
 *  - splash-icon.png              1024 투명 — 스플래시(Android 12+ 는 원으로 잘라 보여서 adaptive 와 같은 여백)
 *  - favicon.png                  48 투명 — 웹 데모
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, 'assets');

const BLUE = '#2f6bff'; // tokens/primitive blue500
const DARK = '#191f28'; // tokens/primitive gray900

/** 마크 좌표계: 256×256. 마크의 시각 중심은 (128,126) 이라 캔버스에 놓을 때 2 만큼 내린다. */
const VIEW = 256;
const CENTER_SHIFT_Y = 2;
const STROKE = 24;
const GAP = 10;
/** 캔버스 중심에서 마크의 가장 먼 점(5 윗획 오른쪽 둥근 끝)까지 거리 — 안전 원 맞춤에 쓴다. */
const MARK_RADIUS = 133;
/** 마크 가로 폭(G 고리 왼쪽 끝 18 ~ 5 윗획 오른쪽 끝 238) — 작은 아이콘은 폭으로 맞춘다. */
const MARK_WIDTH = 220;

const G = { cx: 98, cy: 128, r: 68 };
const FIVE = { right: 226, top: 56, stemX: 152, bowlX: 184, bowlR: 34, tailX: 146 };

function markSvg(blue, dark) {
  const { right, top, stemX, bowlX, bowlR, tailX } = FIVE;
  const barY = G.cy;
  const bowlBottom = barY + 2 * bowlR;
  const five = `M${right} ${top}H${stemX}V${barY}H${bowlX}A${bowlR} ${bowlR} 0 1 1 ${bowlX} ${bowlBottom}H${tailX}`;
  const bowlFill = `M${stemX} ${barY}H${bowlX}A${bowlR} ${bowlR} 0 1 1 ${bowlX} ${bowlBottom}H${stemX}Z`;
  const cutWidth = STROKE + 2 * GAP;
  return [
    '<defs><mask id="g5-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">',
    '<rect width="256" height="256" fill="#fff"/>',
    `<path d="${five}" fill="none" stroke="#000" stroke-width="${cutWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${bowlFill}" fill="#000"/>`,
    // 5 의 윗획과 배 사이 빈칸 — G 고리 조각이 틈 사이로 비치지 않게.
    `<rect x="${stemX}" y="${top}" width="${VIEW - stemX}" height="${barY - top}" fill="#000"/>`,
    '</mask></defs>',
    `<g mask="url(#g5-cut)" fill="none" stroke="${blue}" stroke-width="${STROKE}" stroke-linecap="round">`,
    `<circle cx="${G.cx}" cy="${G.cy}" r="${G.r}"/>`,
    `<path d="M${G.cx + 4} ${barY}H${stemX}"/>`,
    '</g>',
    `<path d="${five}" fill="none" stroke="${dark}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}

/** size×size 캔버스 가운데에 마크를 scale 배로 놓는다. background 가 없으면 투명. */
function canvasSvg({ size, scale, blue = BLUE, dark = DARK, background }) {
  const offset = (size - VIEW * scale) / 2;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '';
  const transform = `translate(${offset} ${offset + CENTER_SHIFT_Y * scale}) scale(${scale})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `${bg}<g transform="${transform}">${markSvg(blue, dark)}</g></svg>`
  );
}

function renderPng(svg) {
  return new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
}

/** 마크가 size 캔버스에서 지름 fraction 인 원 안에 들어가는 배율(잘리는 아이콘용). */
const fitScale = (size, fraction) => (size * fraction) / 2 / MARK_RADIUS;
/** 마크 폭이 size 의 fraction 이 되는 배율(잘리지 않는 작은 아이콘용). */
const fitWidth = (size, fraction) => (size * fraction) / MARK_WIDTH;

/**
 * Android adaptive 전경에서 마크가 들어갈 원의 지름(캔버스 대비). 규격상 안전 원은 66/108(≈0.61)이지만 픽셀 런처는
 * 가운데를 확대해 보여서 그 크기면 원을 가득 채운다 — 시스템 앱 아이콘과 비슷한 여백이 되도록 0.49 로 줄였다(에뮬레이터 확인).
 */
const SAFE = 0.49;

const OUTPUTS = [
  { file: 'icon.png', size: 1024, scale: fitScale(1024, 0.76), background: '#ffffff' },
  { file: 'adaptive-icon.png', size: 1024, scale: fitScale(1024, SAFE) },
  { file: 'adaptive-icon-monochrome.png', size: 1024, scale: fitScale(1024, SAFE), blue: '#000000', dark: '#000000' },
  // 알림 아이콘은 24dp 중 가장자리 2dp 를 비운다 → 폭 20/24.
  { file: 'notification-icon.png', size: 96, scale: fitWidth(96, 20 / 24), blue: '#ffffff', dark: '#ffffff' },
  { file: 'splash-icon.png', size: 1024, scale: fitScale(1024, SAFE) },
  { file: 'favicon.png', size: 48, scale: fitWidth(48, 0.96) },
];

function main() {
  for (const { file, ...opts } of OUTPUTS) {
    writeFileSync(resolve(ASSETS, file), renderPng(canvasSvg(opts)));
    console.log(`assets/${file} (${opts.size}×${opts.size})`);
  }
  mkdirSync(resolve(ASSETS, 'brand'), { recursive: true });
  const master =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="G5">` +
    `${markSvg(BLUE, DARK)}</svg>\n`;
  writeFileSync(resolve(ASSETS, 'brand/g5-mark.svg'), master);
  console.log('assets/brand/g5-mark.svg');
}

main();
