import { editorImageFileUrl, isEditorUploadUrl, normalizeEditorUploadImageUrl } from '../shared/html/editorImages';

jest.mock('../shared/api/client', () => ({
  API_BASE: 'https://api.example.test',
}));

describe('editor image URL helpers', () => {
  test('normalizes canonical editor upload image URLs', () => {
    expect(normalizeEditorUploadImageUrl('/data/editor/2606/image.jpg')).toBe(
      'https://api.example.test/data/editor/2606/image.jpg',
    );
    expect(normalizeEditorUploadImageUrl(' https://api.example.test/data/editor/2606/image.webp ')).toBe(
      'https://api.example.test/data/editor/2606/image.webp',
    );
    expect(isEditorUploadUrl('https://api.example.test/editor/2606/image.png')).toBe(true);
  });

  test('maps the render bridge /api/v1/editor-images/{ym}/{file} back to the upload file_url (T-P1B-07 image reports)', () => {
    expect(editorImageFileUrl('https://api.example.test/api/v1/editor-images/2609/photo-1.jpg')).toBe(
      'https://api.example.test/data/editor/2609/photo-1.jpg',
    );
    expect(editorImageFileUrl('https://api.example.test/data/editor/2609/photo-1.jpg')).toBe(
      'https://api.example.test/data/editor/2609/photo-1.jpg',
    );
    expect(editorImageFileUrl('https://cdn.example.test/api/v1/editor-images/2609/photo-1.jpg')).toBeNull();
    expect(editorImageFileUrl('https://api.example.test/api/v1/board-files/free/1/0')).toBeNull();
    expect(editorImageFileUrl('https://api.example.test/api/v1/editor-images/2609/../x.jpg')).toBeNull();
  });

  test('rejects editor upload URLs with query, hash, or credentials', () => {
    expect(
      normalizeEditorUploadImageUrl('https://api.example.test/data/editor/2606/image.jpg?token=secret'),
    ).toBeNull();
    expect(normalizeEditorUploadImageUrl('https://api.example.test/data/editor/2606/image.jpg#preview')).toBeNull();
    expect(normalizeEditorUploadImageUrl('https://user:pass@api.example.test/data/editor/2606/image.jpg')).toBeNull();
    expect(isEditorUploadUrl('https://api.example.test/data/editor/2606/image.jpg?token=secret')).toBe(false);
  });
});
