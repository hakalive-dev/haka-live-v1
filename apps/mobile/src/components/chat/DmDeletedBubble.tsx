import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dmMessageBubbleStyles } from '@components/chat/DmMessageRow';
import { Colors } from '@/theme';

type Props = {
  isMine: boolean;
};

export function DmDeletedBubble({ isMine }: Props) {
  return (
    <View
      style={[
        dmMessageBubbleStyles.bubble,
        isMine ? dmMessageBubbleStyles.bubbleMine : dmMessageBubbleStyles.bubbleTheirs,
        styles.tombstone,
      ]}
    >
      <Text
        style={[
          dmMessageBubbleStyles.bubbleText,
          isMine ? styles.textMine : styles.textTheirs,
        ]}
      >
        This message was deleted
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tombstone: {
    opacity: 0.85,
  },
  textMine: {
    color: Colors.textInverse,
    fontStyle: 'italic',
  },
  textTheirs: {
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },
});
