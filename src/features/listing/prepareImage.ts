import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Prepare a photo for upload.
 *
 * Two sizes: 1600 px for the listing, 1024 px for the AI call (fewer image
 * tokens, lower latency, no measurable loss of identification quality).
 *
 * The critical part is what this DROPS. `manipulateAsync` re-encodes the image,
 * which strips EXIF — including GPS. A listing photo taken in someone's living
 * room otherwise carries their exact coordinates in its metadata, which would
 * quietly defeat the entire location privacy model.
 */
export async function prepareForListing(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    compress: 0.75,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

export async function prepareForIdentification(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}
