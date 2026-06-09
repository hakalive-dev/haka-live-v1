import { useWindowDimensions } from 'react-native';

/**
 * Provides responsive layout helpers derived from the current window size.
 * Re-evaluates automatically on orientation change or split-screen resize.
 *
 * Design baseline: 430px wide (iPhone 14 Pro Max).
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();

  /** True when the shortest side is ≥ 600px (iPad / large tablet). */
  const isTablet = Math.min(width, height) >= 600;

  /**
   * Scale a design-spec pixel value (drawn at 430px base width) to the
   * current screen width.  Use for sizes that should grow on larger screens.
   */
  const scale = (designPx: number) => (designPx / 430) * width;

  /**
   * Clamp a value between min and max.  Useful when a scaled value would be
   * unreasonably large on a tablet.
   */
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  /** Standard horizontal screen padding (16px both sides = 32px total). */
  const hPad = 16;

  /** Usable content width after removing standard horizontal padding. */
  const contentWidth = width - hPad * 2;

  return { width, height, isTablet, scale, clamp, hPad, contentWidth };
}
