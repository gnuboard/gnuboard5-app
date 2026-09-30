/**
 * 서버 계약/스모크 테스트 (PLAN T-P0-14, ARCH §9 "계약").
 *
 *   npm run contract:test                    # dev localhost, S-00 + S-01 전부
 *   npm run contract:test -- --only S-00     # 그룹 필터(콤마 구분)
 *   EXPO_PUBLIC_API_URL=https://gnuboard.example.com/api/v1 npm run contract:test
 *   G5_SMOKE_IT_ID=1600398330 npm run contract:test   # 담을 상품 고정
 *   npm run contract:test -- --yes               # 로컬(루프백·사설 LAN)이 아닌 호스트에도 쓰기 케이스 실행
 *
 * 쓰기 케이스(S-00.3~) 는 실제 게스트 카트·결제 초안을 만들고 취소한다. 원격 호스트(prod 등)에는 `--yes`
 * (또는 `SMOKE_ALLOW_REMOTE_WRITES=1`) 없이는 보내지 않고 SKIP 한다 — `EXPO_PUBLIC_API_URL` 이 prod 로 잡혀 있는 셸에서
 * 실수로 돌려도 안전하다.
 *
 * Node 22.6+ 의 타입 스트리핑으로 실행한다(빌드 없음). dev/LAN 서버가 필요하므로 GitHub CI 에는 묶지 않고 운영자가
 * 배치 A 배포 후(S-01), P0 종료 게이트(S-00), 야간 점검 때 수동으로 돌린다. 실패가 하나라도 있으면 종료 코드 1.
 * SC-01 배포 전에는 S-01 4건(S-01.1/2/3/5)이 FAIL 인 것이 정상이다.
 */
import { defineCases } from './lib/smoke/cases.ts';
import { isLocalApiHost } from './lib/smoke/http.ts';
import { filterCases, formatReport, REMOTE_WRITE_GUARD, runCases } from './lib/smoke/runner.ts';

const DEFAULT_API = 'http://localhost/api/v1';
const PRODUCT_SEARCH_LIMIT = 20;

function readArg(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(argv: readonly string[]): Promise<number> {
  const apiBase = readArg(argv, '--api') ?? process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API;
  const only = (readArg(argv, '--only') ?? '')
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean);
  const cases = filterCases(defineCases({ productSearchLimit: PRODUCT_SEARCH_LIMIT }), only);
  const allowRemoteWrites = argv.includes('--yes') || process.env.SMOKE_ALLOW_REMOTE_WRITES === '1';
  console.log(`contract-test → ${apiBase} (${cases.length} cases${only.length ? `, only ${only.join(',')}` : ''})`);
  if (!isLocalApiHost(apiBase)) {
    console.log(
      allowRemoteWrites
        ? '!! remote host: write cases WILL create and cancel a guest payment draft'
        : `!! remote host: write cases skipped (${REMOTE_WRITE_GUARD})`,
    );
  }
  const results = await runCases(cases, {
    apiBase,
    allowRemoteWrites,
    initialState: { itId: process.env.G5_SMOKE_IT_ID || undefined },
  });
  console.log(formatReport(results));
  return results.some((result) => result.status === 'fail') ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
