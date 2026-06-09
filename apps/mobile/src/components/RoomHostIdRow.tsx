import React from 'react';
import { StyleSheet, TextStyle } from 'react-native';
import { CopyableId } from './CopyableId';
import { UserIdBadge } from './UserIdBadge';
import {
  idsMatch,
  resolvePublicUserId,
  stripIdLabel,
  type PublicIdFields,
} from '@/utils/publicUserId';

interface Props extends PublicIdFields {
  activeSpecialIdLevel?: string | null;
  /** First line shown above the ID (room title or display name). */
  headline?: string | null;
  textStyle?: TextStyle | TextStyle[];
  badgeWidth?: number;
  badgeHeight?: number;
}

export function RoomHostIdRow({
  activeSpecialId,
  activeSpecialIdLevel,
  hakaId,
  username,
  headline,
  textStyle,
  badgeWidth = 96,
  badgeHeight = 22,
}: Props) {
  const publicId = resolvePublicUserId({ activeSpecialId, hakaId, username });
  if (!publicId) return null;

  if (headline && idsMatch(publicId, headline)) {
    return null;
  }

  const displayValue = stripIdLabel(publicId) ?? publicId;

  if (activeSpecialId?.trim() && activeSpecialIdLevel?.trim()) {
    return (
      <UserIdBadge
        hakaId={hakaId ?? null}
        activeSpecialId={activeSpecialId}
        activeSpecialIdLevel={activeSpecialIdLevel}
        width={badgeWidth}
        height={badgeHeight}
        hidePlain
      />
    );
  }

  return (
    <CopyableId value={displayValue} textStyle={textStyle ?? styles.defaultId} />
  );
}

const styles = StyleSheet.create({
  defaultId: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
});
