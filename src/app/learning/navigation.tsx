import { createContext, useContext } from 'react';
import ActionButton from '../../components/ActionButton';
import type { Locale } from '../i18n/locale';

export const LearningNavigation = createContext<
  ((locale: Locale) => void) | null
>(null);
export function LearningEntry({
  locale,
  disabled = false,
}: {
  readonly locale: Locale;
  readonly disabled?: boolean;
}) {
  const open = useContext(LearningNavigation);
  if (!open) return null;
  return (
    <ActionButton
      label={
        locale === 'ja'
          ? 'アルゴリズム・設計を学ぶ'
          : 'Learn algorithms & design'
      }
      onPress={() => open(locale)}
      disabled={disabled}
      variant="primary"
    />
  );
}
