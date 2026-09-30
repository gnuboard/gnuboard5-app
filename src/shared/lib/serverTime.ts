/**
 * 서버(KST) 시각 표시 헬퍼 — T-P1B-03 PostRow 에서 분리(T-P1B-07, MY 목록도 쓴다). 서버 문자열 `YYYY-MM-DD HH:mm:ss` 를
 * 파싱하지 않고 그대로 자른다(기기 시간대 파싱 오차 회피).
 */
const SERVER_TIME_ZONE = 'Asia/Seoul';

/** 서버(KST) 기준 오늘 날짜 `YYYY-MM-DD` — UTC 로 자르면 자정 전후 9시간 동안 날짜가 어긋난다. */
export function serverToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SERVER_TIME_ZONE }).format(now);
}

/** 오늘이면 `HH:mm`, 아니면 `MM.DD`. */
export function formatPostTime(datetime: string, today: string = serverToday()): string {
  const [date = '', time = ''] = datetime.split(' ');
  if (date === today) return time.slice(0, 5);
  return date.slice(5).replace('-', '.');
}

/** 목록용 날짜 `YYYY.MM.DD`(빈 값은 ''). */
export function formatServerDate(datetime: string): string {
  const [date = ''] = datetime.split(' ');
  return date.replace(/-/g, '.');
}
