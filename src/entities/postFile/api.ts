/**
 * 첨부파일 API (PLAN T-P1B-01, API-MAP §2.3.2). 업로드는 **POST** multipart(PHP 는 multipart PUT 불가).
 * 글 → 파일 2단계는 비원자라 실패 시 호출자가 재시도 UI 를 띄운다.
 */
import { request } from '../../shared/api/client';
import { appendFormFile } from '../../shared/api/formFile';
import { requireBoTable } from '../board/api';
import { requireWrId } from '../post/api';
import { planFileSync, type Attachment, type FileSyncPlan } from './model';
import { postFileListSchema, type PostFileDto } from './schema';

function filesPath(boTable: string, wrId: number): string {
  return `/boards/${requireBoTable(boTable)}/${requireWrId(wrId)}/files`;
}

export async function listPostFiles(boTable: string, wrId: number): Promise<PostFileDto[]> {
  return request(filesPath(boTable, wrId), { schema: postFileListSchema });
}

export async function buildFileSyncForm(plan: FileSyncPlan): Promise<FormData> {
  const form = new FormData();
  for (const entry of plan.order) form.append('order[]', entry);
  for (const content of plan.contents) form.append('bf_content[]', content);
  for (const file of plan.files) {
    await appendFormFile(form, 'files[]', { uri: file.uri, name: file.name, type: file.mimeType });
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
    body: await buildFileSyncForm(plan),
    // 파일 업로드는 기본 15s 로 부족하다 — 게시판 첨부가 10MB 까지 가능해 느린 모바일 업로드(1Mbps 대)도 끝나도록 2분.
    timeoutMs: 120_000,
    schema: postFileListSchema,
  });
}
