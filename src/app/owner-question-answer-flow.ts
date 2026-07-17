/**
 * Owner Question の回答画面が持つ、ローカルな 2 段階の UI State。「答える」を選んだ
 * だけでは、まだ回答を Peer へ共有する Bridge の判定へ渡さない。`confirming-share` の
 * 最終確認を経て初めて `onAnswer('yes')` を呼ぶ（Issue 11 の「Answer を Peer へ共有する
 * 前に最終 Consent が必要」という受け入れ条件をこの 2 段階で表現する）。
 * `分からない` / `パス` はどちらも Peer に何も共有しないため、この段階を経由せず
 * 直接回答を確定する。
 */
export type OwnerQuestionAnswerStage = 'answering' | 'confirming-share';

export type OwnerQuestionAnswerAction =
  | { readonly type: 'choose-share' }
  | { readonly type: 'cancel-share' };

export const INITIAL_OWNER_QUESTION_ANSWER_STAGE: OwnerQuestionAnswerStage =
  'answering';

export function reduceOwnerQuestionAnswerStage(
  _state: OwnerQuestionAnswerStage,
  action: OwnerQuestionAnswerAction
): OwnerQuestionAnswerStage {
  switch (action.type) {
    case 'choose-share':
      return 'confirming-share';
    case 'cancel-share':
      return 'answering';
  }
}
