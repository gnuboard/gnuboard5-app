/**
 * 게시판 첨부 허용 형식 — 서버 post_files_allowed_extension 과 같은 목록(이미지·문서·압축), 확장자로 MIME 추정.
 */
import {
  attachmentExtension,
  inferAttachmentMimeType,
  isAllowedAttachment,
} from '../entities/postFile/attachmentRules';

describe('attachment rules', () => {
  test('extension is the lowercase part after the last dot', () => {
    expect(attachmentExtension('보고서.최종.PDF')).toBe('pdf');
    expect(attachmentExtension('archive.tar.gz')).toBe('gz');
    expect(attachmentExtension('README')).toBe('');
  });

  test('images, documents and archives are allowed; scripts and unknown types are not', () => {
    for (const name of [
      '사진.jpg',
      'a.PNG',
      'b.webp',
      '계약서.pdf',
      '표.xlsx',
      '발표.pptx',
      '문서.hwp',
      'c.hwpx',
      'd.csv',
    ]) {
      expect(isAllowedAttachment(name)).toBe(true);
    }
    for (const name of ['자료.zip', 'b.7z', 'c.rar', 'd.alz', 'e.egg', 'f.tar', 'g.gz', 'h.tgz']) {
      expect(isAllowedAttachment(name)).toBe(true);
    }
    for (const name of ['shell.php', 'x.exe', 'y.svg', 'z.html', 'noext', 'a.jpg.php']) {
      expect(isAllowedAttachment(name)).toBe(false);
    }
  });

  test('mime type: picker value wins when present, otherwise inferred from the extension', () => {
    expect(inferAttachmentMimeType('a.pdf', 'application/pdf')).toBe('application/pdf');
    expect(inferAttachmentMimeType('a.pdf', null)).toBe('application/pdf');
    expect(inferAttachmentMimeType('사진.JPG')).toBe('image/jpeg');
    expect(inferAttachmentMimeType('자료.zip')).toBe('application/zip');
    expect(inferAttachmentMimeType('문서.hwp')).toBe('application/x-hwp');
    expect(inferAttachmentMimeType('a.egg', '')).toBe('application/octet-stream');
  });
});
