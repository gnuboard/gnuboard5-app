/**
 * 내 사이트 앱 브랜드 — 루트 `brand.json` 한 파일을 읽고 검사한다 (docs/MY-APP.md).
 *
 * app.config.ts(Node), scripts/generate-icons.mjs, scripts/check-store-readiness.js 가 이 모듈로 읽는다.
 * 앱 번들(src/config/appIds.ts·appName.ts)은 brand.json 을 직접 import 한다 — 값의 정본은 brand.json 하나뿐이고,
 * `expo start`·`expo prebuild`·EAS 빌드가 모두 app.config.ts 를 거치므로 틀린 값은 빌드 전에 여기서 멈춘다.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BRAND_FILE = 'brand.json';

/** (주)에스아이알소프트 공식 그누보드5 앱의 식별자. 다른 사람이 같은 값으로 스토어에 올릴 수 없다. */
const OFFICIAL = Object.freeze({
  package: 'kr.sirsoft.gnuboard5',
  scheme: 'sirsoft-g5',
  easProjectId: '5e398628-b3d5-44af-98aa-a15d4c083986',
});

/** 공식 출시 빌드에서만 켜는 환경 변수 — 켜져 있으면 공식 식별자·G5 로고 사용 경고를 끈다. */
const OFFICIAL_RELEASE_ENV = 'G5_OFFICIAL_RELEASE';

// Android applicationId 와 iOS bundle identifier 가 모두 받는 모양: 점으로 나뉜 2마디 이상, 마디는 영소문자로 시작.
const PACKAGE_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
// 서버 허용 목록(api/social/_bridge_common.php)과 같은 규칙.
const SCHEME_RE = /^[a-z][a-z0-9.+-]*$/;
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Expo 프로젝트 ID(eas init 이 주는 UUID)와 계정 이름 — 아직 없으면 빈 문자열.
const EAS_PROJECT_ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/;
const EAS_OWNER_RE = /^([a-zA-Z0-9][a-zA-Z0-9_-]*)?$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LOGO_RE = /\.(png|svg)$/i;
const RESERVED_SCHEMES = new Set([
  'http',
  'https',
  'file',
  'ftp',
  'mailto',
  'tel',
  'sms',
  'intent',
  'content',
  'data',
  'javascript',
  'about',
  'market',
  'exp',
]);
// Android applicationId 의 마디는 Java 예약어가 될 수 없다(prebuild·Gradle 에서 실패한다).
const JAVA_KEYWORDS = new Set(
  (
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends ' +
    'false final finally float for goto if implements import instanceof int interface long native new null package ' +
    'private protected public return short static strictfp super switch synchronized this throw throws transient ' +
    'true try void volatile while'
  ).split(' '),
);
/** 저장소 밖을 가리키는 logo: 절대 경로, 드라이브(C:foo), UNC·루트(\\, /), 상위 폴더(..). */
const LOGO_OUTSIDE_RE = /^([a-zA-Z]:|[\\/])|(^|[\\/])\.\.([\\/]|$)/;
/** Google Play 앱 이름 한도. */
const APP_NAME_MAX = 30;
const COLOR_KEYS = ['accent', 'iconBackground', 'splashBackground'];

/**
 * @typedef {{ accent: string, iconBackground: string, splashBackground: string }} BrandColors
 * @typedef {{ appName: string, package: string, scheme: string, siteHost: string, slug: string,
 *   easProjectId: string, easOwner: string, logo: string, colors: BrandColors }} Brand
 * @typedef {{ level: 'ok' | 'warn' | 'fail', message: string }} Finding
 */

// 다듬지 않는다 — 앱 번들(appIds.ts)은 brand.json 의 값을 그대로 쓰므로, 검사도 그 값 그대로를 본다.
/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value : '');

/**
 * 모양 검사 — 파일을 읽지 않는 순수 함수.
 * @param {unknown} raw
 * @returns {{ brand: Brand, errors: string[] }}
 */
