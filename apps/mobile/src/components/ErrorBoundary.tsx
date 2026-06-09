import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { logDiagnostic } from '../diagnostics/releaseDiagnostics';
import { recordError as recordCrashlyticsError } from '../diagnostics/crashlyticsBridge';
import { Colors, Spacing, Typography } from '../theme';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const err = error instanceof Error ? error : new Error(String(error));
    logDiagnostic('react_boundary', err.message, {
      stack: err.stack?.slice(0, 2000),
      componentStack: info.componentStack?.slice(0, 1500),
    });
    recordCrashlyticsError(err, `react_boundary: ${info.componentStack?.slice(0, 500) ?? ''}`);
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>{this.state.message}</Text>
        <TouchableOpacity style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  title: {
    ...Typography.styles.h2,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  body: {
    ...Typography.styles.bodySmall,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 999,
  },
  buttonText: {
    ...Typography.styles.button,
  },
});
