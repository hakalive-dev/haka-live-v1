import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_ITEM_HEIGHT } from '../constants/layout';

import { useMessagesBadgeQuery } from '@hooks/queries/useMessagesBadgeQuery';
import { Colors } from '@/theme';
import { MainTabParamList } from './types';

import HomeTabIconSelected from '../../assets/tab-icons/home_select.svg';
import HomeTabIconUnselected from '../../assets/tab-icons/home_unselect.svg';
import VideoTabIconSelected from '../../assets/tab-icons/video_select.svg';
import VideoTabIconUnselected from '../../assets/tab-icons/video_unselect.svg';
import GameTabIconSelected from '../../assets/tab-icons/game_select.svg';
import GameTabIconUnselected from '../../assets/tab-icons/game_unselect.svg';
import MessageTabIconSelected from '../../assets/tab-icons/Message_select.svg';
import MessageTabIconUnselected from '../../assets/tab-icons/Message_unselect.svg';
import ProfileTabIconSelected from '../../assets/tab-icons/profile_select.svg';
import ProfileTabIconUnselected from '../../assets/tab-icons/profile_unselect.svg';

const Tab = createBottomTabNavigator<MainTabParamList>();

function lazyTabScreen<T = React.ComponentType>(factory: () => T): () => T {
  return () => factory() as T;
}

/** Same rendered width/height for every tab SVG. */
const TAB_ICON_SIZE = 36;

const ACTIVE_COLOR = '#FF2D55';
const INACTIVE_COLOR = '#DDDDDD';
const CHAT_TAB_ROUTE = 'Chat';

function formatTabBadgeCount(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

function TabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const badgeQuery = useMessagesBadgeQuery();
  const unreadMessages = badgeQuery.data?.count ?? 0;

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const showChatBadge =
          route.name === CHAT_TAB_ROUTE && unreadMessages > 0 && !badgeQuery.isLoading;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tabItem}
            onPress={onPress}
            activeOpacity={0.7}
          >
            <View style={styles.tabIconWrap}>
              {options.tabBarIcon?.({
                focused,
                color: focused ? ACTIVE_COLOR : INACTIVE_COLOR,
                size: 25,
              })}
              {showChatBadge ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {formatTabBadgeCount(unreadMessages)}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function MainStack() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      {/* order 0 — pulse/heart: Home (live feed) */}
      <Tab.Screen
        name="Home"
        getComponent={lazyTabScreen(() => require('@screens/main/HomeScreen').HomeScreen)}
        options={{
          tabBarIcon: ({ focused }) =>
            focused ? (
              <HomeTabIconSelected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ) : (
              <HomeTabIconUnselected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ),
        }}
      />
      {/* order 1 — videocam: Party */}
      <Tab.Screen
        name="Live"
        getComponent={lazyTabScreen(() => require('@screens/main/PartyScreen').PartyScreen)}
        options={{
          tabBarIcon: ({ focused }) =>
            focused ? (
              <VideoTabIconSelected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ) : (
              <VideoTabIconUnselected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ),
        }}
      />
      {/* order 2 — game-controller: Discover */}
      <Tab.Screen
        name="Discover"
        getComponent={lazyTabScreen(() => require('@screens/main/DiscoverScreen').DiscoverScreen)}
        options={{
          tabBarIcon: ({ focused }) =>
            focused ? (
              <GameTabIconSelected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ) : (
              <GameTabIconUnselected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ),
        }}
      />
      {/* order 3 — chatbubbles: Chat */}
      <Tab.Screen
        name="Chat"
        getComponent={lazyTabScreen(() => require('@screens/main/ChatScreen').ChatScreen)}
        options={{
          tabBarIcon: ({ focused }) =>
            focused ? (
              <MessageTabIconSelected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ) : (
              <MessageTabIconUnselected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ),
        }}
      />
      {/* order 4 — person-circle: Profile / Me */}
      <Tab.Screen
        name="Profile"
        getComponent={lazyTabScreen(() => require('@screens/main/ProfileScreen').ProfileScreen)}
        options={{
          tabBarIcon: ({ focused }) =>
            focused ? (
              <ProfileTabIconSelected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ) : (
              <ProfileTabIconUnselected width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} />
            ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_ITEM_HEIGHT,
  },
  tabIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadge: {
    position: 'absolute',
    top: -2,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Colors.live,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
