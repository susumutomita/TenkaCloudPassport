import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../ui/theme';

/** Brief, non-blocking feedback inspired by TenkaCloud's celebration. Never advances. */
export default function CorrectReaction({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let alive = true;
    let preferenceChanged = false;
    let animation: Animated.CompositeAnimation | undefined;
    // Stay still until the OS preference is known. A failed query stays still too.
    if (active)
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((reduced) => {
          if (!alive || preferenceChanged || reduced) return;
          animation = Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.025,
              duration: 160,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1,
              duration: 220,
              useNativeDriver: true,
            }),
          ]);
          animation.start();
        })
        .catch(() => {
          scale.setValue(1);
        });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (reduced) => {
        preferenceChanged = true;
        if (reduced) {
          animation?.stop();
          scale.setValue(1);
        }
      }
    );
    return () => {
      alive = false;
      animation?.stop();
      subscription.remove();
      scale.setValue(1);
    };
  }, [active, scale]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.panel, { transform: [{ scale }] }]}
    >
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  panel: {
    borderWidth: 2,
    borderColor: colors.successText,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
  },
  label: { color: colors.successText, fontSize: 21, fontWeight: '700' },
});
