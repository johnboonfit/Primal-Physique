import { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  type?: ThemeColor;
};

/** forwardRef so a caller can measure a ThemedView's on-screen position
 * (e.g. the calendar's drag-and-drop needs each day-row's real bounds) —
 * existing callers that don't pass a ref are unaffected. */
export const ThemedView = forwardRef<View, ThemedViewProps>(function ThemedView({ style, type, ...otherProps }, ref) {
  const theme = useTheme();

  return <View ref={ref} style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
});
