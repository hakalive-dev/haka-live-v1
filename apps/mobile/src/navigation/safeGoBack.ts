import type { NavigationProp, ParamListBase } from "@react-navigation/native";

/**
 * Pops until some navigator can handle GO_BACK. Use instead of bare `goBack()` when
 * the current stack may have only one route (e.g. Room inside RoomModal) or when
 * async/socket handlers might run after the screen was already dismissed — avoids
 * "The action 'GO_BACK' was not handled by any navigator".
 */
export function safeGoBack(navigation: NavigationProp<ParamListBase>): void {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  while (nav) {
    if (nav.canGoBack()) {
      nav.goBack();
      return;
    }
    nav = nav.getParent();
  }
}
