import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../ui/theme';
import Card from './Card';

interface ScreenCardProps extends PropsWithChildren {
  readonly title: string;
}

/**
 * Issue 72 D: 旧トークン（surface + border）だったカード意匠を `Card` プリミティブ経由で
 * Ink / Summit トークン（white + borderSubtle）へ移行する。
 */
export default function ScreenCard({ children, title }: ScreenCardProps) {
  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 18, fontWeight: '800' },
});
