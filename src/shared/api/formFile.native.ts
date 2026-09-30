/**
 * multipart 파일 파트 넣기 — Android·iOS 는 React Native 식 `{ uri, name, type }` 파트(RN XHR 이 uri 를 스트리밍한다).
 * 웹은 formFile.ts(Blob 으로 읽어 파일명과 함께 넣는다). 업로드 전송은 uploadFetch 가 맡는다.
 */
export interface FormFile {
  uri: string;
  name: string;
  type: string;
}

export async function appendFormFile(form: FormData, field: string, file: FormFile): Promise<void> {
  form.append(field, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
}
