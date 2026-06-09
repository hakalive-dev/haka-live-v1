import React, { useLayoutEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@navigation/types';
import { BootSplash } from '@components/BootSplash';
import { hasCompletedIntro } from '../../utils/introStorage';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Splash'>;

/**
 * Routes to Login or Intro after boot. Reuses {@link BootSplash} so there is no
 * second flash (yellow title / different styling) after the root boot splash.
 */
export function SplashScreen() {
  const navigation = useNavigation<Nav>();

  useLayoutEffect(() => {
    let cancelled = false;

    void hasCompletedIntro().then((skipIntro) => {
      if (cancelled) return;
      navigation.replace(skipIntro ? 'Login' : 'Intro');
    });

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return <BootSplash showSpinner={false} />;
}
