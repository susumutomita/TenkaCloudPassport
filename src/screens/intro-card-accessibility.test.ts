import { describe, expect, it } from 'bun:test';
import { expectInOrder, readSourceFile } from './accessibility-test-kit';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

describe('自己紹介カード（Issue 79）の Accessibility 契約', () => {
  it('編集画面は名前必須・自己紹介・連絡先・リンクの順に配置し、全入力に label を付ける（Issue 90: リンクは名前付き欄 + 自由リンク）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text.match(/<TextInput/g)).toHaveLength(11);
    expectInOrder(text, [
      't.nameLabel',
      't.titleLabel',
      't.organizationLabel',
      't.selfIntroLabel',
      't.emailLabel',
      't.phoneLabel',
      't.linksLabel',
      't.linkXLabel',
      't.linkGithubLabel',
      't.linkLinkedinLabel',
      't.linkPortfolioLabel',
      't.addLinkButton',
      't.byteUsageLabel',
    ]);
  });

  it('編集画面の保存ボタンは AppScreen の footer prop（画面下部固定）にあり、Save / Backup / Settings の順で並ぶ（Issue 93）', async () => {
    const text = await source('IntroCardEditScreen.tsx');
    const footerStart = text.indexOf('footer={');
    const footerEnd = text.indexOf('keyboardDismissMode', footerStart);
    const footerBlock = text.slice(footerStart, footerEnd);

    expectInOrder(footerBlock, [
      't.saveButton(saving)',
      'MESSAGES[locale].passportCreation.backupButton',
      'common.settingsButton',
    ]);
  });

  it('編集画面の必須入力（名前）は accessibilityLabel と accessibilityHint を持つ', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain('accessibilityLabel={t.nameAccessibilityLabel}');
    expect(text).toContain('accessibilityHint={t.nameHint(');
  });

  it('編集画面の Notice は入力エラーと成功を Message Catalog の kind 別 title で区別する', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain('.introCard.noticeTitles[notice.kind]');
    expect(text).toContain("accessibilityRole={isError ? 'alert' : 'summary'}");
  });

  it('表示画面は実 QR・説明・名前・編集・削除の順に配置する', async () => {
    const text = await source('IntroCardScreen.tsx');

    expect(text).toContain('<RealQrView matrix={encodedQr.matrix} />');
    expectInOrder(text, [
      '<RealQrView matrix={encodedQr.matrix} />',
      't.qrExplanation',
      'card.name',
      't.editButton',
      't.deleteButton',
    ]);
  });

  it('表示画面の QR は encodeIntroCardUrl（自己紹介ページ URL）から生成し vCard 直埋めには依存しない（Issue 84）', async () => {
    const text = await source('IntroCardScreen.tsx');

    expect(text).toContain('encodeQr(encodeIntroCardUrl(card))');
    expect(text).not.toContain('encodeVCard');
  });

  it('表示画面は QR を Accessibility Label 付きの View で包む', async () => {
    const text = await source('IntroCardScreen.tsx');

    expect(text).toContain('accessibilityLabel={t.qrAccessibilityLabel}');
  });

  it('表示画面は削除失敗（deleteError）を alert role で明示表示する（stage を変えずに留まるため）', async () => {
    const text = await source('IntroCardScreen.tsx');

    expect(text).toContain('deleteError ?');
    expect(text).toContain('accessibilityRole="alert"');
    expect(text).toContain("t.noticeTitles['delete-error']");
  });

  it('表示画面・編集画面のどちらも Settings と Backup への導線を維持する', async () => {
    for (const fileName of ['IntroCardScreen.tsx', 'IntroCardEditScreen.tsx']) {
      const text = await source(fileName);

      expect(text).toContain('onPress={onOpenSettings}');
      expect(text).toContain('onPress={onOpenBackup}');
    }
  });

  it('編集画面は encodeVCard・RealQrView に依存しない（QR 生成は表示画面の責務）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).not.toContain('encodeVCard');
    expect(text).not.toContain('RealQrView');
  });

  it('domain の文字数上限を直書きせず intro-card.ts の定数を import する', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain("from '../domain/intro-card'");
    expect(text).toContain('INTRO_CARD_NAME_MAX_LENGTH');
    expect(text).toContain('INTRO_CARD_MAX_LINKS');
  });

  it('編集画面の単一行入力は保存ボタン以外を return キーで次へ進め、最後は明示的にキーボードを閉じる（Issue 90）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    // 名前 → 肩書き → 所属 → 自己紹介（multiline、チェーンの終端） →
    // メール → 電話 → X → GitHub → LinkedIn → Portfolio という、return キーで
    // 次のフィールドへ focus を移す chain を持つ。
    expectInOrder(text, [
      "focusOrDismiss('organization')",
      "focusOrDismiss('selfIntro')",
      "focusOrDismiss('phone')",
      "focusOrDismiss('linkX')",
      "focusOrDismiss('linkGithub')",
      "focusOrDismiss('linkLinkedin')",
      "focusOrDismiss('linkPortfolio')",
    ]);
    // チェーン対象の単一行入力はフォーカス移動時の点滅を避けるため
    // submitBehavior="submit" を固定する（RN 0.86 では blurOnSubmit の
    // 後継 API、code-reviewer 指摘で移行済み）。
    expect(
      text.match(/submitBehavior="submit"/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(9);
    // 名前欄は任意項目セクションが閉じている（既定・真っさらな新規作成）間は
    // `title` の TextInput が mount されておらず `focusOrDismiss('title')` が
    // 無音の no-op になっていた（code-reviewer 指摘）。セクションの開閉に応じて
    // 次のフォーカス先を切り替え、閉じているときは最後の欄として dismiss する。
    expect(text).toContain(
      "const afterNameKey = optionalSectionExpanded ? 'title' : undefined;"
    );
    expect(text).toContain(
      'onSubmitEditing={() => focusOrDismiss(afterNameKey)}'
    );
    expect(text).toContain(
      "returnKeyType={afterNameKey === undefined ? 'done' : 'next'}"
    );
    // 自由リンクが 0 件のときは Portfolio が最後の欄になり done + dismiss、
    // 1 件以上あるときは最後の自由リンク行が done + dismiss になる（Portfolio
    // 欄は任意項目セクションのネストが深く、フォーマッタが改行するため
    // `returnKeyType={` と条件式を分けて確認する）。
    expect(text).toContain('returnKeyType={');
    expect(text).toContain("afterPortfolioKey === undefined ? 'done' : 'next'");
    expect(text).toContain(
      "returnKeyType={nextRefKey === undefined ? 'done' : 'next'}"
    );
    expect(text).toContain('Keyboard.dismiss()');
  });

  it('保存ボタン押下時に明示的に Keyboard.dismiss() する', async () => {
    const text = await source('IntroCardEditScreen.tsx');
    const start = text.indexOf('function handleSave(): void {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, ['Keyboard.dismiss()', 'onSave()']);
    expect(text).toContain('onPress={handleSave}');
  });

  it('自己紹介欄は multiline のまま return で改行し、AppScreen に keyboardDismissMode="on-drag" を渡してスクロールで閉じられるようにする', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain('keyboardDismissMode="on-drag"');
    const selfIntroStart = text.indexOf("ref={registerFieldRef('selfIntro')}");
    const fieldStart = text.lastIndexOf('<TextInput', selfIntroStart);
    const fieldEnd = text.indexOf('/>', selfIntroStart);
    const selfIntroField = text.slice(fieldStart, fieldEnd);
    expect(selfIntroField).toContain('multiline');
    expect(selfIntroField).not.toContain('onSubmitEditing');
    expect(selfIntroField).not.toContain('returnKeyType');
  });

  it('リンク欄は X / GitHub / LinkedIn / Portfolio の名前付き単一行入力と、自由リンクの動的追加・削除を持つ（Issue 90）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain("from './intro-card-links'");
    // Issue 93 の simplify レビュー指摘: `linkCount` は `nonEmptyLinkCount`
    // 呼び出しではなく、ライブプレビュー用に 1 度だけ計算する
    // `previewLinks`（`buildIntroCardLinks` の結果）の長さから導出する
    // （二重計算の解消）。
    expect(text).toContain('const linkCount = previewLinks.length;');
    expect(text).toContain('onChangeLinkX');
    expect(text).toContain('onChangeLinkGithub');
    expect(text).toContain('onChangeLinkLinkedin');
    expect(text).toContain('onChangeLinkPortfolio');
    expect(text).toContain('onAddOtherLink');
    expect(text).toContain('onRemoveOtherLink');
    expect(text).toContain('onChangeOtherLink');
    expect(text).toContain('disabled={!canAddOtherLink}');
  });

  it('自由リンクの削除ボタンは accessibilityLabel を index 付きで持つ（複数行を区別できる）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain(
      'accessibilityLabel={t.removeLinkButtonLabel(index + 1)}'
    );
    expect(text).toContain('accessibilityRole="button"');
  });

  it('自由リンク行の React key は配列 index ではなく mount 内不変の行 id を使う（code-reviewer 指摘: 削除時の誤アンマウント防止）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain('function useOtherLinkRowIds(');
    expect(text).toContain('key={rowIds[index] ?? refKey}');
    expect(text).not.toContain('<View key={key} style={styles.otherLinkRow}');
    // 追加・削除は handler 内で id の追加・除去とアプリ側 callback 呼び出しを
    // 同じ tick で行い、re-render 時に rowIds と otherLinks の長さがずれない
    // ようにする。
    expectInOrder(text, [
      'function handleAddOtherLink(): void {',
      'appendRowId();',
      'onAddOtherLink();',
    ]);
    expectInOrder(text, [
      'function handleRemoveOtherLink(index: number): void {',
      'removeRowIdAt(index);',
      'onRemoveOtherLink(index);',
    ]);
    expect(text).toContain('onPress={handleAddOtherLink}');
    expect(text).toContain('onPress={() => handleRemoveOtherLink(index)}');
  });

  it('リンク件数が上限を超えたら byte 予算超過と同じスタイルで件数表示を警告色にする（code-reviewer 指摘: 追加時以外の超過が見た目で分からない問題）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain(
      'const overLinkCount = linkCount > INTRO_CARD_MAX_LINKS;'
    );
    expect(text).toContain(
      '<Text style={overLinkCount ? styles.dangerCaption : styles.limit}>'
    );
  });

  it('email は autoCapitalize と autoCorrect を無効にし、電話・リンク系は用途別の keyboardType を持つ（Issue 92）', async () => {
    const text = await source('IntroCardEditScreen.tsx');
    const emailStart = text.indexOf("ref={registerFieldRef('email')}");
    const emailFieldStart = text.lastIndexOf('<TextInput', emailStart);
    const emailFieldEnd = text.indexOf('/>', emailStart);
    const emailField = text.slice(emailFieldStart, emailFieldEnd);

    expect(emailField).toContain('autoCapitalize="none"');
    expect(emailField).toContain('autoCorrect={false}');
    expect(emailField).toContain('keyboardType="email-address"');
    expect(text).toContain('keyboardType="phone-pad"');
    // X / GitHub / LinkedIn / Portfolio / 自由リンクの 5 入力すべてが
    // keyboardType="url" を持つ（Issue 90 では Portfolio・自由リンクのみ
    // 設定されており、X/GitHub/LinkedIn が抜けていた）。
    expect(text.match(/keyboardType="url"/g)).toHaveLength(5);
  });

  it('保存失敗の原因になった欄へ focus し、直下に同じメッセージを表示する（Issue 92: 画面上部へ戻さない）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain('function FieldError(');
    expect(text).toContain(
      'readonly errorFieldKey: IntroCardEditFieldKey | undefined;'
    );
    expect(text).toContain(
      'function fieldErrorMessage(key: IntroCardEditFieldKey): string | null {'
    );
    expect(text).toContain('errorFieldKey === key ? errorFieldMessage : null');
    // focus は「新しい保存失敗が起きたか」を notice の参照そのものを依存に
    // 含めて判定する（code-reviewer 指摘: errorFieldKey の値だけを依存にすると、
    // 同じ欄が原因のまま連続して保存に失敗したとき 2 回目以降 focus されない）。
    // `focusOrDismiss` は `useFieldFocusChain` 側で `useCallback` により安定した
    // 参照になっているため、無関係な再 render のたびに effect が再実行される
    // ことはない（simplify レビュー指摘、ガード用の ref を別途持たない）。
    expect(text).toContain(
      'if (errorFieldKey !== undefined) focusOrDismiss(errorFieldKey);'
    );
    // Issue 93 の altitude レビュー指摘: 保存失敗の対象欄がまだ折りたたまれた
    // 任意項目セクション内にあり mount されていない場合の再発防止は、
    // 依存配列に `optionalSectionExpanded` を足す対症療法ではなく、
    // `useFieldFocusChain`（pending focus）側の根本対応で担保する
    // （下のテストを参照）。この effect 自体の依存配列は素直なまま。
    expect(text).toContain('}, [errorFieldKey, notice, focusOrDismiss]);');
    expect(text).toContain('const registerFieldRef = useCallback(');
    expect(text).toContain('const focusOrDismiss = useCallback(');
    // 各入力欄の直下に FieldError を配置する（name・email・phone・4 名前付き
    // リンク欄・自由リンク行すべて）。
    for (const key of [
      "fieldErrorMessage('name')",
      "fieldErrorMessage('title')",
      "fieldErrorMessage('organization')",
      "fieldErrorMessage('selfIntro')",
      "fieldErrorMessage('email')",
      "fieldErrorMessage('phone')",
      "fieldErrorMessage('linkX')",
      "fieldErrorMessage('linkGithub')",
      "fieldErrorMessage('linkLinkedin')",
      "fieldErrorMessage('linkPortfolio')",
    ]) {
      expect(text).toContain(`<FieldError message={${key}} />`);
    }
    expect(text).toContain(
      '<FieldError message={fieldErrorMessage(refKey)} />'
    );
  });

  it('表示画面・編集画面はどちらも IntroCardPreview を import して使い、カード要約の描画をローカルで再実装しない（Issue 93）', async () => {
    for (const fileName of ['IntroCardScreen.tsx', 'IntroCardEditScreen.tsx']) {
      const text = await source(fileName);

      expect(text).toContain("from './IntroCardPreview'");
      expect(text).toContain('<IntroCardPreview');
      expect(text).not.toContain('style={styles.summary}');
    }
  });

  it('編集画面は名前欄の直後にライブプレビューを常設し、現在の入力値（保存前）をそのまま渡す（Issue 93: 見ながら追記する）', async () => {
    const text = await source('IntroCardEditScreen.tsx');
    const nameFieldEnd = text.indexOf(
      "<FieldError message={fieldErrorMessage('name')} />"
    );
    const previewStart = text.indexOf('<IntroCardPreview');

    expect(previewStart).toBeGreaterThan(nameFieldEnd);
    expect(text).toContain('name={name}');
    expect(text).toContain('title={title}');
    expect(text).toContain('organization={organization}');
    expect(text).toContain('selfIntro={selfIntro}');
    expect(text).toContain('email={email}');
    expect(text).toContain('phone={phone}');
    expect(text).toContain('namePlaceholder={t.previewNamePlaceholder}');
  });

  it('編集画面の任意項目（肩書き・所属・自己紹介・メール・電話・リンク）は既定で折りたたみ、既に値がある場合や保存失敗の対象が中にある場合は開く（Issue 93）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain(
      'const [optionalSectionExpanded, setOptionalSectionExpanded] = useState('
    );
    // Issue 93 の simplify レビュー指摘: 「任意項目のどれか 1 つでも値が
    // あるか」を画面層で独自の型・独自ロジックとして再実装せず、
    // `../app/intro-card-storage` の `isEmptyIntroCardDraft`
    // （`IntroCardDraftFields` の空判定）をそのまま再利用する（name は
    // 対象外にしたいので空文字で上書きしてから渡す）。
    expect(text).toContain("from '../app/intro-card-storage'");
    expect(text).toContain('isEmptyIntroCardDraft');
    const initializerStart = text.indexOf('!isEmptyIntroCardDraft({');
    const initializerEnd = text.indexOf('})', initializerStart);
    const initializerBody = text.slice(initializerStart, initializerEnd);
    expect(initializerBody).toContain("name: '',");
    expect(initializerBody).toContain('title,');
    expect(initializerBody).toContain('otherLinks,');
    // 保存失敗の対象が name 以外（＝任意項目セクション内）なら自動的に開く。
    expect(text).toContain(
      "if (errorFieldKey !== undefined && errorFieldKey !== 'name') {"
    );
    expect(text).toContain('setOptionalSectionExpanded(true);');
    expect(text).toContain(
      'onPress={() => setOptionalSectionExpanded((current) => !current)}'
    );
    // 自動展開用 effect はフォーカス用 effect より前に宣言する（読む順序として
    // 「開く → focus する」が素直なため）。展開直後、対象欄がまだ mount
    // されていなくても focus が失われない根本対応は `useFieldFocusChain` の
    // pending focus（下のテストを参照、Issue 93 altitude レビュー対応）。
    expectInOrder(text, [
      "if (errorFieldKey !== undefined && errorFieldKey !== 'name') {",
      'if (errorFieldKey !== undefined) focusOrDismiss(errorFieldKey);',
    ]);
  });

  it('useFieldFocusChain は対象欄がまだ mount されていない場合、pending focus として覚えて mount された瞬間に focus する（Issue 93: 折りたたまれた任意項目セクション内への保存失敗 focus が無音の no-op になる回帰の再発防止）', async () => {
    const text = await source('IntroCardEditScreen.tsx');
    const hookStart = text.indexOf('function useFieldFocusChain() {');
    const hookEnd = text.indexOf('\n}', hookStart);
    const hookBody = text.slice(hookStart, hookEnd);

    expect(hookBody).toContain(
      'const pendingFocusKeyRef = useRef<string | undefined>(undefined);'
    );
    expectInOrder(hookBody, [
      'const registerFieldRef = useCallback(',
      'fieldRefs.current[key] = instance;',
      'if (instance && pendingFocusKeyRef.current === key) {',
      'pendingFocusKeyRef.current = undefined;',
      'instance.focus();',
    ]);
    expectInOrder(hookBody, [
      'const focusOrDismiss = useCallback((nextKey: string | undefined): void => {',
      'const instance = fieldRefs.current[nextKey];',
      'if (instance) {',
      'pendingFocusKeyRef.current = nextKey;',
    ]);
  });

  it('編集画面の Save / Backup / Settings ボタンは AppScreen の footer prop へ渡し、キーボード表示中も操作できる位置に固定する（Issue 93）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain('footer={');
    const footerStart = text.indexOf('footer={');
    const footerEnd = text.indexOf('keyboardDismissMode', footerStart);
    const footerBlock = text.slice(footerStart, footerEnd);
    expect(footerBlock).toContain('onPress={handleSave}');
    expect(footerBlock).toContain('onPress={onOpenBackup}');
    expect(footerBlock).toContain('onPress={onOpenSettings}');
  });

  it('編集画面は各入力欄に onBlur を持ち、domain の validateIntroCardFieldValue を再利用して保存前に検証する（Issue 93、保存時判定との drift を防ぐ）', async () => {
    const text = await source('IntroCardEditScreen.tsx');

    expect(text).toContain("from '../domain/intro-card'");
    expect(text).toContain('validateIntroCardFieldValue');
    expect(text).toContain('function handleFieldBlur(');
    expect(text.match(/onBlur={/g)?.length ?? 0).toBeGreaterThanOrEqual(11);
    // リンク系欄は normalizedLinkFieldValue で正規化してから渡す
    // （ユーザー名だけの入力を誤って無効判定しない、Issue 92 と同じ drift 防止）。
    expect(text).toContain('normalizedLinkFieldValue(');
  });
});
