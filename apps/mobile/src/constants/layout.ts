/** Tab bar visual height (60) + spacing; matches MainStack tabItem + design spec ~86 */
export const MAIN_TAB_BAR_RESERVE = 86;

export const TAB_ITEM_HEIGHT = 60;

export function mainTabContentPaddingBottom(
  insets: { bottom: number },
  extra = 0,
): number {
  return MAIN_TAB_BAR_RESERVE + insets.bottom + extra;
}