function validateBrand(raw) {
  const input = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const colorsIn =
    input.colors && typeof input.colors === 'object' ? /** @type {Record<string, unknown>} */ (input.colors) : {};
  const brand = {
    appName: text(input.appName),
    package: text(input.package),
    scheme: text(input.scheme),
    siteHost: text(input.siteHost),
    slug: text(input.slug),
    easProjectId: text(input.easProjectId),
    easOwner: text(input.easOwner),
    logo: text(input.logo),
    colors: /** @type {BrandColors} */ (Object.fromEntries(COLOR_KEYS.map((key) => [key, text(colorsIn[key])]))),
  };
  const errors = [];
  if (!brand.appName.trim() || brand.appName !== brand.appName.trim() || brand.appName.length > APP_NAME_MAX)
    errors.push(`appName: 앞뒤 공백 없이 1~${APP_NAME_MAX}자로 적어 주세요 (사이트 제목을 못 읽었을 때 쓰는 이름).`);
  if (!PACKAGE_RE.test(brand.package) || brand.package.split('.').some((part) => JAVA_KEYWORDS.has(part)))
    errors.push(
      'package: 영소문자·숫자 마디를 점으로 이은 앱 ID 예요 (예: com.example.myapp). new·class 같은 Java 예약어 마디는 안 돼요.',
    );
  if (!SCHEME_RE.test(brand.scheme) || RESERVED_SCHEMES.has(brand.scheme))
    errors.push('scheme: 영소문자로 시작하는 앱 전용 이름이에요 (예: myapp). http·https 같은 예약어는 안 돼요.');
  if (!HOST_RE.test(brand.siteHost))
    errors.push('siteHost: https:// 와 / 없이 소문자 도메인만 적어 주세요 (예: example.com).');
  if (!SLUG_RE.test(brand.slug)) errors.push('slug: 영소문자·숫자·하이픈만 써요 (예: myapp).');
  if (!EAS_PROJECT_ID_RE.test(brand.easProjectId))
    errors.push('easProjectId: `eas init` 이 알려 준 프로젝트 ID(소문자 UUID)예요. 아직 없으면 비워 두세요.');
  if (!EAS_OWNER_RE.test(brand.easOwner))
    errors.push('easOwner: Expo 계정(또는 조직) 이름이에요. 아직 없으면 비워 두세요.');
  if (brand.logo && (!LOGO_RE.test(brand.logo) || path.isAbsolute(brand.logo) || LOGO_OUTSIDE_RE.test(brand.logo)))
    errors.push('logo: 저장소 안의 .png 또는 .svg 상대 경로예요 (예: assets/brand/logo.png). 비우면 G5 로고.');
  for (const key of COLOR_KEYS) {
    if (!COLOR_RE.test(brand.colors[key])) errors.push(`colors.${key}: #rrggbb 모양의 색이에요 (예: #2f6bff).`);
  }
  return { brand, errors };
}

/**
 * 루트 brand.json 을 읽어 검사한다. 틀리면 무엇을 고칠지 모두 적은 오류를 던진다.
 * @param {string} [root]
 * @returns {Brand}
 */
