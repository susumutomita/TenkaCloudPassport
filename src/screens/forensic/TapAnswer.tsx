import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Locale } from '../../app/i18n/locale';
import ActionButton from '../../components/ActionButton';
import { colors, spacing } from '../../ui/theme';
import type {
  AnswerField,
  AnswerValues,
  TapAnswer as Form,
} from './tap-answer';
import { answerLabel, updateAnswerField } from './tap-answer';

export function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      aria-selected={selected}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.label}>
        {selected ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}
export default function TapAnswer({
  form,
  locale,
  disabled,
  onChange,
  values,
  onValues,
}: {
  form: Form;
  locale: Locale;
  disabled: boolean;
  values: AnswerValues;
  onValues(values: AnswerValues): void;
  onChange(answer: string): void;
}) {
  const ja = locale === 'ja';
  function change(field: AnswerField, option: string) {
    const updated = {
      ...values,
      [field.id]: updateAnswerField(field, values[field.id] ?? [], option),
    };
    onValues(updated);
    onChange(form.encode(updated));
  }
  return (
    <View style={styles.stack}>
      {form.fields.map((field) => (
        <View key={field.id} style={styles.stack}>
          <Text style={styles.heading}>{field.label[ja ? 0 : 1]}</Text>
          {field.kind === 'number' ? (
            <NumberPad
              field={field}
              digits={values[field.id]?.join('') || '—'}
              ja={ja}
              disabled={disabled}
              change={(option) => change(field, option)}
            />
          ) : (
            <Options
              field={field}
              locale={locale}
              selected={values[field.id] ?? []}
              disabled={disabled}
              change={(option) => change(field, option)}
            />
          )}
        </View>
      ))}
    </View>
  );
}
function NumberPad({
  field,
  digits,
  ja,
  disabled,
  change,
}: {
  field: AnswerField;
  digits: string;
  ja: boolean;
  disabled: boolean;
  change(option: string): void;
}) {
  const hints: Record<string, string> = {
    C: ja ? '数字を消去' : 'Clear number',
    '⌫': ja ? '末尾の数字を削除' : 'Delete last digit',
  };
  return (
    <>
      <Text
        accessibilityLiveRegion="polite"
        testID={`answer-${field.id}`}
        style={styles.number}
      >
        {digits}
      </Text>
      <View style={styles.keys}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(
          (digit) => (
            <View key={digit} style={styles.key}>
              <ActionButton
                label={digit}
                accessibilityHint={
                  hints[digit] ?? (ja ? '数字を追加' : 'Append digit')
                }
                disabled={disabled}
                variant="secondary"
                onPress={() => change(digit)}
              />
            </View>
          )
        )}
      </View>
    </>
  );
}
function Options({
  field,
  locale,
  selected,
  disabled,
  change,
}: {
  field: AnswerField;
  locale: Locale;
  selected: readonly string[];
  disabled: boolean;
  change(option: string): void;
}) {
  return (
    <>
      {field.options.map((option) => {
        const rank = field.kind === 'ordered' ? selected.indexOf(option) : -1;
        return (
          <Choice
            key={option}
            label={`${rank >= 0 ? `${rank + 1}. ` : ''}${answerLabel(option, locale)}`}
            selected={selected.includes(option)}
            disabled={
              disabled ||
              (!selected.includes(option) &&
                field.kind === 'ordered' &&
                selected.length === field.limit)
            }
            onPress={() => change(option)}
          />
        );
      })}
    </>
  );
}
const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  choice: {
    minHeight: 52,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    justifyContent: 'center',
  },
  selected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.65 },
  label: { color: colors.ink, fontSize: 16, flexShrink: 1 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  key: { flexBasis: '28%', flexGrow: 1, minWidth: 0 },
  number: { fontSize: 24, color: colors.ink },
});
