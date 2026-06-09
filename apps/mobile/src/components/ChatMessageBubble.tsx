import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../theme';
import type { UserEquippedCosmetics } from '@/types';
import { UserAvatar } from './UserAvatar';
import { UserIdBadge } from './UserIdBadge';
import { CosmeticBackground } from './CosmeticBackground';
import {
  CosmeticChatBubbleShell,
  COSMETIC_CHAT_AVATAR_SIZE,
} from './CosmeticChatBubbleShell';
import { getChatBubbleVisualSources } from '@/utils/chatCosmetics';

export type ChatMessage = {
  id: string;
  type: 'text' | 'quick' | 'gift_notice' | 'system';
  content: string;
  createdAt: string | Date;
  sender: {
    id: string;
    displayName?: string | null;
    avatar?: string | null;
    hakaId?: string | null;
    activeSpecialId?: string | null;
    activeSpecialIdLevel?: string | null;
  } & UserEquippedCosmetics;
};

type Props = {
  message: ChatMessage;
  isHost?: boolean;
};

export function ChatMessageBubble({ message, isHost }: Props) {
  if (message.type === 'gift_notice') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  if (message.type === 'system') {
    return (
      <View style={styles.row}>
        <View style={styles.systemAvatar}>
          <Ionicons name="megaphone" size={16} color={Colors.textInverse} />
        </View>
        <View style={styles.body}>
          <Text style={styles.systemName}>System</Text>
          <View style={styles.systemBubble}>
            <Text style={styles.systemBubbleText}>{message.content}</Text>
          </View>
        </View>
      </View>
    );
  }

  const { fill, animation, fallback } = getChatBubbleVisualSources(message.sender);
  const hasBubble = !!(fill || animation);
  const senderHeader = (
    <View style={styles.nameRow}>
      <Text style={[styles.name, isHost && styles.nameHost]} numberOfLines={1}>
        {message.sender.displayName ?? 'User'}
      </Text>
      {message.sender.activeSpecialId ? (
        <UserIdBadge
          hakaId={message.sender.hakaId ?? null}
          activeSpecialId={message.sender.activeSpecialId}
          activeSpecialIdLevel={message.sender.activeSpecialIdLevel}
          width={72}
          height={18}
          hidePlain
        />
      ) : null}
    </View>
  );

  if (hasBubble) {
    return (
      <View style={styles.cosmeticWrap}>
        <CosmeticChatBubbleShell
          fill={fill}
          animation={animation}
          fallback={fallback}
          avatar={
            <UserAvatar
              user={{
                displayName: message.sender.displayName ?? '',
                avatar: message.sender.avatar ?? null,
                equippedFrame: message.sender.equippedFrame ?? null,
                equippedRing: message.sender.equippedRing ?? null,
              }}
              size={COSMETIC_CHAT_AVATAR_SIZE}
            />
          }
          header={senderHeader}
        >
          <Text style={styles.text}>{message.content}</Text>
        </CosmeticChatBubbleShell>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <UserAvatar
        user={{
          displayName: message.sender.displayName ?? '',
          avatar: message.sender.avatar ?? null,
          equippedFrame: message.sender.equippedFrame ?? null,
          equippedRing: message.sender.equippedRing ?? null,
        }}
        size={32}
      />
      <View style={styles.body}>
        {senderHeader}
        <CosmeticBackground
          source={fill}
          animationSource={animation}
          style={[
            styles.bubble,
            message.type === 'quick' && styles.bubbleQuick,
          ]}
          contentStyle={styles.bubbleInner}
        >
          <Text style={styles.text}>{message.content}</Text>
        </CosmeticBackground>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  cosmeticWrap: {
    marginBottom: Spacing.sm,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  nameHost: {
    color: Colors.gold,
  },
  bubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: '90%',
    overflow: 'hidden',
  },
  bubbleInner: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bubbleQuick: {
    backgroundColor: Colors.primarySubtle,
    borderColor: Colors.primaryLight,
  },
  text: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  systemRow: {
    alignSelf: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldSubtle,
  },
  systemText: {
    fontSize: 11,
    color: Colors.gold,
    fontWeight: '500',
  },
  systemAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.gold,
  },
  systemBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.goldSubtle,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gold,
    maxWidth: '90%',
  },
  systemBubbleText: {
    fontSize: 13,
    color: Colors.gold,
    fontWeight: '500',
  },
});
