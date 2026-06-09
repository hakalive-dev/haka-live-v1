import React from "react";
import { Image } from "expo-image";

const roomOwnerBadgeImg = require("../../assets/room/room_owner_badge.png");
const roomAdminBadgeImg = require("../../assets/room/room_admin_badge.png");

export function RoomOwnerBadge({ size = 14 }: { size?: number }) {
  return (
    <Image
      source={roomOwnerBadgeImg}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}

export function RoomAdminBadge({ size = 14 }: { size?: number }) {
  return (
    <Image
      source={roomAdminBadgeImg}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}

export function UsernameRoleBadges({
  isRoomOwner,
  isRoomAdmin,
  size = 12,
}: {
  isRoomOwner?: boolean;
  isRoomAdmin?: boolean;
  size?: number;
}) {
  if (isRoomOwner) return <RoomOwnerBadge size={size} />;
  if (isRoomAdmin) return <RoomAdminBadge size={size} />;
  return null;
}
