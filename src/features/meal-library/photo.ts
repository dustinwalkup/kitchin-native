import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { IMAGE_MAX_SIDE, IMAGE_QUALITY } from './constants';

// Taking or choosing a meal's photo, and shrinking it before it's uploaded (specs/redesign/design.md
// §6.4). The phone does the resizing, so an upload is a few hundred kilobytes, never a 12 MP original.

export type PickedPhoto =
  | { kind: 'picked'; uri: string }
  | { kind: 'cancelled' }
  /** The member has refused camera access; only Settings can change that. */
  | { kind: 'denied' }
  | { kind: 'failed' };

/**
 * Opens the camera or the photo library and returns the photo as a JPEG no larger than
 * `IMAGE_MAX_SIDE` on its longest side. The library needs no permission on iOS: the system picker
 * shares only the photo chosen.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto> {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { kind: 'denied' };
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || result.assets.length === 0) return { kind: 'cancelled' };

    const { uri, width, height } = result.assets[0];
    const context = ImageManipulator.manipulate(uri);
    if (Math.max(width, height) > IMAGE_MAX_SIDE) {
      context.resize(width >= height ? { width: IMAGE_MAX_SIDE } : { height: IMAGE_MAX_SIDE });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: IMAGE_QUALITY, format: SaveFormat.JPEG });
    return { kind: 'picked', uri: saved.uri };
  } catch {
    // The reason can name a file on the phone, so it isn't kept (R26.4).
    return { kind: 'failed' };
  }
}
