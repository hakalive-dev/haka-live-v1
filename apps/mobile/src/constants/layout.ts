/** Tab bar visual height (60) + spacing; matches MainStack tabItem + design spec ~86 */
export const MAIN_TAB_BAR_RESERVE = 86;

export const TAB_ITEM_HEIGHT = 60;

/** Rendered height of the absolute bottom tab bar in MainStack (flush attachment). */
export function mainTabBarOverlayHeight(insets: { bottom: number }): number {
  return TAB_ITEM_HEIGHT + insets.bottom;
}

export function mainTabContentPaddingBottom(
  insets: { bottom: number },
  extra = 0,
): number {
  return MAIN_TAB_BAR_RESERVE + insets.bottom + extra;
}
