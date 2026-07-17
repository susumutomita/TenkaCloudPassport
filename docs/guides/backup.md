# JSON バックアップの手動配置ガイド

本書は、アプリのバックアップ画面で Export した JSON ファイルを、Owner 自身の Private GitHub
Repository（または他の保存先）へ手動で配置する手順を説明する。アプリは GitHub API と接続せず、
GitHub Token・Personal Access Token・OAuth のいずれも要求しない。手順はすべて GitHub の
標準的な Web UI または通常の `git` コマンドで完結する。

## バックアップに含まれるもの・含まれないもの

含まれる項目・除外される項目・保存契約は
[Privacy データ台帳](../privacy/data-inventory.md#手動-json-バックアップの-allowlist) と
[Privacy 保持ポリシー](../privacy/retention-policy.md#バックアップの保持境界) を正本とする。
要点は次のとおりとする。

- 含まれるものは Local Passport（`localPrivateProfile`）・端末設定・モデル検証記録・
  バックアップ Schema Version・Export 日時だけである。
- Peer Profile・Lounge ID・Participant ID・Transcript・Owner Question・Owner Answer・
  Bridge・Agent Message・Model Log・端末 ID・GitHub Token・GGUF 本体・端末の絶対パスは
  一切含まない。
- Export した JSON は暗号化されない。保存先の選択と管理は Owner 自身の責任である。

## Private GitHub Repository への手動配置

### 手順 A: GitHub の Web UI からアップロードする（コマンド操作不要）

1. Owner 自身の GitHub アカウントで、内容を公開したくない Private Repository を作成する
  （すでにある場合はそれを使う）。
2. アプリのバックアップ画面で Preview を確認し、「Share Sheet で共有する」から Export した
   JSON ファイルを端末へ保存する。
3. GitHub の当該 Repository ページを開き、「Add file」→「Upload files」を選ぶ。
4. 保存した JSON ファイルをドラッグ&ドロップし、コミットメッセージ（例:
「バックアップを追加」）を入力してコミットする。

この手順の間、アプリと GitHub の間には一切の通信が発生しない。ファイルのアップロードは
ブラウザから GitHub へ直接行われる、Owner 自身の操作として完結する。

### 手順 B: `git` コマンドで配置する

```bash
git clone git@github.com:<owner>/<private-repo>.git
cp ~/Downloads/tenkacloud-passport-backup-*.json <private-repo>/backups/
cd <private-repo>
git add backups/
git commit -m "バックアップを追加"
git push
```

`git clone` / `git push` の認証は、Owner が普段使っている GitHub CLI・SSH 鍵・
Personal Access Token（GitHub 側の一般的な認証手段）で行う。これはアプリの機能ではなく、
Owner が GitHub を使う際に通常行う認証であり、アプリはこの認証情報を要求・保存・
経由しない。

## 暗号化 Storage を使う場合

Private GitHub Repository の代わりに、Owner が管理する暗号化 Storage（暗号化された
外部ドライブ、パスワード管理ツールの添付ファイル機能など）へ保存してもよい。アプリは
保存先の形式を限定しない。JSON 自体は暗号化されないため、暗号化されていない保存先を選ぶ
場合はその点を理解したうえで選択する。

## バックアップ File の削除・上書き責任

- アプリは Export した JSON ファイルの所在・世代・削除を一切追跡しない。
- 保存先（Private GitHub Repository、暗号化 Storage、ローカルディスク）の同期・共有範囲・
  版管理・削除は Owner 自身の責任であり、アプリの管理外である。
- 誤って公開 Repository へ置いてしまった場合は、Owner が Repository の設定または
  Git 履歴から該当ファイルを削除する（GitHub の対応手順に従う）。
- 古いバックアップの世代整理（複数世代の JSON をいくつ残すか）も Owner の責任である。
  アプリは自動で古い Export を削除しない。

## 復元（Import）

バックアップ画面の Import から、保存しておいた JSON の内容を貼り付けて復元できる。
Preview → Validation → Conflict 選択（既存 Profile がある場合）→ Commit の順で進み、
不正な JSON・未対応の Version・欠落した Field・64 KiB を超える File は既存データを
変更せずに拒否する。詳細な設計は
[JSON バックアップ Export・Import の設計](../design/backup-export-import.md) を参照する。
