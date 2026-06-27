/**
 * Safely converts a Supabase Storage URL to use the Image Transformation API
 * for compression and resizing, reducing bandwidth on slow networks.
 *
 * E.g.
 * Original: https://xxx.supabase.co/storage/v1/object/public/checkin-photos/image.jpg
 * Optimized: https://xxx.supabase.co/storage/v1/render/image/public/checkin-photos/image.jpg?width=300&quality=75&resize=cover
 */
export function getOptimizedPhotoUrl(
  url: string | null | undefined,
  width = 300,
  quality = 75
): string {
  if (!url) return "";

  // If it's a Supabase storage object URL, we route it through the render engine
  if (url.includes(".supabase.co/storage/v1/object/public/")) {
    return (
      url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
      `?width=${width}&quality=${quality}&resize=cover`
    );
  }

  return url;
}
