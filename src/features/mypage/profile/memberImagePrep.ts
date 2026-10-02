/**
 * 프로필 사진(회원이미지) 준비 — 사진을 고르고, 관리자 설정 비율로 가운데를 잘라, 설정 크기(기본 60×60)로 줄인 JPEG 를
 * 설정 용량(기본 50,000바이트) 이하가 될 때까지 화질을 낮춰 만든다. 서버는 용량을 올린 파일 그대로 검사한다.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { centerCropRect, type MemberImageRules } from '../../../entities/member/media';
import { pickSingleImageFromLibrary } from '../../../shared/lib/imagePicker';

const QUALITY_STEPS = [0.9, 0.75, 0.6, 0.45, 0.3] as const;

export type MemberImagePrep = { kind: 'ready'; uri: string } | { kind: 'cancelled' } | { kind: 'too_large' };

async function fileSize(uri: string): Promise<number> {
  if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? info.size : Number.POSITIVE_INFINITY;
}

async function sourceSize(uri: string, width: number, height: number): Promise<{ width: number; height: number }> {
  if (width > 0 && height > 0) return { width, height };
  // 선택기가 크기를 주지 않을 때(0) — 아무 변환 없이 한 번 읽어 크기를 얻는다.
  const probe = await ImageManipulator.manipulateAsync(uri, []);
  return { width: probe.width, height: probe.height };
}

export async function pickMemberImage(rules: MemberImageRules): Promise<MemberImagePrep> {
  const asset = await pickSingleImageFromLibrary({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  if (!asset) return { kind: 'cancelled' };
  const source = await sourceSize(asset.uri, asset.width, asset.height);
  const crop = centerCropRect(source.width, source.height, rules.width, rules.height);
  for (const compress of QUALITY_STEPS) {
    const out = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ crop }, { resize: { width: rules.width, height: rules.height } }],
      { compress, format: ImageManipulator.SaveFormat.JPEG },
    );
    if ((await fileSize(out.uri)) <= rules.size) return { kind: 'ready', uri: out.uri };
  }
  return { kind: 'too_large' };
}
