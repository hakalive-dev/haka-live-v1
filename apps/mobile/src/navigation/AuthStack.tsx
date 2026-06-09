import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

function lazyScreen<T = any>(factory: () => T): () => any {
  return () => factory() as any;
}

export function AuthStack() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name="Splash"
        getComponent={lazyScreen(() => require('@screens/auth/SplashScreen').SplashScreen)}
      />
      <Stack.Screen
        name="Intro"
        getComponent={lazyScreen(() => require('@screens/auth/IntroScreen').IntroScreen)}
      />
      <Stack.Screen
        name="Onboarding"
        getComponent={lazyScreen(() => require('@screens/auth/OnboardingScreen').OnboardingScreen)}
      />
      <Stack.Screen
        name="Login"
        getComponent={lazyScreen(() => require('@screens/auth/LoginScreen').LoginScreen)}
      />
      <Stack.Screen
        name="LoginDirect"
        getComponent={lazyScreen(() => require('@screens/auth/LoginDirectScreen').LoginDirectScreen)}
      />
      <Stack.Screen
        name="Register"
        getComponent={lazyScreen(() => require('@screens/auth/RegisterScreen').RegisterScreen)}
      />
      <Stack.Screen
        name="Verify"
        getComponent={lazyScreen(() => require('@screens/auth/VerifyScreen').VerifyScreen)}
      />
      <Stack.Screen
        name="Terms"
        getComponent={lazyScreen(() => require('@screens/auth/TermsScreen').TermsScreen)}
      />
    </Stack.Navigator>
  );
}
