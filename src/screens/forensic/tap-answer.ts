import type { Projection } from '../../domain/forensic/upstream/types';

type Case = Projection['cases'][number];
export interface AnswerField {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly options: readonly string[];
  readonly kind?: 'number' | 'ordered' | 'multiple';
  readonly limit?: number;
}
export type AnswerValues = Readonly<Record<string, readonly string[]>>;
export interface TapAnswer {
  readonly fields: readonly AnswerField[];
  encode(values: AnswerValues): string;
}
const yesNo = ['yes', 'no'];
const titles: Record<string, readonly [string, string]> = {
  account: ['使われたアカウント', 'Account used'],
  authority: ['変更の承認', 'Change approval'],
  attribution: ['操作した人をどこまで特定できる？', 'Limits of attribution'],
  order: ['4つの操作の順序', 'Order four events'],
  bytes: ['外部へ届いたバイト数', 'Bytes delivered outside'],
  scope: ['確認できた流出範囲', 'Confirmed delivery scope'],
  trust: ['バックアップを消せた権限', 'Backup deletion authority'],
  copy: ['復旧に使えるコピー', 'Recoverable copy'],
  assurance: ['データ損失と復旧範囲', 'Data loss and recovery limits'],
  diagnose: ['不審な設定と未調査の対象', 'Suspect task and unknown object'],
  preserve: ['変更前に証拠を保全', 'Preserve before changes'],
  contain: ['不審な対象だけを封じ込める', 'Contain only the suspect'],
  restore: ['正常な更新を維持', 'Retain the approved updater'],
  reboot: ['再起動後の観測', 'Observe after simulated restart'],
  assessment: ['対処の結果を判断', 'Assess the outcome'],
};
export function questionTitle(id: string, locale: 'ja' | 'en'): string {
  return titles[id]?.[locale === 'ja' ? 0 : 1] ?? id;
}
const summaries: Record<string, readonly [string, string]> = {
  account: ['認証ログと操作ログを照合', 'Connect login and action records'],
  authority: [
    '実際の操作と承認範囲を比較',
    'Compare actions with the approved scope',
  ],
  attribution: [
    '記録が証明できる範囲を判断',
    'Decide what the records can establish',
  ],
  order: [
    '時差を読み、ログの順序を組み立てる',
    'Resolve time zones and sequence the logs',
  ],
  bytes: [
    '受領記録の重複と範囲を調べる',
    'Inspect duplicate and overlapping receipts',
  ],
  scope: [
    '到達の証拠と観測の穴を区別',
    'Separate delivery evidence from coverage gaps',
  ],
  trust: ['権限の境界を追う', 'Trace the permission boundary'],
  copy: [
    '保存・鍵・復元記録を比較',
    'Compare copies, keys and restore records',
  ],
  assurance: [
    'チェックポイントと確認範囲を調べる',
    'Check recovery points and verification limits',
  ],
  diagnose: [
    '一覧・承認・履歴を突き合わせる',
    'Correlate inventory, approvals and history',
  ],
  preserve: [
    '模擬対処の前に元の記録を守る',
    'Retain original records before simulated response',
  ],
  contain: [
    '設定・ファイル・通信の対象を選ぶ',
    'Choose task, file and traffic targets',
  ],
  restore: ['承認済みの更新経路を確認', 'Check the approved update path'],
  reboot: [
    '模擬再起動で新しい記録を読む',
    'Read new records after simulated restart',
  ],
  assessment: [
    '再発・正常更新・調査範囲を確認',
    'Check recurrence, normal updates and scope',
  ],
};
export function questionSummary(id: string, locale: 'ja' | 'en'): string {
  return summaries[id]?.[locale === 'ja' ? 0 : 1] ?? id;
}
export function answerLabel(value: string, locale: 'ja' | 'en'): string {
  if (locale !== 'ja') return value;
  const labels: Record<string, string> = {
    approved: '承認されていた',
    unauthorized: '承認されていなかった',
    'owner-proven': 'アカウントの本人が操作したと断定できる',
    'session-used;human-unknown':
      '同じログイン後の操作だと分かるが、操作した人は不明',
    yes: 'はい',
    no: 'いいえ',
    snapshot: '変更前の記録を保全する',
    reboot: '模擬再起動する',
  };
  return labels[value] ?? value;
}
// These candidates come exclusively from the public evidence shown to the learner.
// No private expected answers, citations, seeds or grading helpers belong here.
function strings(value: unknown, key: string): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([name, item]) => [
    ...(name === key && typeof item === 'string' ? [item] : []),
    ...strings(item, key),
  ]);
}
function file(c: Case, id: string): unknown {
  try {
    return JSON.parse(c.evidence.find((e) => e.id === id)?.content ?? 'null');
  } catch {
    return null;
  }
}
function values(c: Case, id: string, key: string): string[] {
  return [...new Set(strings(file(c, id), key))];
}
function field(
  id: string,
  ja: string,
  en: string,
  options: readonly string[],
  kind?: AnswerField['kind'],
  limit?: number
): AnswerField {
  return {
    id,
    label: [ja, en],
    options,
    ...(kind ? { kind } : {}),
    ...(limit === undefined ? {} : { limit }),
  };
}
const chosen = (v: AnswerValues, id: string) => v[id]?.join(',') ?? '';
function form(
  fields: readonly AnswerField[],
  encode: (v: AnswerValues) => string
): TapAnswer | null {
  if (fields.some((f) => f.kind !== 'number' && !f.options.length)) return null;
  return {
    fields,
    encode: (v) =>
      fields.every((f) => {
        const selected = v[f.id] ?? [];
        if (f.kind === 'number') return /^\d+$/.test(selected.join(''));
        return (
          selected.length > 0 &&
          (f.kind === 'ordered' ? selected.length === f.limit : true) &&
          selected.every((s) => f.options.includes(s))
        );
      })
        ? encode(v).length <= 512
          ? encode(v)
          : ''
        : '',
  };
}
const single = (id: string, options: readonly string[]) =>
  form([field(id, '回答を選ぶ', 'Choose an answer', options)], (v) =>
    chosen(v, id)
  );
