import type { NavigationState, PartialState } from '@react-navigation/native';
import type { RootStackParamList, RoomStackParamList } from './types';
import { navigationRef } from './navigationRef';

type NavState = NavigationState | PartialState<NavigationState>;

function getNavigationFocusPath(state: NavState | undefined): string[] {
  if (!state?.routes?.length) return [];
  const route = state.routes[state.index ?? 0];
  if (!route) return [];
  const child = route.state as NavState | undefined;
  if (child?.routes?.length) {
    return [route.name, ...getNavigationFocusPath(child)];
  }
  return [route.name];
}

/** Show music player chrome on Room, or when the room is kept in the background (outside RoomModal). */
export function shouldShowMusicPlayerOverlayUi(): boolean {
  if (!navigationRef.isReady()) return true;
  const path = getNavigationFocusPath(navigationRef.getRootState());
  const roomModalIdx = path.indexOf('RoomModal');
  if (roomModalIdx === -1) return true;
  return path[path.length - 1] === 'Room';
}

type RoomRouteParams = RoomStackParamList['Room'];

/** Flat or nested RoomModal params → Room screen params. */
export function resolveRoomScreenParams(
  params: RootStackParamList['RoomModal'] | undefined,
): RoomRouteParams | null {
  if (!params) return null;
  const nested = (params as { params?: RoomRouteParams }).params;
  if (nested?.roomId) return nested;
  if ('roomId' in params && params.roomId) return params as RoomRouteParams;
  return null;
}

/** Room id from the focused route (Room or RoomModal). */
export function getActiveRoomIdFromNavigation(): string | undefined {
  if (!navigationRef.isReady()) return undefined;
  const route = navigationRef.getCurrentRoute();
  if (!route) return undefined;
  if (route.name === 'Room') {
    return (route.params as RoomRouteParams | undefined)?.roomId;
  }
  if (route.name === 'RoomModal') {
    return resolveRoomScreenParams(route.params as RootStackParamList['RoomModal'])?.roomId;
  }
  return undefined;
}

/** Open the inviter's live room and optionally auto-take a mic seat. */
export function navigateToRoomForSeatInvite(
  roomId: string,
  autoTakeSeat: number,
  roomMode: 'live' | 'chat' = 'live',
) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('RoomModal', {
    screen: 'Room',
    params: {
      roomId,
      roomMode,
      autoTakeSeat,
    },
  });
}
