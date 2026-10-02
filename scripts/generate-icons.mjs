#!/usr/bin/env node
/**
 * 앱 아이콘 세트 생성 — brand.json `logo`(내 로고 PNG·SVG), 비어 있으면 G5 연결 모노그램(로고 시안 2, 2026-09-30 확정).
 *
 *   npm run icons        (= node scripts/generate-icons.mjs)
 *
 * 내 로고: 배경이 투명한 PNG(가로세로 512 이상 권장) 또는 SVG. 둘레의 투명 여백은 알아서 잘라 내고 가운데에 맞춘다.
 * 테마 아이콘·알림 아이콘은 로고의 **모양(투명하지 않은 부분)** 만 한 색으로 칠하므로 배경이 칠해진 로고는 네모가 된다.
 * 바탕색은 brand.json colors.iconBackground.
 *
 * G5 마크 원본은 이 파일의 `markSvg()` 한 곳이다. logo 가 비어 있을 때만 assets/brand/g5-mark.svg 도 만든다.
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ICON_STAMP_FILE, iconStamp, loadBrand } = require('./lib/brand.js');

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

/** 아이콘별 칠: color = 원래 색, black·white = 모양만 남긴 한 색(테마·알림 아이콘). */
const TONE_FILL = { black: '#000000', white: '#ffffff' };

/**
 * 마크 = 정사각 좌표계(view) 안의 그림. radius 는 중심에서 가장 먼 점(잘리는 아이콘 맞춤), width 는 작은 아이콘 맞춤 폭.
 * @typedef {{ name: string, view: number, shiftY: number, radius: number, width: number, body: (tone: string) => string }} Mark
 */

/** @type {Mark} */
const G5_MARK = {
  name: 'G5',
  view: VIEW,
  shiftY: CENTER_SHIFT_Y,
  radius: MARK_RADIUS,
  width: MARK_WIDTH,
  body: (tone) => (tone === 'color' ? markSvg(BLUE, DARK) : markSvg(TONE_FILL[tone], TONE_FILL[tone])),
};

/** 내 로고를 이 크기 정사각형 안에 그려 보이는 부분의 경계를 찾는다. */
const PROBE = 1024;
/** 이 값 이하의 알파는 "안 보임"으로 친다(안티앨리어싱 찌꺼기). */
const ALPHA_MIN = 8;

/** RGBA 픽셀에서 보이는 부분의 경계 상자. 하나도 없으면 null. */
function alphaBounds(pixels, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= ALPHA_MIN) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 네 귀퉁이가 모두 불투명하면 배경이 칠해진 로고다. */
function hasOpaqueCorners(pixels, width, height) {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  return corners.every((index) => pixels[index * 4 + 3] > 255 - ALPHA_MIN);
}

/**
 * brand.json logo 파일로 마크를 만든다 — 투명 여백을 잘라 보이는 부분의 가운데를 마크 중심에 둔다.
 * @param {string} file 저장소 루트 기준 상대 경로
 * @returns {Mark}
 */
function logoMark(file) {
  const abs = resolve(ROOT, file);
  if (!existsSync(abs)) throw new Error(`brand.json logo 파일이 없어요: ${file}`);
  const mime = /\.svg$/i.test(file) ? 'image/svg+xml' : 'image/png';
  const href = `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
  const image = (filter) =>
    `<image href="${href}" width="${PROBE}" height="${PROBE}" preserveAspectRatio="xMidYMid meet"${filter}/>`;
  const probe = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PROBE}" height="${PROBE}">${image('')}</svg>`,
  ).render();
  const box = alphaBounds(probe.pixels, probe.width, probe.height);
  if (!box) throw new Error(`로고에 보이는 부분이 없어요: ${file}`);
  if (hasOpaqueCorners(probe.pixels, probe.width, probe.height))
    console.warn(
      '주의: 로고 배경이 투명하지 않아요 — 테마 아이콘·알림 아이콘이 네모로 나옵니다. 배경을 지운 PNG 를 쓰세요.',
    );
  const view = Math.max(box.w, box.h);
  const dx = view / 2 - (box.x + box.w / 2);
  const dy = view / 2 - (box.y + box.h / 2);
  return {
    name: file,
    view,
    shiftY: 0,
    radius: Math.hypot(box.w, box.h) / 2,
    width: view,
    body: (tone) => {
      if (tone === 'color') return `<g transform="translate(${dx} ${dy})">${image('')}</g>`;
      const [r, g, b] = tone === 'white' ? [1, 1, 1] : [0, 0, 0];
      const matrix = `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0`;
      return (
        `<defs><filter id="tone" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${matrix}"/>` +
        `</filter></defs><g transform="translate(${dx} ${dy})">${image(' filter="url(#tone)"')}</g>`
      );
    },
  };
}

