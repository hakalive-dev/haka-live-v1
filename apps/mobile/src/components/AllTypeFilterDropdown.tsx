import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Spacing } from '@/theme';

export type AllTypeFilterOption<T extends string = string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: AllTypeFilterOption<T>[];
  style?: ViewStyle;
  /** Controlled open state — pair with `AllTypeFilterBackdrop` on the screen root. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Anchored “All Type” dropdown (caret + white menu). Matches Coin Seller Details.
 * When using inside a scroll list, control `open` on the screen and render
 * `<AllTypeFilterBackdrop onPress={() => setOpen(false)} />` as a sibling.
 */
export function AllTypeFilterDropdown<T extends string>({
  value,
  onChange,
  options,
  style,
  open: openProp,
  onOpenChange,
}: Props<T>) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setInternalOpen(next);
  };

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <View style={[styles.anchor, style]}>
      <TouchableOpacity
        style={styles.tap}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={styles.label}>{selected.label}</Text>
        <Ionicons
          name={open ? 'caret-up' : 'caret-down'}
          size={11}
          color="#000"
        />
      </TouchableOpacity>

      {open ? (
        <View style={styles.menu}>
          {options.map((opt, index) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.item,
                value === opt.value && styles.itemActive,
                index === options.length - 1 && styles.itemLast,
              ]}
              onPress={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <Text
                style={[
                  styles.itemText,
                  value === opt.value && styles.itemTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Full-screen tap target to dismiss the filter menu (place on screen root). */
export function AllTypeFilterBackdrop({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={styles.backdrop}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close filter menu"
    />
  );
}

const MENU_BG = '#FFFFFF';
const ACTIVE_BG = '#F0EBFF';
const PRIMARY = Colors.primary;

const styles = StyleSheet.create({
  anchor: {
    alignSelf: 'flex-start',
    zIndex: 40,
  },
  tap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  menu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    minWidth: 168,
    backgroundColor: MENU_BG,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDD',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
  },
  item: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECECEC',
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  itemActive: {
    backgroundColor: ACTIVE_BG,
  },
  itemText: {
    fontSize: 14,
    color: '#333',
  },
  itemTextActive: {
    color: PRIMARY,
    fontWeight: '600',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
});
