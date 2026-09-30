import * as ImagePicker from 'expo-image-picker';

type PickedAsset = ImagePicker.ImagePickerAsset;
type PickerResult = ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null;

function firstPickedAsset(result: PickerResult): PickedAsset | null {
  if (!result || !('assets' in result) || result.canceled) return null;
  const asset = result.assets?.[0];
  return typeof asset?.uri === 'string' && asset.uri.trim() ? asset : null;
}

async function takePendingImagePickerAsset(): Promise<PickedAsset | null> {
  try {
    return firstPickedAsset(await ImagePicker.getPendingResultAsync());
  } catch {
    return null;
  }
}

export async function pickSingleImageFromLibrary(options: ImagePicker.ImagePickerOptions): Promise<PickedAsset | null> {
  const pending = await takePendingImagePickerAsset();
  if (pending) return pending;

  const picked = firstPickedAsset(await ImagePicker.launchImageLibraryAsync(options));
  if (picked) return picked;

  return takePendingImagePickerAsset();
}