/** size×size 캔버스 가운데에 마크를 scale 배로 놓는다. background 가 없으면 투명. */
function canvasSvg(mark, { size, scale, tone = 'color', background }) {
  const offset = (size - mark.view * scale) / 2;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '';
  const transform = `translate(${offset} ${offset + mark.shiftY * scale}) scale(${scale})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `${bg}<g transform="${transform}">${mark.body(tone)}</g></svg>`
  );
}

function renderPng(svg) {
  return new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
}

/**
 * Android adaptive 전경에서 마크가 들어갈 원의 지름(캔버스 대비). 규격상 안전 원은 66/108(≈0.61)이지만 픽셀 런처는
 * 가운데를 확대해 보여서 그 크기면 원을 가득 채운다 — 시스템 앱 아이콘과 비슷한 여백이 되도록 0.49 로 줄였다(에뮬레이터 확인).
 */
const SAFE = 0.49;

/** @param {Mark} mark @param {string} iconBackground */
function outputs(mark, iconBackground) {
  /** 마크가 size 캔버스에서 지름 fraction 인 원 안에 들어가는 배율(잘리는 아이콘용). */
  const fitScale = (size, fraction) => (size * fraction) / 2 / mark.radius;
  /** 마크 폭이 size 의 fraction 이 되는 배율(잘리지 않는 작은 아이콘용). */
  const fitWidth = (size, fraction) => (size * fraction) / mark.width;
  return [
    { file: 'icon.png', size: 1024, scale: fitScale(1024, 0.76), background: iconBackground },
    { file: 'adaptive-icon.png', size: 1024, scale: fitScale(1024, SAFE) },
    { file: 'adaptive-icon-monochrome.png', size: 1024, scale: fitScale(1024, SAFE), tone: 'black' },
    // 알림 아이콘은 24dp 중 가장자리 2dp 를 비운다 → 폭 20/24.
    { file: 'notification-icon.png', size: 96, scale: fitWidth(96, 20 / 24), tone: 'white' },
    { file: 'splash-icon.png', size: 1024, scale: fitScale(1024, SAFE) },
    { file: 'favicon.png', size: 48, scale: fitWidth(48, 0.96) },
  ];
}

function writeG5Master() {
  mkdirSync(resolve(ASSETS, 'brand'), { recursive: true });
  const master =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="G5">` +
    `${markSvg(BLUE, DARK)}</svg>\n`;
  writeFileSync(resolve(ASSETS, 'brand/g5-mark.svg'), master);
  console.log('assets/brand/g5-mark.svg');
}

function main() {
  const brand = loadBrand(ROOT);
  const mark = brand.logo ? logoMark(brand.logo) : G5_MARK;
  console.log(`로고: ${mark.name}`);
  for (const { file, ...opts } of outputs(mark, brand.colors.iconBackground)) {
    writeFileSync(resolve(ASSETS, file), renderPng(canvasSvg(mark, opts)));
    console.log(`assets/${file} (${opts.size}×${opts.size})`);
  }
  if (!brand.logo) writeG5Master();
  // store:check 가 "아이콘이 지금 brand.json 로고로 만들어졌는지" 비교하는 도장.
  mkdirSync(resolve(ROOT, dirname(ICON_STAMP_FILE)), { recursive: true });
  writeFileSync(resolve(ROOT, ICON_STAMP_FILE), `${JSON.stringify(iconStamp(brand, ROOT), null, 2)}\n`);
  console.log(ICON_STAMP_FILE);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
