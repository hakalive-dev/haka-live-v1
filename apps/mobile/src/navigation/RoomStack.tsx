import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RoomStackParamList, RootStackParamList } from './types';
import { resolveRoomScreenParams } from './roomNavigation';
import { RoomScreen } from '@screens/room/RoomScreen';
import { RoomSettingsScreen } from '@screens/room/RoomSettingsScreen';
import { MusicScreen } from '@screens/room/MusicScreen';
import { UserMusicLibraryScreen } from '@screens/room/UserMusicLibraryScreen';
import { AddMusicScreen } from '@screens/room/AddMusicScreen';
import { PublicProfileScreen } from '@screens/profile/PublicProfileScreen';

const Stack = createNativeStackNavigator<RoomStackParamList>();

type Props = NativeStackScreenProps<RootStackParamList, 'RoomModal'>;

export function RoomStack({ route, navigation }: Props) {
  const roomParams = resolveRoomScreenParams(route.params);

  // Keep nested Room params in sync when RoomModal is re-navigated (e.g. seat invite to another room).
  useEffect(() => {
    if (!roomParams?.roomId) return;
    // `Room` lives in the nested RoomStack, so target it through the RoomModal
    // route (typed as NavigatorScreenParams<RoomStackParamList>).
    navigation.navigate('RoomModal', { screen: 'Room', params: roomParams });
  }, [navigation, roomParams?.roomId, roomParams?.autoTakeSeat]);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, presentation: 'modal' }}>
      <Stack.Screen
        name="Room"
        component={RoomScreen}
        initialParams={roomParams ?? undefined}
      />
      <Stack.Screen name="RoomSettings" component={RoomSettingsScreen} />
      <Stack.Screen name="RoomMusic" component={MusicScreen} />
      <Stack.Screen name="UserMusicLibrary" component={UserMusicLibraryScreen} />
      <Stack.Screen name="AddMusic" component={AddMusicScreen} />
      <Stack.Screen
        name="PublicProfile"
        component={PublicProfileScreen}
        options={{ presentation: 'card' }}
      />
    </Stack.Navigator>
  );
}
