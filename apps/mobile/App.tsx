import 'react-native-url-polyfill/auto';
import { initReleaseDiagnostics } from './src/diagnostics/releaseDiagnostics';

try {
  initReleaseDiagnostics();
} catch {
  /* diagnostics are best-effort at module load */
}

import React from 'react';
import { registerRootComponent } from 'expo';
import { useKeepAwake } from 'expo-keep-awake';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n'; // initialize the i18next singleton at startup
import { store } from './src/store';
import { queryClient } from './src/api/queryClient';
import { startQueryCachePersistence } from './src/api/queryPersistence';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ToastProvider } from './src/components/Toast';
import { PurchaseSuccessProvider } from './src/components/PurchaseSuccessModal';
import { SeatInvitePromptProvider } from './src/components/SeatInvitePrompt';
import { KeyboardSetup } from './src/components/keyboard';
import { preloadSvgaAssets } from './src/screens/room/SVGAGiftEffect';
import { API_BASE_URL, pingBackend } from './src/api/client';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ConnectivityProvider } from './src/components/Connectivity';

function App() {
  useKeepAwake();

  React.useEffect(() => {
    if (__DEV__) {
      console.log('[Haka] API_BASE_URL:', API_BASE_URL);
    }
    pingBackend();
    void preloadSvgaAssets();
    // Persist the query cache to disk so warm launches paint from cache.
    const stopPersistence = startQueryCachePersistence(queryClient);
    return stopPersistence;
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider preload={false}>
          <KeyboardSetup />
          <SafeAreaProvider>
            <Provider store={store}>
              <QueryClientProvider client={queryClient}>
                <ToastProvider>
                  <PurchaseSuccessProvider>
                    <SeatInvitePromptProvider>
                      <ConnectivityProvider>
                        <RootNavigator />
                      </ConnectivityProvider>
                    </SeatInvitePromptProvider>
                  </PurchaseSuccessProvider>
                </ToastProvider>
              </QueryClientProvider>
            </Provider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

registerRootComponent(App);
