import type { Locale } from './locale';

/** Issue 155: 会話例 Section 専用の型付き JA/EN catalog。 */
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
    sectionTitle: 'AI 会話例',
    disclosureBanner:
      'AI が作った会話の例です。実際のやり取りではありません。',
    privacyNotice: '端末内だけで生成し、内容は保存・送信しません。',
    generateButton: '会話例を見る（AI 生成）',
    generateButtonHint:
      '確認済みの共通点と自己紹介から、端末内 AI が短い会話例を作ります。',
    generatingStatus: (elapsedSeconds) =>
      `端末内で会話例を生成しています… ${elapsedSeconds} 秒`,
    cancelButton: '生成をキャンセル',
    cancelButtonHint:
      '端末内 AI の生成を止めます。共通点と最初の質問はそのまま残ります。',
    failedNotice:
      '会話例を生成できませんでした。共通点と最初の質問はそのまま使えます。',
    retryButton: 'もう一度生成',
    retryButtonHint: '同じ材料で会話例の生成を再試行します。',
    regenerateButton: '別の例を生成',
    regenerateButtonHint: '同じ材料から別の会話例を端末内で生成します。',
    ownerLabel: 'あなた',
    peerFallbackLabel: '相手',
    bubbleAccessibilityLabel: (index, speaker, text) =>
      `会話例 ${index} 件目、${speaker}: ${text}`,
  },
  en: {
    sectionTitle: 'AI conversation example',
    disclosureBanner:
      'This is an AI-generated conversation example, not a record of a real exchange.',
    privacyNotice:
      'It is generated only on this device and is never saved or sent.',
    generateButton: 'Show an AI conversation example',
    generateButtonHint:
      'Uses the confirmed common ground and intro text to create a short example on-device.',
    generatingStatus: (elapsedSeconds) =>
      `Generating a conversation example on-device… ${elapsedSeconds}s`,
    cancelButton: 'Cancel generation',
    cancelButtonHint:
      'Stops on-device generation. The common ground and opening question remain available.',
    failedNotice:
      'Could not generate a conversation example. You can still use the common ground and opening question.',
    retryButton: 'Try again',
    retryButtonHint: 'Retries generation with the same material.',
    regenerateButton: 'Generate another example',
    regenerateButtonHint:
      'Generates a different example from the same material on-device.',
    ownerLabel: 'You',
    peerFallbackLabel: 'The other person',
    bubbleAccessibilityLabel: (index, speaker, text) =>
      `Conversation example item ${index}, ${speaker}: ${text}`,
  },
};
