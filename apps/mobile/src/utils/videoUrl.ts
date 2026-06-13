/** True when the URL points at a file the native/HTML5 player can decode. */
export function isPlayableVideoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes('/moments/videos/');
}
