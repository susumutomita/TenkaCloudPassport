import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { Locale } from '../../app/i18n/locale';
import type { Case } from '../../domain/forensic/upstream/types';
import { questionSummary, questionTitle } from './tap-answer';

export const casebookColors = {
  ink: '#172d35',
  muted: '#536b71',
  line: '#d7e2df',
  teal: '#086957',
  paper: '#fffefb',
  soft: '#f1f4ef',
  selected: '#e6eee9',
};
export function caseTitle(value: string): string {
  return value.replace(/^\d{2}\s+/, '');
}
export function CaseNavigation({
  cases,
  selected,
  locale,
  disabled,
  onSelect,
}: {
  cases: readonly Case[];
  selected: string;
  locale: Locale;
  disabled: boolean;
  onSelect(item: Case): void;
}) {
  const ja = locale === 'ja';
  const { fontScale } = useWindowDimensions();
  return (
    <View
      style={styles.cases}
      accessibilityLabel={ja ? '事件を選ぶ' : 'Choose a case'}
    >
      {cases.map((item, index) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`${ja ? '事件' : 'Case'} ${index + 1} · ${caseTitle(item.title[locale])}`}
          accessibilityState={{ selected: selected === item.id, disabled }}
          aria-selected={selected === item.id}
          disabled={disabled}
          onPress={() => onSelect(item)}
          style={[
            styles.case,
            fontScale >= 1.6 && styles.largeCase,
            selected === item.id && styles.activeCase,
            disabled && styles.disabled,
          ]}
        >
          <Text style={[styles.kicker, selected === item.id && styles.onDark]}>
            CASE {String(index + 1).padStart(2, '0')}
          </Text>
          <Text style={[styles.name, selected === item.id && styles.onDark]}>
            {caseTitle(item.title[locale])}
          </Text>
          <Text style={[styles.small, selected === item.id && styles.onDark]}>
            {item.questions.filter((q) => q.solved).length} /{' '}
            {item.questions.length} {ja ? '解決' : 'solved'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function QuestionNavigation({
  cases,
  currentCase,
  currentQuestion,
  locale,
  disabled,
  onSelect,
}: {
  cases: readonly Case[];
  currentCase: string;
  currentQuestion: string;
  locale: Locale;
  disabled: boolean;
  onSelect(caseId: string, questionId: string): void;
}) {
  const ja = locale === 'ja';
  const all = cases.flatMap((c) => c.questions.map((q) => `${c.id}/${q.id}`));
  return (
    <View style={styles.list}>
      {cases.map((item, index) => (
        <View key={item.id} style={styles.group}>
          <Text accessibilityRole="header" style={styles.groupTitle}>
            {ja ? '事件' : 'Case'} {index + 1} · {caseTitle(item.title[locale])}
          </Text>
          {item.questions.map((q) => (
            <QuestionRow
              key={q.id}
              item={item}
              question={q}
              number={all.indexOf(`${item.id}/${q.id}`) + 1}
              selected={currentCase === item.id && currentQuestion === q.id}
              locale={locale}
              disabled={disabled}
              onSelect={onSelect}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
function QuestionRow({
  item,
  question: q,
  number,
  selected,
  locale,
  disabled,
  onSelect,
}: {
  item: Case;
  question: Case['questions'][number];
  number: number;
  selected: boolean;
  locale: Locale;
  disabled: boolean;
  onSelect(caseId: string, questionId: string): void;
}) {
  const ja = locale === 'ja';
  const name = `${ja ? '問題' : 'Question'} ${number} · ${questionTitle(q.id, locale)}`;
  const solved = ja ? '解決済み' : 'Solved';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${q.solved ? ` · ${solved}` : ''}\n${questionSummary(q.id, locale)}`}
      accessibilityState={{ selected, disabled }}
      aria-selected={selected}
      disabled={disabled}
      onPress={() => onSelect(item.id, q.id)}
      style={[
        styles.question,
        selected && styles.activeQuestion,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.name}>{name}</Text>
        {selected && (
          <Text style={styles.badge}>{ja ? '選択中' : 'Selected'}</Text>
        )}
        {q.solved && <Text style={styles.badge}>{solved}</Text>}
      </View>
      <Text style={styles.small}>{questionSummary(q.id, locale)}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  cases: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  case: {
    flexBasis: 145,
    flexGrow: 1,
    minWidth: 0,
    minHeight: 80,
    gap: 5,
    padding: 12,
    borderWidth: 1,
    borderColor: casebookColors.line,
    borderRadius: 10,
    backgroundColor: casebookColors.paper,
  },
  largeCase: { flexBasis: '100%' },
  activeCase: {
    backgroundColor: casebookColors.ink,
    borderColor: casebookColors.ink,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    color: casebookColors.teal,
    letterSpacing: 1,
  },
  onDark: { color: '#ffffff' },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: casebookColors.ink,
    flexShrink: 1,
  },
  small: { fontSize: 12, color: casebookColors.muted },
  list: { gap: 24 },
  group: { gap: 8 },
  groupTitle: { fontSize: 17, fontWeight: '700', color: casebookColors.ink },
  question: {
    minHeight: 56,
    gap: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: casebookColors.line,
    borderRadius: 10,
    backgroundColor: casebookColors.paper,
  },
  activeQuestion: {
    borderColor: casebookColors.teal,
    backgroundColor: casebookColors.selected,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  badge: { fontSize: 12, fontWeight: '700', color: casebookColors.teal },
  disabled: { opacity: 0.6 },
});
