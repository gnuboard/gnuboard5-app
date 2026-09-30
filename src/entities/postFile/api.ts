/**
 * 첨부파일 API (PLAN T-P1B-01, API-MAP §2.3.2). 업로드는 **POST** multipart(PHP 는 multipart PUT 불가).
 * 글 → 파일 2단계는 비원자라 실패 시 호출자가 재시도 UI 를 띄운다.
 */
import { request } from '../../shared/api/client';
import { requireBoTable } from '../board/api';
import { requireWrId } from '../post/api';
import { planFileSync, type Attachment, type FileSyncPlan } from './model';
import { postFileListSchema, type PostFileDto } from './schema';

/** RN FormData 는 web Blob 외에 `{uri, name, type}` 도 받는다(lib.dom 에 없는 RN 전용 형태). */
interface RNFormDataFile {
  uri: string;
  name: string;
  type: string;
}

function filesPath(boTable: string, wrId: number): string {
  return `/boards/${requireBoTable(boTable)}/${requireWrId(wrId)}/files`;
}

export async function listPostFiles(boTable: string, wrId: number): Promise<PostFileDto[]> {
  return request(filesPath(boTable, wrId), { schema: postFileListSchema });
}

export function buildFileSyncForm(plan: FileSyncPlan): FormData {
  const form = new FormData();
  for (const entry of plan.order) form.append('order[]', entry);
  for (const content of plan.contents) form.append('bf_content[]', content);
  for (const file of plan.files) {
    const part: RNFormDataFile = { uri: file.uri, name: file.name, type: file.mimeType };
    form.append('files[]', part as unknown as Blob);
  }
  return form;
}

/**
 * 첨부 목록을 서버와 동기화 — 응답은 재번호된 파일 배열. `original` 과 같으면 호출하지 않고 원본을 돌려준다.
 */
export async function syncPostFiles(
  boTable: string,
  wrId: number,
  attachments: readonly Attachment[],
  original: readonly PostFileDto[] = [],
): Promise<PostFileDto[]> {
  const plan = planFileSync(attachments, original);
  if (!plan.changed) return [...original];
  return request(filesPath(boTable, wrId), {
    method: 'POST',
    body: buildFileSyncForm(plan),
    // 파일 업로드는 기본 15s 로 부족할 수 있다.
    timeoutMs: 60_000,
    schema: postFileListSchema,
  });
}
