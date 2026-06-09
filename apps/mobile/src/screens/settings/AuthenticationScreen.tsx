import React, { useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import { Colors, Radius, Spacing } from '@/theme';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '../../store';
import { authApi } from '@/api/auth';
import { setUser } from '@/store/authSlice';

type Props = RootStackScreenProps<'Authentication'>;

function faceStatusLabel(status: string | undefined): { label: string; certified: boolean; pending: boolean } {
  switch (status) {
    case 'approved':
      return { label: 'Certified', certified: true, pending: false };
    case 'pending_admin':
      return { label: 'Under review', certified: false, pending: true };
    case 'in_progress':
      return { label: 'Continue', certified: false, pending: false };
    case 'rejected':
      return { label: 'Retry', certified: false, pending: false };
    default:
      return { label: 'Verify', certified: false, pending: false };
  }
}

export function AuthenticationScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const authUser = useSelector((state: RootState) => state.auth.user);

  const isEmailBound = !!authUser?.email;
  const faceStatus = faceStatusLabel(authUser?.faceVerificationStatus);
  const isFaceCertified = faceStatus.certified;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const me = await authApi.getMe();
          if (active) dispatch(setUser(me));
        } catch {
          /* ignore */
        }
      })();
      return () => {
        active = false;
      };
    }, [dispatch]),
  );

  const handleFaceAuth = useCallback(() => {
    if (authUser?.faceVerificationStatus === 'pending_admin') return;
    navigation.navigate('FaceLiveness');
  }, [navigation, authUser?.faceVerificationStatus]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Authentication</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.mainContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroTextCol}>
            <Text style={styles.heroTitle}>My Authentication</Text>
            <Text style={styles.heroDesc}>
              In order to ensure the property safety of your account and others, we recommend you to
              authenticate
            </Text>
          </View>
          <Text style={styles.heroShield}>🛡️</Text>
        </View>

        <TouchableOpacity
          style={styles.authCard}
          onPress={handleFaceAuth}
          activeOpacity={0.7}
          disabled={faceStatus.pending}
        >
          <View style={[styles.cardIcon, { backgroundColor: '#EDE7FF' }]}>
            <Ionicons name="shield-checkmark" size={24} color={Colors.primary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Face Authentication</Text>
            <Text style={styles.cardDesc}>
              {authUser?.faceVerificationStatus === 'rejected' && authUser.faceRejectedReason
                ? authUser.faceRejectedReason
                : 'Complete liveness checks, then admin approval'}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isFaceCertified
                ? styles.badgeCertified
                : faceStatus.pending
                  ? styles.badgePending
                  : styles.badgePending,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isFaceCertified ? styles.badgeTextCertified : styles.badgeTextPending,
              ]}
            >
              {faceStatus.label}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.authCard}>
          <View style={[styles.cardIcon, { backgroundColor: '#EDE7FF' }]}>
            <Ionicons name="mail-outline" size={24} color={Colors.primary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Bind Email</Text>
            <Text style={styles.cardDesc}>Bind your Email to secure your account</Text>
          </View>
          <View style={[styles.statusBadge, isEmailBound ? styles.badgeCertified : styles.badgeBind]}>
            <Text style={[styles.statusBadgeText, isEmailBound ? styles.badgeTextBind : styles.badgeTextBind]}>
              {isEmailBound ? 'Bound' : 'Bind'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  mainContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  heroTextCol: {
    flex: 1,
    gap: Spacing.sm,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  heroDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  heroShield: {
    fontSize: 64,
  },
  authCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  cardDesc: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeCertified: {
    backgroundColor: '#E8F8EF',
  },
  badgePending: {
    backgroundColor: '#FFF3E0',
  },
  badgeBind: {
    backgroundColor: '#F5F5F5',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeTextCertified: {
    color: '#22C97A',
  },
  badgeTextPending: {
    color: '#E8A020',
  },
  badgeTextBind: {
    color: '#666',
  },
});
