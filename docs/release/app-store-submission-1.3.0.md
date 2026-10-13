# App Store メタデータ案（1.3.0）

これは現在のコードに合わせた申請文案であり、ASC への保存・審査提出・公開の証跡ではない。[現行の申請ガイド](./app-store-submission.md) を参照し、旧 1.2.0 の AI 説明と会話エージェントのスクリーンショットは新版に流用しない。

## 日本語の説明文

TenkaCloud Passport は、アカウントを作らずに自己紹介カードを作り、QR で共有できるアプリです。

名前、肩書き、自己紹介、リンクを入力してカードを保存します。相手は QR を読み取ってブラウザでカードを見られます。連絡先への保存は任意です。カードの内容は URL fragment からブラウザ内で読み取り、表示前に現在の URL から取り除きます。過去の同期履歴、QR アプリの履歴、スクリーンショットまでは消せません。

アルゴリズムやシステム設計の練習教材を選び、ダウンロードして保存できます。保存後はオフラインで学び、回答履歴や途中の進捗から再開できます。教材の取得にはインターネット接続が必要です。

ヒントは段階的に開き、参考回答や出典は別の操作で確認します。自分の説明を考える一時メモも使えます。メモ本文は保存されません。学習記録は自己評価を含み、コードの実行・検証や習熟・面接結果を保証しません。

端末内会話 AI は廃止しました。旧モデルファイルは自動削除しません。設定から容量を確認し、旧モデルだけを明示的に削除できます。自己紹介カードと学習進捗は残ります。

## English description

TenkaCloud Passport lets you create and share an Intro Card by QR without creating an account.

Save your name, title, introduction and links. Other people can scan the QR and view the card in their browser. Saving a contact is optional. Card content is read from the URL fragment inside the browser, and the current URL is cleared before display. Previously synced history, QR app history and screenshots cannot be erased by this flow.

Choose algorithm and system design practice catalogs, download and save them, then practice offline and resume from recorded progress. Downloading catalogs requires an internet connection.

Reveal hints one at a time and open reference answers and sources separately. Use a temporary reasoning draft; draft text is not saved. Learning records include self-assessment and do not verify executed code or guarantee mastery or interview outcomes.

On-device conversation AI has been retired. Existing model files are not automatically deleted. Settings lets you inspect their size and explicitly remove only legacy models while retaining cards and learning progress.

## このバージョンの変更

- 会話 AI の機能・推論依存を撤去。旧モデルの確認付き片付けを設定へ追加。
- 教材選択・取得・保存・学習開始を簡略化。途中進捗と旧版を保持。
- 段階的ヒント、参考回答、一時メモ、実装未検証の自己評価を明確化。
- 外部教材の総当たり、区間イベント、座席予約、通知配信を追加。

## 審査用 Notes 案

No login is required. Create an Intro Card, save it, and display the QR. Learning catalogs can be downloaded explicitly from the learning entry. Saved lessons work offline. Freeform answers are self-assessed; code is not executed. Reasoning drafts are transient. On-device conversation inference is removed. Legacy model cleanup is an optional confirmed operation in Settings.

## 申請前に確認する事項

- ネイティブ署名済み成果物の版・ビルド番号・コミットを記録する。
- 実機の起動、IME・キーボード、旧モデル容量確認・削除、ネイティブ学習保存を確認する。
- 現在の画面に合う iPhone / iPad のスクリーンショットを用意する。Web の模擬画面を実機撮影済みとは扱わない。
- ASC の既存サポート・プライバシー URL、年齢・輸出規制・プライバシー回答を実際の設定と照合する。未確定の回答や契約同意を推測で更新しない。
- TestFlight アップロードと処理完了を確認してから、審査対象ビルド・メタデータを選択する。審査提出と公開を別々に記録する。
