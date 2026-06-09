import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Spacing } from '@/theme';

export type PurchaseSuccessSign = 'plus' | 'minus';

interface SuccessState {
  title: string;
  coinsAmount: number;
  balance: number;
  sign: PurchaseSuccessSign;
}

interface PurchaseSuccessContextValue {
  show: (
    coinsAmount: number,
    balance: number,
    title?: string,
    sign?: PurchaseSuccessSign,
  ) => void;
}

const PurchaseSuccessContext = createContext<PurchaseSuccessContextValue | null>(null);

export function PurchaseSuccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SuccessState | null>(null);
  const seqRef = useRef(0);

  const show = useCallback((
    coinsAmount: number,
    balance: number,
    title = 'Purchase Success',
    sign: PurchaseSuccessSign = 'plus',
  ) => {
    seqRef.current += 1;
    setState({ title, coinsAmount, balance, sign });
  }, []);

  return (
    <PurchaseSuccessContext.Provider value={{ show }}>
      {children}
      {state && (
        <SuccessModal
          key={seqRef.current}
          state={state}
          onDismiss={() => setState(null)}
        />
      )}
    </PurchaseSuccessContext.Provider>
  );
}

export function usePurchaseSuccess() {
  const ctx = useContext(PurchaseSuccessContext);
  if (!ctx) throw new Error('usePurchaseSuccess must be used inside <PurchaseSuccessProvider>');
  return ctx;
}

function SuccessModal({ state, onDismiss }: { state: SuccessState; onDismiss: () => void }) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Animated.View style={[styles.container, { transform: [{ scale }], opacity }]}>
          {/* Floating coin icon */}
          <View style={styles.coinCircle}>
            <LinearGradient
              colors={['#F5C842', '#E8A020']}
              style={styles.coinGradient}
            >
              <Image
                source={require('../../assets/coin.png')}
                style={styles.coinImage}
                contentFit="contain"
              />
            </LinearGradient>
          </View>

          <View style={styles.card}>
            {/* Green accent at top */}
            <LinearGradient
              colors={['#22C97A18', '#FFFFFF00']}
              style={styles.topGlow}
            />

            <Text style={styles.title}>{state.title}</Text>

            {/* Amount row */}
            <View style={styles.amountBox}>
              <View style={styles.amountCoinCircle}>
                <Image
                  source={require('../../assets/coin.png')}
                  style={styles.amountCoinImg}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.amountText}>
                {state.sign === 'minus' ? '-' : '+'}
                {state.coinsAmount.toLocaleString()}
              </Text>
            </View>

            {/* Balance line */}
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Balance: </Text>
              <Image
                source={require('../../assets/coin.png')}
                style={styles.balanceCoinImg}
                contentFit="contain"
              />
              <Text style={styles.balanceValue}>
                {state.balance.toLocaleString()}
              </Text>
            </View>

            {/* Got it button */}
            <Pressable style={styles.button} onPress={dismiss}>
              <Text style={styles.buttonText}>Got it</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  container: {
    width: '100%',
    alignItems: 'center',
  },
  coinCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    zIndex: 2,
    marginBottom: -40,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  coinGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinImage: {
    width: 44,
    height: 44,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    paddingTop: 52,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B6B18',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  amountCoinCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCoinImg: {
    width: 20,
    height: 20,
  },
  amountText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  balanceLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  balanceCoinImg: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  button: {
    backgroundColor: '#4CAF50',
    borderRadius: Radius.lg,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