function identity(c: Case, questionId: string): TapAnswer | null {
  if (questionId === 'account')
    return single('account', values(c, 'I-IDP', 'account'));
  if (questionId === 'authority')
    return single('authority', ['approved', 'unauthorized']);
  if (questionId === 'attribution')
    return single('attribution', [
      'owner-proven',
      'session-used;human-unknown',
    ]);
  return null;
}
function timeline(c: Case, questionId: string): TapAnswer | null {
  if (questionId === 'order')
    return form(
      [
        field(
          'order',
          '早い順に4つ選ぶ（再タップで取り消し）',
          'Choose four in time order (tap again to undo)',
          [
            ...new Set(
              ['T-AUDIT', 'T-OBJECT', 'T-NET'].flatMap((id) =>
                values(c, id, 'event_id')
              )
            ),
          ],
          'ordered',
          4
        ),
      ],
      (v) => chosen(v, 'order')
    );
  if (questionId === 'bytes')
    return form([field('bytes', 'バイト数', 'Bytes', [], 'number')], (v) =>
      chosen(v, 'bytes')
    );
  if (questionId === 'scope') {
    const objects = values(c, 'T-OBJECT', 'object');
    return form(
      [
        field(
          'confirmed',
          '外部への到達を確認（複数選択）',
          'Confirmed outside delivery (multiple)',
          objects,
          'multiple'
        ),
        field('unresolved', '到達は不明', 'Delivery unresolved', objects),
      ],
      (v) =>
        `confirmed=${chosen(v, 'confirmed')};unresolved=${chosen(v, 'unresolved')}`
    );
  }
  return null;
}
function recovery(c: Case, questionId: string): TapAnswer | null {
  if (questionId === 'trust')
    return single('trust', values(c, 'B-ACCESS', 'role'));
  if (questionId === 'copy')
    return single('copy', values(c, 'B-CATALOG', 'copy_id'));
  if (questionId === 'assurance')
    return form(
      [
        field(
          'minutes',
          '失われうる時間（分）',
          'Potential loss window (minutes)',
          [],
          'number'
        ),
        field(
          'production',
          '本番全体の復旧まで確認できた？',
          'Production recovery established?',
          yesNo
        ),
      ],
      (v) =>
        `loss_window_minutes=${chosen(v, 'minutes')};production_ready=${chosen(v, 'production')}`
    );
  return null;
}
function endpoint(c: Case, questionId: string): TapAnswer | null {
  const tasks = values(c, 'E-INVENTORY', 'id');
  const targets = values(c, 'E-INVENTORY', 'target');
  if (questionId === 'diagnose')
    return form(
      [
        field('suspect', '不審な実行設定', 'Suspect task', tasks),
        field('unknown', '未調査の対象', 'Unexamined object', [
          ...tasks,
          ...values(c, 'E-INVENTORY', 'unresolved_object'),
        ]),
      ],
      (v) => `suspect=${chosen(v, 'suspect')};unknown=${chosen(v, 'unknown')}`
    );
  if (questionId === 'preserve' || questionId === 'reboot') {
    const plan = file(c, 'E-PLAN') as { commands?: unknown } | null;
    const commands = Array.isArray(plan?.commands)
      ? plan.commands.filter(
          (s): s is string => typeof s === 'string' && !s.includes('=')
        )
      : [];
    return single('action', commands);
  }
  if (questionId === 'contain')
    return form(
      [
        field('disable', '無効にする実行設定', 'Task to disable', tasks),
        field('quarantine', '隔離する対象', 'Target to quarantine', targets),
        field(
          'block',
          '通信を止める対象',
          'Target whose traffic to block',
          targets
        ),
      ],
      (v) =>
        `disable=${chosen(v, 'disable')};quarantine=${chosen(v, 'quarantine')};block=${chosen(v, 'block')}`
    );
  if (questionId === 'restore')
    return form(
      [
        field('restore', '復旧する対象', 'Target to restore', targets),
        field('keep', '維持する実行設定', 'Task to retain', tasks),
      ],
      (v) => `restore=${chosen(v, 'restore')};keep=${chosen(v, 'keep')}`
    );
  if (questionId === 'assessment')
    return form(
      [
        field(
          'recurrence',
          '不審な対象が再発した？',
          'Did the suspect recur?',
          yesNo
        ),
        field(
          'normal',
          '正常な更新は動いた？',
          'Did the normal update run?',
          yesNo
        ),
      ],
      (v) =>
        `recurrence=${chosen(v, 'recurrence')};normal=${chosen(v, 'normal')};scope=simulation`
    );
  return null;
}

export function tapAnswer(c: Case, questionId: string): TapAnswer | null {
  const builders: Record<string, (c: Case, id: string) => TapAnswer | null> = {
    identity,
    timeline,
    recovery,
    endpoint,
  };
  return builders[c.id]?.(c, questionId) ?? null;
}

export function updateAnswerField(
  field: AnswerField,
  old: readonly string[],
  option: string
): readonly string[] {
  if (field.kind === 'number') {
    const digits = old.join('');
    if (option === 'C') return [''];
    if (option === '⌫') return [digits.slice(0, -1)];
    if (!/^\d$/.test(option)) return old;
    return [`${digits === '0' ? '' : digits}${option}`.slice(0, 512)];
  }
  if (!field.options.includes(option)) return old;
  if (field.kind !== 'multiple' && field.kind !== 'ordered') return [option];
  if (old.includes(option)) return old.filter((s) => s !== option);
  return old.length < (field.limit ?? field.options.length)
    ? [...old, option]
    : old;
}
