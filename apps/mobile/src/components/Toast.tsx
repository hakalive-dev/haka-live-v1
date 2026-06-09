import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/theme';

type ToastKind = 'info' | 'success' | 'error' | 'soon';

interface ToastState {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
  comingSoon: (feature: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const seqRef = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    seqRef.current += 1;
    setToast({ id: seqRef.current, message, kind });
  }, []);

  const comingSoon = useCallback(
    (feature: string) => show(`${feature} is coming soon`, 'soon'),
    [show],
  );

  return (
    <ToastContext.Provider value={{ show, comingSoon }}>
      {children}
      {toast && <ToastBanner key={toast.id} toast={toast} onDone={() => setToast(null)} />}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastBanner({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();

    const hideTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -80, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onDone());
    }, 2200);

    return () => clearTimeout(hideTimer);
  }, [translateY, opacity, onDone]);

  const { icon, iconColor } = iconFor(toast.kind);

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.wrap,
          { top: insets.top + Spacing.sm, transform: [{ translateY }], opacity },
        ]}
      >
        <View style={styles.card}>
          <View style={[styles.iconBubble, { backgroundColor: iconColor + '22' }]}>
            <Ionicons name={icon} size={16} color={iconColor} />
          </View>
          <Text style={styles.text} numberOfLines={2}>{toast.message}</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

function iconFor(kind: ToastKind): { icon: keyof typeof Ionicons.glyphMap; iconColor: string } {
  switch (kind) {
    case 'success': return { icon: 'checkmark-circle', iconColor: Colors.success };
    case 'error':   return { icon: 'alert-circle',     iconColor: Colors.danger };
    case 'soon':    return { icon: 'sparkles',         iconColor: Colors.primaryLight };
    case 'info':
    default:        return { icon: 'information-circle', iconColor: Colors.info };
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 9999,
    elevation: 30,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    maxWidth: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  iconBubble: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
});
