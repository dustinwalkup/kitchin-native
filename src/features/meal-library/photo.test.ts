import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { IMAGE_MAX_SIDE, IMAGE_QUALITY } from './constants';
import { pickPhoto } from './photo';

// Taking or choosing a meal's photo and shrinking it before upload (specs/redesign/design.md §6.5).
// The picker and the manipulator are native, so both are stood in for here.

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const context = { resize: jest.fn(), renderAsync: jest.fn() };
const rendered = { saveAsync: jest.fn() };
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const ORIGINAL = 'file:///DCIM/IMG_0001.HEIC';
const SAVED = 'file:///cache/ImageManipulator/resized.jpg';

/** What the picker returns for one photo of the given size. */
const asset = (width: number, height: number) => ({
  canceled: false,
  assets: [{ uri: ORIGINAL, width, height }],
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
    granted: true,
  } as never);
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(asset(4032, 3024) as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(asset(4032, 3024) as never);
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(context as never);
  context.renderAsync.mockResolvedValue(rendered);
  rendered.saveAsync.mockResolvedValue({ uri: SAVED, width: 1200, height: 900 });
});

describe('pickPhoto', () => {
  it('asks for the camera, takes a photo and returns it as a smaller JPEG', async () => {
    await expect(pickPhoto('camera')).resolves.toEqual({ kind: 'picked', uri: SAVED });

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 1,
    });
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith(ORIGINAL);
    expect(rendered.saveAsync).toHaveBeenCalledWith({ compress: IMAGE_QUALITY, format: 'jpeg' });
  });

  it('chooses from the library without asking for any permission', async () => {
    await expect(pickPhoto('library')).resolves.toEqual({ kind: 'picked', uri: SAVED });

    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 1,
    });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('is denied, without opening the camera, when camera access is refused', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
      granted: false,
    } as never);

    await expect(pickPhoto('camera')).resolves.toEqual({ kind: 'denied' });

    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it.each([
    ['the member cancels', { canceled: true, assets: null }],
    ['no photo comes back', { canceled: false, assets: [] }],
  ])('is cancelled when %s', async (_, result) => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(result as never);

    await expect(pickPhoto('library')).resolves.toEqual({ kind: 'cancelled' });

    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it.each([
    ['a landscape photo', 4032, 3024, { width: IMAGE_MAX_SIDE }],
    ['a portrait photo', 3024, 4032, { height: IMAGE_MAX_SIDE }],
    ['a square photo', 2000, 2000, { width: IMAGE_MAX_SIDE }],
    ['a photo one pixel too wide', IMAGE_MAX_SIDE + 1, 600, { width: IMAGE_MAX_SIDE }],
  ])('resizes %s by its longest side to 1200 px', async (_, width, height, resize) => {
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(asset(width, height) as never);

    await pickPhoto('camera');

    expect(context.resize).toHaveBeenCalledTimes(1);
    expect(context.resize).toHaveBeenCalledWith(resize);
  });

  it.each([
    ['exactly 1200 px', IMAGE_MAX_SIDE, 900],
    ['smaller', 800, 600],
  ])('keeps the size of a photo %s on its longest side, still saved as JPEG', async (_, w, h) => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(asset(w, h) as never);

    await expect(pickPhoto('library')).resolves.toEqual({ kind: 'picked', uri: SAVED });

    expect(context.resize).not.toHaveBeenCalled();
    expect(rendered.saveAsync).toHaveBeenCalledWith({ compress: IMAGE_QUALITY, format: 'jpeg' });
  });

  it.each([
    [
      'the permission request',
      () => jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockRejectedValue(new Error()),
    ],
    [
      'the camera',
      () =>
        jest
          .mocked(ImagePicker.launchCameraAsync)
          .mockRejectedValue(new Error(`Can't read ${ORIGINAL}`)),
    ],
    ['the resize', () => context.renderAsync.mockRejectedValue(new Error(ORIGINAL))],
    ['the save', () => rendered.saveAsync.mockRejectedValue(new Error(SAVED))],
  ])('fails, keeping no reason, when %s fails', async (_, arrange) => {
    arrange();

    await expect(pickPhoto('camera')).resolves.toEqual({ kind: 'failed' });
  });
});
