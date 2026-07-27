import type { Locale } from './locale';

/**
 * Issue 155: AI 同士の事前会話 Section 専用の型付き JA/EN catalog。
 *
 * owner フィードバックによる転換: 「人間 2 人の会話シナリオ」ではなく、
 * **あなたの AI と相手の AI が語り合って接点を先に見つけておく**会話として
 * 提示する。話者ラベルは本人名でなく AI であることを明示し、本人の台詞を
 * 捏造して見せない。人間はこの AI 同士の会話を見て、実際の会話のきっかけに
 * する（Issue 155 のゴール）。
 */
export interface ConversationExampleMessages {
  readonly sectionTitle: string;
  readonly disclosureBanner: string;
  readonly privacyNotice: string;
  readonly generateButton: string;
  readonly generateButtonHint: string;
  readonly generatingStatus: (elapsedSeconds: number) => string;
  readonly cancelButton: string;
  readonly cancelButtonHint: string;
  readonly failedNotice: string;
  readonly retryButton: string;
  readonly retryButtonHint: string;
  readonly regenerateButton: string;
  readonly regenerateButtonHint: string;
  readonly ownerLabel: string;
  readonly peerFallbackLabel: string;
  /** 相手の表示名から「〜の AI」形式の話者ラベルを作る。 */
  readonly peerAiLabel: (peerName: string) => string;
  readonly bubbleAccessibilityLabel: (
    index: number,
    speaker: string,
    text: string
  ) => string;
}

export const CONVERSATION_EXAMPLE_MESSAGES: Record<
  Locale,
  ConversationExampleMessages
> = {
  ja: {
    sectionTitle: 'AI 同士の事前会話',
    disclosureBanner:
      'あなたの AI と相手の AI が端末内で語り合い、接点を探した会話です。本人同士の実際のやり取りではありません。',
    privacyNotice: '端末内だけで生成し、内容は保存・送信しません。',
    generateButton: 'AI 同士に会話させて接点を探す',
    generateButtonHint:
      '確認済みの共通点と自己紹介から、2 つの AI が端末内で語り合って接点を探します。',
    generatingStatus: (elapsedSeconds) =>
      `端末内で AI 同士が会話しています… ${elapsedSeconds} 秒`,
    cancelButton: '会話をキャンセル',
    cancelButtonHint:
      '端末内 AI の会話を止めます。共通点と最初の質問はそのまま残ります。',
    failedNotice:
      'AI 同士の会話を生成できませんでした。共通点と最初の質問はそのまま使えます。',
    retryButton: 'もう一度会話させる',
    retryButtonHint: '同じ材料で AI 同士の会話を再試行します。',
    regenerateButton: '別の会話をさせる',
    regenerateButtonHint: '同じ材料から別の会話を端末内で生成します。',
    ownerLabel: 'あなたの AI',
    peerFallbackLabel: '相手の AI',
    peerAiLabel: (peerName) => `${peerName} の AI`,
    bubbleAccessibilityLabel: (index, speaker, text) =>
      `AI の会話 ${index} 件目、${speaker}: ${text}`,
  },
  en: {
    sectionTitle: 'AI-to-AI icebreaker chat',
    disclosureBanner:
      'Your AI and their AI talked on this device to scout common ground. This is not a real exchange between the two of you.',
    privacyNotice:
      'It is generated only on this device and is never saved or sent.',
    generateButton: 'Let the AIs talk and scout common ground',
    generateButtonHint:
      'Two AIs converse on-device using the confirmed common ground and intro text.',
    generatingStatus: (elapsedSeconds) =>
      `The AIs are talking on-device… ${elapsedSeconds}s`,
    cancelButton: 'Cancel the chat',
    cancelButtonHint:
      'Stops the on-device AI chat. The common ground and opening question remain available.',
    failedNotice:
      'Could not generate the AI-to-AI chat. You can still use the common ground and opening question.',
    retryButton: 'Let them talk again',
    retryButtonHint: 'Retries the AI-to-AI chat with the same material.',
    regenerateButton: 'Have another chat',
    regenerateButtonHint:
      'Generates a different chat from the same material on-device.',
    ownerLabel: 'Your AI',
    peerFallbackLabel: "The other person's AI",
    peerAiLabel: (peerName) => `${peerName}'s AI`,
    bubbleAccessibilityLabel: (index, speaker, text) =>
      `AI chat item ${index}, ${speaker}: ${text}`,
  },
};
