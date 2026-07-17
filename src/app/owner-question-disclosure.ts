/**
 * Owner Question を提示する前に必ず示す、共有範囲・削除契機・Passport への非保存を
 * 明示する定型文。質問文より先に表示することで、Owner が回答する前に境界を確認できる
 * ようにする（`docs/design/owner-question-consent-flow.md` を正本とする）。
 * `expiry-notice.ts` / `interaction-status-notice.ts` と同じ、内容を持たない
 * 状態表示専用の mapper である。
 */
export interface OwnerQuestionDisclosure {
  readonly sharedWithMessage: string;
  readonly deletedWhenMessage: string;
  readonly notSavedToPassportMessage: string;
}

const DISCLOSURE: OwnerQuestionDisclosure = {
  sharedWithMessage:
    '共有先: 「答える」を確定した場合だけ、この Lounge の相手にも Bridge として伝わります。',
  deletedWhenMessage:
    '削除時期: この Lounge が終了した時点で、回答は端末から消えます。',
  notSavedToPassportMessage:
    'Passport への保存: 回答は Passport へ自動保存しません。',
};

export function ownerQuestionDisclosure(): OwnerQuestionDisclosure {
  return DISCLOSURE;
}