function loadBrand(root = path.resolve(__dirname, '..', '..')) {
  const file = path.join(root, BRAND_FILE);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${BRAND_FILE} 을 읽지 못했어요: ${reason}`);
  }
  const { brand, errors } = validateBrand(raw);
  if (errors.length) throw new Error(`${BRAND_FILE} 을 고쳐 주세요:\n- ${errors.join('\n- ')}`);
  return brand;
}

/**
 * 공식 앱 것을 그대로 쓰는 항목 — 비어 있어야 다른 사람이 스토어에 올릴 수 있다.
 * @param {Brand} brand
 * @returns {string[]}
 */
function officialIdentityUses(brand) {
  const uses = [];
  if (brand.package === OFFICIAL.package) uses.push(`앱 ID(package) ${OFFICIAL.package}`);
  if (brand.scheme === OFFICIAL.scheme) uses.push(`스킴(scheme) ${OFFICIAL.scheme}`);
  if (!brand.logo) uses.push('G5 로고(logo 가 비어 있음)');
  if (brand.easProjectId === OFFICIAL.easProjectId) uses.push('Expo 프로젝트(easProjectId)');
  return uses;
}

/** `npm run icons` 가 남기는 도장 — 아이콘이 지금 brand.json 의 로고·바탕색으로 만들어졌는지 비교한다. */
const ICON_STAMP_FILE = 'assets/brand/icons.json';

/**
 * 지금 brand.json 기준 아이콘 도장. logo 파일을 못 읽으면 logoSha256 은 null.
 * @param {Brand} brand
 * @param {string} root
 * @returns {{ logo: string, logoSha256: string | null, iconBackground: string }}
 */
function iconStamp(brand, root) {
  let logoSha256 = /** @type {string | null} */ ('');
  if (brand.logo) {
    try {
      logoSha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, brand.logo)))
        .digest('hex');
    } catch {
      logoSha256 = null;
    }
  }
  return { logo: brand.logo, logoSha256, iconBackground: brand.colors.iconBackground };
}

/**
 * logo 를 바꾸고 `npm run icons` 를 잊으면 G5 아이콘이 그대로 나간다 — 도장과 비교해 알려 준다.
 * @param {Brand} brand
 * @param {string} root
 * @returns {Finding[]}
 */
function iconStampFindings(brand, root) {
  const current = iconStamp(brand, root);
  if (current.logoSha256 === null) return [{ level: 'fail', message: `brand.json logo 파일이 없어요: ${brand.logo}` }];
  let saved = null;
  try {
    saved = JSON.parse(fs.readFileSync(path.join(root, ICON_STAMP_FILE), 'utf8'));
  } catch {
    saved = null;
  }
  const same =
    saved &&
    saved.logo === current.logo &&
    saved.logoSha256 === current.logoSha256 &&
    saved.iconBackground === current.iconBackground;
  return same
    ? [{ level: 'ok', message: '앱 아이콘이 지금 brand.json 의 로고·바탕색으로 만들어져 있어요.' }]
    : [
        {
          level: 'warn',
          message: '앱 아이콘이 지금 brand.json 의 로고·바탕색과 달라요 — `npm run icons` 를 실행하세요.',
        },
      ];
}

/** @param {string} host */
function isPlaceholderHost(host) {
  return /(^|\.)(example\.(com|org|net)|test|invalid|localhost)$/.test(host);
}

/** @param {string} url */
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * 스토어 제출 점검(check-store-readiness)용 결과. officialRelease 는 G5_OFFICIAL_RELEASE=1 일 때만 true.
 * @param {Brand} brand
 * @param {{ officialRelease: boolean, productionApiUrl?: string }} options
 * @returns {Finding[]}
 */
function brandFindings(brand, { officialRelease, productionApiUrl = '' }) {
  /** @type {Finding[]} */
  const findings = [];
  // 경고로 둔다 — 공개 저장소(예시 도메인) CI 는 통과하고, 제출 전 `--strict` 에서는 실패한다.
  if (isPlaceholderHost(brand.siteHost))
    findings.push({
      level: 'warn',
      message: `brand.json siteHost 가 예시 주소예요 (${brand.siteHost}). 내 사이트 도메인으로 바꿔 주세요.`,
    });
  else findings.push({ level: 'ok', message: `사이트 도메인: ${brand.siteHost}` });

  const uses = officialIdentityUses(brand);
  if (!uses.length) findings.push({ level: 'ok', message: `내 앱 브랜드: ${brand.package} · ${brand.scheme}://` });
  else if (officialRelease)
    findings.push({ level: 'ok', message: `공식 그누보드5 앱 출시 빌드 (${OFFICIAL_RELEASE_ENV}=1).` });
  else
    findings.push({
      level: 'warn',
      message:
        `공식 그누보드5 앱 것을 그대로 쓰고 있어요: ${uses.join(', ')}. ` +
        '스토어에 내 앱으로 올리려면 brand.json 에서 바꿔 주세요 (docs/MY-APP.md).',
    });

  const apiHost = hostOf(productionApiUrl);
  if (apiHost && apiHost !== brand.siteHost && !apiHost.endsWith(`.${brand.siteHost}`))
    findings.push({
      level: 'warn',
      message: `eas.json production 의 API 주소(${apiHost})가 brand.json siteHost(${brand.siteHost})와 달라요.`,
    });
  return findings;
}

module.exports = {
  BRAND_FILE,
  OFFICIAL,
  OFFICIAL_RELEASE_ENV,
  validateBrand,
  loadBrand,
  officialIdentityUses,
  isPlaceholderHost,
  brandFindings,
  ICON_STAMP_FILE,
  iconStamp,
  iconStampFindings,
};
