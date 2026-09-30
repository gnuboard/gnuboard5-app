/**
 * multipart 파일 파트 넣기 — 웹(데모). 브라우저 FormData 는 `{ uri, name, type }` 객체를 문자열 "[object Object]" 로
 * 바꿔 버리므로, 선택기가 준 blob:/data: 주소를 Blob 으로 읽어 파일명과 함께 넣는다. 네이티브는 formFile.native.ts.
 */
export interface FormFile {
  uri: string;
  name: string;
  type: string;
}

export async function appendFormFile(form: FormData, field: string, file: FormFile): Promise<void> {
  const blob = await (await fetch(file.uri)).blob();
  form.append(field, file.type && blob.type !== file.type ? new Blob([blob], { type: file.type }) : blob, file.name);
}
