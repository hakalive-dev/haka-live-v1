import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/theme';
import type { PayoutBindFieldSpec } from '@/utils/payoutBindFields';
import type { PayoutBindFormValues } from '@/utils/payoutBindFields';

type Props = {
  fields: PayoutBindFieldSpec[];
  values: PayoutBindFormValues;
  onChange: (key: PayoutBindFieldSpec['key'], value: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitLabel?: string;
};

export function PayoutBindForm({
  fields,
  values,
  onChange,
  onSubmit,
  canSubmit,
  submitLabel = 'Bind',
}: Props) {
  return (
    <View style={styles.form}>
      {fields.map((field) => (
        <View key={field.key} style={styles.field}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            style={[styles.input, field.monospace && styles.inputMono]}
            value={values[field.key] ?? ''}
            onChangeText={(text) => onChange(field.key, text)}
            placeholder={field.placeholder}
            placeholderTextColor={Colors.textTertiary}
            keyboardType={field.keyboardType ?? 'default'}
            autoCapitalize={field.autoCapitalize ?? 'sentences'}
            autoCorrect={false}
          />
        </View>
      ))}

      <TouchableOpacity
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit}
      >
        <Text style={styles.submitBtnText}>{submitLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 15,
    color: '#000',
    backgroundColor: Colors.surfaceElevated,
  },
  inputMono: {
    fontFamily: 'monospace',
  },
  submitBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
