// lint-staged — Windows cmd 의 8191자 인자 제한을 피하기 위해 함수형 설정을 쓴다.
// ESLint 는 프로젝트 전체(계층 규칙은 파일 간 관계라 전체 검사가 맞음), prettier 는 30개씩 나눠 실행한다.
const CHUNK = 30;

const chunk = (files, size) =>
  Array.from({ length: Math.ceil(files.length / size) }, (_, i) => files.slice(i * size, (i + 1) * size));
const quote = (f) => `"${f}"`;

module.exports = {
  '*.{ts,tsx,js,mjs,cjs}': (files) => [
    'eslint --config config/lint.config.cjs .',
    ...chunk(files, CHUNK).map((group) => `prettier --write ${group.map(quote).join(' ')}`),
  ],
  '*.{json,yml,yaml}': (files) => chunk(files, CHUNK).map((group) => `prettier --write ${group.map(quote).join(' ')}`),
};
