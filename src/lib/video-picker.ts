import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

export type PickedVideo = {
  base64: string;
  fileExtension: string;
  mimeType: string;
  localUri: string;
};

/** 60 seconds is plenty for "show me your setup on this lift" — keeps
 * the eventual upload (base64-encoded, same as every other attachment
 * in this app) from ballooning into something that takes forever on a
 * mobile connection. 0 would mean no limit. `base64: true` matters here
 * for more than convenience -- see toPickedVideo() below. */
const VIDEO_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'videos',
  videoMaxDuration: 60,
  base64: true,
};

async function toPickedVideo(asset: ImagePicker.ImagePickerAsset): Promise<PickedVideo> {
  // expo-file-system's readAsStringAsync is NOT available on web at all
  // (throws "is not available on web" outright, not just for video) --
  // asset.base64 has to come first, with FileSystem only as the
  // native-platform fallback, exactly the order chat.ts's
  // handlePickDocument() already uses for the same reason.
  const base64 = asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' }));
  const mimeType = asset.mimeType ?? 'video/mp4';
  const fileExtension = mimeType.includes('/') ? mimeType.split('/')[1] : 'mp4';
  return { base64, fileExtension, mimeType, localUri: asset.uri };
}

/** Records a fresh video with the device camera. Returns null if the
 * client cancels. */
export async function recordVideo(): Promise<PickedVideo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Camera access is needed to record a video.');

  const result = await ImagePicker.launchCameraAsync(VIDEO_PICKER_OPTIONS);
  if (result.canceled || !result.assets?.[0]) return null;
  return toPickedVideo(result.assets[0]);
}

/** Picks an already-recorded video from the photo library. Returns null
 * if the client cancels. */
export async function pickVideoFromLibrary(): Promise<PickedVideo | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Photo library access is needed to choose a video.');

  const result = await ImagePicker.launchImageLibraryAsync(VIDEO_PICKER_OPTIONS);
  if (result.canceled || !result.assets?.[0]) return null;
  return toPickedVideo(result.assets[0]);
}
