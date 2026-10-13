# Native Development Build 手順

端末内会話エージェントは廃止済み。推論 provider、モデル取得・有効化、ネイティブ推論依存と専用モジュールは含まない。既存の Rules によるラウンジ動作、自己紹介・QR、オフライン学習は維持する。

## 共通準備

```bash
make install
make before-commit
```

依存の lifecycle script は実行しない。Expo Go は `make start`、Development Build は `make dev` で起動する。

## ネイティブ検証

iOS は macOS / Xcode、Android は対応 SDK と端末を用いる。

```bash
bunx expo run:ios
bunx expo run:android
```

生成されたネイティブプロジェクトや認証情報をソースへ追加しない。署名済み配布は既存の [iOS / TestFlight 手順](./ios-testflight-release.md) に従い、配信の明示承認を得てから実行する。

## 旧モデルの片付け

旧 `Documents/local-models` の管理ファイルは自動削除しない。設定 → 旧モデルの片付けから容量を確認し、利用者の明示操作で旧モデルだけを削除できる。現在のアプリ領域からファイルを列挙し、過去の manifest 内の絶対 URI は使用しない。壊れた manifest、途中取得、削除 staging の残骸も対象にできる。未知のファイル・ディレクトリには触れない。モデルを読み込む必要はない。

## 配布前に確認する項目

- 起動と既存自己紹介・学習進捗の保持。
- 旧モデルがある／ない／壊れた manifest、容量取得失敗、削除失敗と再試行。
- モデルだけの削除が学習・自己紹介に影響しないこと。
- ソフトウェアキーボードと IME の入力、戻る、途中保存。
- ネイティブリンクと署名済みビルド。

Web export、Bun test、スマホ幅のブラウザ検証は実機の代わりにはしない。過去の推論設計 ADR は履歴であり、現在の有効化手順ではない。
