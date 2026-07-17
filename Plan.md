# Plan.md

### [Issue 1 プロダクト契約正本化] - 2026-07-17

#### 目的

TenkaCloud Passport が、イベントへ同伴した Pet を介して確認済みの手掛かりを交換し、
人間同士の口頭会話を始める理由を 1 つだけ提示して退くプロダクトであることを正本化する。
対象利用者、JTBD、成功の瞬間、失敗状態、用語、不変条件、非目標、成功指標を日本語と
英語で一致させ、後続の設計と実装がデジタル名刺や継続チャットへ逸脱しない基準を作る。

#### 制約

- 日本語を正本とし、各ファイル内の English 節を同じ意味に保つ。
- `docs/product/glossary.md` を指定用語の定義の正本とし、他文書では定義を変更しない。
- アカウント、中央サーバー、安定追跡 ID を中核体験の前提にしない。
- 不明な情報を推測せず、根拠が弱い場合は `no-signal` を選ぶ。
- Issue 1 の文書と本セクション以外へスコープを広げない。
- 設定ファイルと architecture harness の invariant は変更しない。

#### 設計判断

文書構成は次の案を比較した。

1. 全契約を `CONCEPT.md` に集約する案は入口が 1 つになるが、行動、用語、測定の責務が混ざり、
   更新時に定義の正本を判別しにくい。
2. 日本語と英語を別ファイルにする案は各言語を読みやすいが、同時更新の漏れと意味のずれを
   発見しにくい。
3. 4 文書を責務別に分け、各文書内で日本語と英語を併記する案はファイル数が増えるが、
   用語と測定の正本を分離しながら日英を隣接させてレビューできる。

案 3 を採用する。`CONCEPT.md` は入口、`product-contract.md` は行動契約、`glossary.md` は
用語定義、`success-metrics.md` は測定契約を担う。指定用語は用語集だけで定義し、他文書は
同じ語義を参照する。

情報は、Owner が公開を許可した手掛かりを Passport に入れ、Pet が現地の Lounge で交換し、
必要な場合だけ Owner Question を 1 問行い、Owner へ参加者単位の Bridge または `no-signal` を
返した後、その Pet が `retired` へ遷移する順に流れる。Owner は公開範囲と人間の会話、
Pet は推測しない判定と退場、
Lounge は使い捨ての交換、成功指標は匿名の自己申告集計を担う。

弱い根拠、不明な情報、Owner Question の未回答、複数参加者で結果が分かれる場合、Bridge 後と
`no-signal` 後の追加応答、成功指標への未回答、中央サービス停止をエッジケースとして扱う。
いずれも推測や再試行で埋めず、参加者単位の `no-signal`、Pet 単位の `retired`、不明、
端末内処理へ安全側に倒す。

#### タスク

1. `CONCEPT.md` にプロダクトの要約、JTBD、対象利用者、成功、失敗、非目標を記載する。
2. `docs/product/product-contract.md` に中核フローと不変条件を正本化する。
3. `docs/product/glossary.md` に指定された 8 用語の一意な定義を記載する。
4. `docs/product/success-metrics.md` に主成功指標、測定方法、ガードレールを記載する。
5. 文体、日英の意味、受け入れ条件、差分をレビューする。
6. 指定ゲートを実行し、合格後に Conventional Commits でコミットして PR を作成する。

#### 検証手順

- `bun scripts/architecture-harness.ts --staged --fail-on=error`。
- `make before-commit`。
- `git diff --check` と受け入れ条件の語句検査。
- `/review`、`/security-review`、`/simplify` に相当する目視レビュー。

#### 進捗ログ

- 2026-07-17: `AGENTS.md`、`.claude/rules/doc-style.md`、Issue 1 の本文、既存の
  Definition of Done を確認した。
- 2026-07-17: ローカル Git メタデータが読み取り専用で、GitHub 接続によるブランチ作成も
  拒否されたため、`main` へコミットせず文書作成と検証を先行した。
- 2026-07-17: 4 文書を作成し、指定 8 用語、6 不変条件、10 非目標、会話開始の自己申告率、
  TenkaCloud との関係を日本語と英語で揃えた。対象文書への追加 textlint も通過した。
- 2026-07-17: read-only レビューで検出した `no-signal` の単位、Bridge の根拠数、ガードレールの
  false-pass、設計ゲート、英訳の曖昧さを修正し、再レビューは指摘なしだった。
- 2026-07-17: `bun scripts/architecture-harness.ts --staged --fail-on=error` と
  `make before-commit` を再実行し、harness 0 件、68 tests、textlint、Biome がすべて通過した。

#### 振り返り

- 行動、用語、測定の正本を分けたことで、重複する説明がどの契約へ従うかを明確にできた。
- `no-signal` を参加者単位の結果、`retired` を Pet 単位の終端状態に固定し、複数参加者でも
  状態を一意にした。
- Bridge 表示率を成功から外し、必須ガードレール違反を成功判定から除外することで、無理な
  Bridge を増やす誘因を防いだ。

---

### 公開品質ガードと blindspot pass - 2026-07-04

#### 目的

Issue 112 と Issue 120 を実装し、テンプレートから生成したプロジェクトに
公開前チェック、機械検査、PR / CI 導線、未知を証拠付きで探索する
review-only スキルを標準搭載する。

#### 制約

- 作業順序は docs 更新、harness の責務整理、テスト、機能実装とする。
- 新 invariant は `docs/architecture/harness.md` と ADR-0006 を正本にする。
- 自動検出が不確実な項目は error にせず、人間向けチェックリストに残す。
- 既存の未コミット `package.json` 変更を保持する。
- `.claude/` を変更するため、通常ゲートに加えて skill-audit を通す。

#### タスク

1. 設計、ADR、harness 正本を先に更新する。
2. architecture harness に `pre-release` ルールグループを追加する。
3. 公開品質ルールをテスト先行で追加する。
4. チェックリスト、PR テンプレート、CI、README、package script を接続する。
5. `blindspot-pass` スキル、fixture、実行例、skills index を追加する。
6. architecture harness、before-commit、skill-audit、review、
   security-review、simplify の各ゲートを通す。

#### 検証手順

- `bun test scripts/`
- `bun run check:pre-release`
- `bun scripts/architecture-harness.ts --fail-on=warning`
- `make before-commit`
- `.claude/skills/skill-audit/SKILL.md` の Quick Workflow

#### 進捗ログ

- 2026-07-04: 設計と ADR-0006 を先に追加し、専用スキャナではなく既存 harness の
  rule group として公開品質検査を統合した。
- 2026-07-04: 7 invariant、`--pre-release`、複数行 JSX / 動的属性、
  ローカル worktree 除外をテスト先行で実装した。68 tests が Green。
- 2026-07-04: 5 チェックリスト、PR テンプレート、GitHub Actions、
  init-project、README、package command を接続した。
- 2026-07-04: review-only の `blindspot-pass` と fixture / 実行例を追加した。
  skill-audit の機械検査と目視レビューは指摘なし。
- 2026-07-04: 全 harness、公開品質検査、変更対象の Biome / textlint、
  `git diff --check` は Green。開始時から存在した未コミットの
  `package.json` 変更が textlint を過去の immutable ADR まで拡張し、
  既存文書 60 件で `make before-commit` を停止させるため、このユーザー変更は
  上書きせず判断待ちとした。
- 2026-07-04: workspace は未生成のため、ルートの typecheck / test / build は
  `No packages matched the filter` となる。harness の 68 tests は個別に完了した。

#### 振り返り

- 高シグナルな構文検査と、人間が実行経路や運用環境を判断するチェックを分離した。
- 通常 harness と公開前専用 command が同じ rule 実装を使うため、判定差分を作らない。
- 動的 `rel` の安全性は断定せず warning とし、fail-open を避けた。

---

### 品質ファースト化（MVP・三流コードの再発防止） - 2026-06-13

#### 目的

「すぐ MVP・手抜きの三流コードを生成してしまう」問題を、根本原因分析にもとづいて構造的に止める。MVP は完了条件ではない。シンプルさとは思いつきのハリボテではなく、考え抜いた最高の構成が結果としてシンプルに見えることである、という原則をテンプレートに固定する。プロのエンジニアが初回からそのまま使える品質を既定にする。

#### 根本原因（なぜ三流コードが出るか）

1. 「動く」が完了条件になっている（機能の合格ラインを品質の合格ラインと取り違える）。
2. 「プロ品質」の操作的定義が無い（狙えない的は当たらない）。TDD/No-Mock/カバレッジは必要だが浅い設計でも満たせる。
3. コード前に「考え抜く」設計ゲートが無い。最初に動いた構造がそのまま出荷される＝ハリボテの発生機序。
4. 早期収束。first-working で止まり「最善か、最初に動いただけか」を問い直さない。
5. 検証が機能のみ（lint/型/test/CI は通るが、TODO・as any・空 catch・浅い設計は素通り）。
6. 品質基準が書いている最中のコンテキストに無い。
7. 「シンプル」を「小さく速く」と誤読する。本質的シンプルさと手抜きを区別する記述が無い。

#### 制約

- 作業順序: ドキュメント更新 → リファクタリング → 機能追加。
- invariant の追加は `docs/architecture/harness.md` への明文化と ADR を伴う。検出ロジックには `scripts/architecture-harness.test.ts` のテストを添える。
- biome.json の編集は「問題を黙らせる」用途ではなく「品質バーを上げる」用途のみ（ユーザー承認済み）。
- ゲート（architecture-harness → make before-commit → /review → /security-review → /simplify）を全て Green にするまで未完了。`.claude/` を変更するので `/skill-audit` も通す。

#### タスク

1. `docs/architecture/quality-bar.md`（品質基準 = Definition of Done の正本）を新設。
2. `docs/adr/0003-quality-first-no-mvp.md` で根本原因分析と 3 層強制の判断を記録。
3. `scripts/architecture-harness.ts` に anti-MVP invariant 2 件（プレースホルダ/手抜きシグナル・型エスケープハッチ）を追加 + テスト。
4. `docs/architecture/harness.md` に新 invariant と DoD・Banned Assumptions を明文化。
5. biome.json を最大強度に（no-explicit-any・複雑度・未使用検出等）。bunfig.toml に coverage 100% 閾値。
6. `.claude/rules/quality-bar.md`（path-scoped）で書いている最中に品質基準を読み込ませる。
7. `/feature` に設計フェーズ（独立設計ドキュメント + 代替案比較）を追加、Developer 役を品質基準準拠に。
8. CLAUDE.md / AGENTS.md / README / init-project を同期。
9. ゲート実行 → PR。

#### 検証手順

- `bun scripts/architecture-harness.ts --fail-on=warning` で全件スキャンが Green。
- 故意に TODO / `as any` / 空 catch を含む一時ファイルで新 invariant が error を出すことをテストで確認（`bun test scripts/`）。
- `make before-commit` が Green。biome の新ルールでリポジトリ既存コードが落ちないことを確認（落ちたらコードを直す）。
- CI Green。

#### 進捗ログ

- 2026-06-13: ブランチ `chore/quality-first-no-mvp` 作成。全ファイル精読のうえ根本原因 7 件を特定。最大強度・独立設計ドキュメント方針でユーザー承認。
- 2026-06-13: 「今の AI には長さより軽さ」というユーザー指針を受け、設計方針を「重さは機械（harness/Biome/coverage）に寄せ、AI が読む文章は極限まで蒸留」に転換。初稿の 120 行 quality-bar.md を 30 行に削減。
- 2026-06-13: 実装完了。quality-bar.md / ADR-0003 新設。harness に `INVARIANT_NO_MVP_PLACEHOLDER` `INVARIANT_NO_TYPE_ESCAPE_HATCH` を追加（自己検出を断片組み立てで回避）+ テスト 12 件（計 43 pass）。bunfig に coverage 100% 閾値。path-scoped rule・/feature 設計フェーズ・CLAUDE/AGENTS/README 同期。biome 厳格化で露見した `INVARIANT_NO_GIT_DEPENDENCY` の複雑度超過を単一責務リファクタで解消（設定を緩めずコードを直す）。`make before-commit` Green、提案 biome 設定でも lint 0 error を確認。

- 2026-06-14: レビュー指摘を反映。さらに「linter で取れるものは linter で取れ」という指針を受け、Biome の AST ルール（`noEmptyBlockStatements` で空 catch、`noExplicitAny` で any、`noTsIgnore` で @ts-ignore）に役割を移譲。harness の手書き正規表現は linter に対応ルールが無いもの（作業中マーカー・未実装 throw・`as unknown as`・nocheck/expect-error）だけに縮小。テスト・docs・ADR を分担に合わせて同期。

#### 振り返り

- **問題**: 機能的に「動く」ことだけを完了条件にすると、設計・型・異常系・完成度が落ち、MVP・三流コードになる。これは速度ではなく「測っていないものは強制されない」「考え抜くゲートが無い」「品質の的が定義されていない」という構造の問題。
- **根本原因**: 上記 7 件（Plan の根本原因セクション / ADR-0003）。要約すると、完了の定義が機能止まりで、品質が機械でも文章でも担保されておらず、設計を考え抜く契機が flow に無かった。
- **予防策**: Definition of Done を 1 つ定義し、書く前（設計ゲート・原則）/ 書く中（path-scoped rule）/ 書いた後（harness invariant・Biome・coverage）の 3 層で強制。重さは機械に寄せ、AI が読む文章は蒸留して軽く保つ。緩和には ADR を要する。
- **残作業**: biome.json はフックで保護されており未適用。提案差分をユーザー承認のうえ適用する（フォローアップ）。`/skill-audit` `/review` `/security-review` `/simplify` は PR 前ゲートとして実行する。

---

### Claude Code ハーネス近代化（最新モデル・最新プラクティス対応） - 2026-06-10

#### 目的

既存テンプレートを最新の Claude Code プラクティスに合わせて作り直す。参考: [nvidia/skillspector](https://github.com/nvidia/skillspector)（スキルのセキュリティ検査）と [SnailSploit/claude-red](https://github.com/SnailSploit/claude-red)（スキル集の構成）。スキル・フック自体が攻撃面になる時代に合わせ、ハーネスにスキル監査の invariant を足し、スキルの書き方を最新仕様に揃える。

#### 制約

- 作業順序: ドキュメント更新 → リファクタリング → 機能追加。
- invariant の追加は `docs/architecture/harness.md` への明文化と ADR を伴う。
- 設定ファイル（biome.json 等）は直接編集しない。
- ゲート（architecture-harness → make before-commit → /review → /security-review → /simplify）を全て Green にするまで未完了。

#### タスク

1. docs 更新 — `harness.md` の `INVARIANT_SUPPLY_CHAIN_CONFIG_PRESENT` が `.npmrc` 前提のまま（PR #104 で削除済み）の stale 記述を修正。スキル監査 invariant の ADR-0002 を作成。
2. `scripts/architecture-harness.ts` にスキル監査 invariant を追加（SKILL.md frontmatter 検証、prompt injection・危険パターン検出）+ テスト。
3. 既存スキルの frontmatter を最新プラクティス（リサーチ結果に基づく）に更新。
4. `/skill-audit` スキルを追加。
5. README / CLAUDE.md / AGENTS.md を同期（最新モデル指針を含む）。
6. ゲート実行 → PR。

#### 検証手順

- `bun scripts/architecture-harness.ts --fail-on=warning` で全件スキャンが Green。
- 故意に injection パターンを含むスキルを置いた一時ファイルで新 invariant が error を出すことをテストで確認（`bun test`）。
- `make before-commit` が Green。
- CI Green。

#### 進捗ログ

- 2026-06-10: ブランチ `chore/modernize-claude-harness` 作成。skillspector / claude-red のリサーチをバックグラウンドで開始。harness.md の stale な `.npmrc` 記述を発見。
- 2026-06-10: docs 更新完了（harness.md 修正 + ADR-0002 + スキル invariant 3 件の明文化）。
- 2026-06-10: `scripts/architecture-harness.ts` にスキル invariant 3 件を実装、`scripts/architecture-harness.test.ts` で 24 テスト Green。`make harness_test` を before-commit ゲートに追加。
- 2026-06-10: `.claude/scripts/check-test-style.sh` の日本語検出が macOS (BSD grep / bash 3.2) で常に誤検知するバグを修正。
- 2026-06-10: スキル frontmatter を最新仕様に更新（argument-hint / allowed-tools / disable-model-invocation）。`/skill-audit` スキル追加。CLAUDE.md を `@AGENTS.md` import 方式に再構成、`.claude/rules/skill-authoring.md` (path-scoped rule) 追加、README 同期。
- 2026-06-10: settings.json への permissions.allow 追加は権限分類器に拒否されたためフォローアップ化（ユーザー判断事項）。フォローアップ 3 件記録。
- 2026-06-10: /review 指摘を反映 — `--skills-only` モード追加（pre-install 検査がリポジトリ前提で必ず失敗する問題の解消）、EXFIL 検出強化（`sh -c "$(curl ...)"` / `| sudo sh`）、ZWNJ/ZWJ を warning に分離。/security-review は指摘 0 件。
- 2026-06-10: /simplify 指摘を反映 — `standalone` フィールドで rule タグ化（id プレフィックス依存を解消）、隠し指示検出をテーブル化し `.claude` 配下全ファイルへ拡張、EXFIL スコープに settings.json 追加、`parseFrontmatter` を `Bun.YAML.parse` に置換、CLAUDE.md 禁止事項の重複を AGENTS.md 参照に一本化、テストの一時ディレクトリ掃除。最終 31 テスト Green、全ゲート Green。

#### 振り返り

- **問題**: harness.md の `INVARIANT_SUPPLY_CHAIN_CONFIG_PRESENT` 記述が PR #104 の `.npmrc` 削除に追随しておらず stale だった。`.claude/scripts/check-test-style.sh` の日本語検出は macOS で常に誤検知していた。
- **根本原因**: 実装と正本ドキュメントの同期を機械検証する仕組みが invariant 本文には無い。hook スクリプトは GNU 前提で書かれ、BSD 環境でテストされていなかった。
- **予防策**: スキル・フックを harness の検査対象に含めた（本 PR の invariant 3 件）。hook スクリプトの環境差異はポータブルな構文（C ロケール + POSIX 文字クラス）に寄せた。description 等の宣言と実装の整合は `/skill-audit` のチェックリストでレビュー時に確認する。

---

### [Issue 3 Privacy データ契約] - 2026-07-17

#### 目的

「個人情報を扱わない」「Lounge は消える」というプロダクト上の約束を、実装とテストが
判定できるデータ分類、共有範囲、保持期間、削除契機、信頼境界へ落とす。Local Private
Profile と Public Passport を分離し、QR、近距離通信、端末内推論、手動 JSON Backup の
各境界で持ち出せるデータを限定する。

#### 制約

- 日本語を正本とし、指定用語は `docs/product/glossary.md` の語義を変更せずに使う。
- 安定 ID、端末 ID、広告 ID、位置情報、連絡先を QR と Pet Message に含めない。
- Lounge 由来データは退出、Host 終了、生成から 20 分満了の最も早い時点で破棄する。
- Lounge 会話、Owner Answer、Bridge を Passport や Backup へ暗黙に昇格させない。
- GitHub Token を要求または保存せず、Analytics SDK と外部推論 API を導入しない。
- architecture harness の文書と検出ロジックは変更せず、自動検査の追加計画だけを ADR に残す。
- Git 操作、設定ファイル変更、Issue 3 の範囲外の実装を行わない。

#### 設計判断

1. すべてを 1 つの Privacy 文書へ集約する案は入口が少ないが、データ台帳、保持、攻撃と
   対策の責務が混ざり、実装時に参照すべき契約を特定しにくい。
2. Lounge 履歴を暗号化して端末へ保存する案は障害調査に使えるが、使い捨てという契約と
   再起動後に復元しない要件に反する。
3. データ台帳、保持ポリシー、脅威モデルを分け、判断と将来の機械検査を ADR で固定する案は
   文書間の参照が必要になるが、各責務と更新理由を一意にできる。

案 3 を採用する。Owner が選んだ非識別の手掛かりは Local Private Profile から明示操作で
Public Passport へ投影し、QR は短命な参加情報だけを運ぶ。Lounge 内の Owner Answer と
Pet Message はメモリ内だけで扱い、Bridge または `no-signal` の確定、退出、Host 終了、
20 分満了の状態遷移に応じて破棄する。手動 JSON Backup は端末内の永続データだけを
allowlist 方式で Export する。

悪意ある入力、時刻ずれ、終了通知の欠落、アプリ強制終了、端末再起動、同一 LAN 上の盗聴、
改ざん済み GGUF、Backup の誤公開をエッジケースとして扱う。通知に依存せず各端末が独立して
TTL と再起動時の非復元を強制し、外部入力は命令ではなくデータとして検証する。

#### タスク

1. `docs/privacy/data-inventory.md` に全データ種別と Public Passport の投影契約を記載する。
2. `docs/privacy/retention-policy.md` に TTL、削除順序、非復元対象、Backup 契約を記載する。
3. `docs/security/threat-model.md` に信頼境界と指定された 9 脅威の評価、対策、残余リスクを記載する。
4. `docs/adr/0007-privacy-data-contract.md` に Privacy invariant と harness 追加計画を記載する。
5. 受け入れ条件、用語、文体、相互参照をレビューし、指摘を解消する。

#### 検証手順

- `bunx textlint Plan.md docs/privacy/data-inventory.md docs/privacy/retention-policy.md docs/security/threat-model.md docs/adr/0007-privacy-data-contract.md`。
- `make before-commit`。
- `git diff --check` と禁止表現、必須脅威、必須表列、Privacy invariant ID の機械的な語句検査。
- `.claude/agents/code-reviewer.md` に従った read-only レビューと Security、簡潔性の目視レビュー。

#### 進捗ログ

- 2026-07-17: 指定された正本、文体規則、既存 ADR、harness、Definition of Done を確認した。
- 2026-07-17: ADR 番号を `0007` とし、永続データと Lounge 由来の短命データを保存方式で
  分離する方針を選んだ。
- 2026-07-17: データ台帳、保持ポリシー、脅威モデル、ADR-0007 を作成し、新規文書と
  本セクションの `bunx textlint` を通した。
- 2026-07-17: read-only レビューで見つかった参加 capability の保持境界、再起動後の Replay、
  Owner Question と Owner Answer の削除契機、受動的脅威の検出可否を修正した。再レビューは
  blocker、high、medium の指摘なしだった。
- 2026-07-17: `make before-commit` は Git 管理外の `.claude/settings.local.json` の既存整形差分で
  一度停止した。このローカル専用ファイルを一時退避して再実行し、全段階を通した。退避前後の
  SHA-256 が一致することを確認し、設定ファイルを原状復帰した。

#### 振り返り

- 「保存しない」だけでは異常終了、再起動、Export 経路からの復元を防げないため、保存先、
  削除契機、再起動時の扱いを同じ契約で定義する。
- QR と近距離通信を同じ公開境界として扱わず、QR の参加情報と通信層の一時メタデータを
  分離することで、アプリケーションメッセージへの端末情報の混入を防ぐ。
- 参加 capability の raw token と使用済み digest を別区分にすることで、raw token の早期破棄と
  Replay 検出に必要な最小状態の保持を両立する。
- 肩越し閲覧、受動的なパケット盗聴、Export 後のバックアップ誤公開はアプリから検出できない。
  検出不能と補助シグナルを分けて記載し、検出できたように扱わない。

---

### [Issue 4 Expo 基盤移行] - 2026-07-17

#### 目的

TypeScript Template を Expo SDK 57 / React Native 0.86 の単一モバイルアプリ基盤へ移行する。
iOS、Android、Web が同じ Domain と Screen を使い、Expo Go / Web では Rules Provider により、
Passport 作成から単一端末 Lounge の完全破棄までを中央サーバーなしで完走できる状態にする。

#### 制約

- Expo アプリはリポジトリルートに置き、Hono / Vite の未使用 workspace を作らない。
- Bun、Biome、architecture harness、供給網防御、ADR、GitHub Actions を維持する。
- Domain 層は React Native に依存しない純 TypeScript とし、日本語 BDD の No Mock テストを書く。
- Expo Go / Web は Rules Provider を使い、`llama.rn` は依存へ追加しない。
- Local Agent は Development Build 側から遅延 loader を注入できる境界だけを用意し、Web Bundle から分離する。
- 本番コードへ Demo Peer、架空の接触履歴、Mock API、自由記述の手掛かりを入れない。
- Public Passport は版管理済みカタログから Owner が確認した最大 3 件だけを投影する。
- Lounge 由来データは退出、Host 終了、20 分満了の最も早い時点で完全破棄する。
- モデル重みと生成済み `ios/` / `android/` は Git 管理しない。
- オフライン環境では依存を追加せず、Expo の型解決と Web Export はコーディネータの install 後に検証する。
- Git 操作と `.claude/settings.local.json` の変更を行わない。

#### 設計判断

1. Expo アプリを workspace に置く案は将来の複数アプリ分離には向くが、現在は単一アプリであり、
   root script、Metro の探索範囲、依存解決を不必要に複雑にする。
2. `llama.rn` を最初から直接 import する案は Native 実行を早く試せるが、Expo Go で利用できず、
   未導入の Native module が Web Bundle の解決対象になる。
3. ルート Expo アプリ、純 TypeScript Domain、Rules Provider、loader 注入型 Local Agent 境界に
   分ける案は、Development Build の接続を後続 Issue に残しながら、全 platform の同一フローを確定できる。

案 3 を採用する。UI は実在する相手がその場で公開したカタログ項目を同じ端末へ入力する経路だけを
提供し、組み込みの人物例や履歴を持たない。Rules Provider は両 Passport に共通する確認済みの
手掛かりがある場合だけ主要 Bridge を 1 件生成し、それ以外は正常結果の `no-signal` とする。
Bridge または `no-signal` の確定直後に Pet を `retired` とし、再判定を禁止する。

#### タスク

1. README、AGENTS、CLAUDE、設計書、ADR-0008、本セクションを先に更新する。
2. Passport、Bridge、Rules Provider、Lounge 状態機械のテストを Red で追加する。
3. 純 TypeScript Domain と Local Agent の遅延 loader 境界を実装してテストを Green にする。
4. Expo の共通 entry point、Screen、設定、アセットをリポジトリルートへ追加する。
5. package metadata、script、Makefile、`.gitignore`、GitHub Actions を Expo 基盤へ整合させる。
6. オフラインで実行可能なゲートと read-only レビューを行い、指摘を解消する。

#### 検証手順

- `bun test` で純 TypeScript Domain の正常、異常、境界、破棄後の再判定禁止を確認する。
- `bun test --coverage` で中核 Domain のカバレッジ 100％ を確認する。
- `bun biome check .` と `bunx textlint` でコードと文書を検査する。
- `bun scripts/architecture-harness.ts --fail-on=error` で invariant を全件検査する。
- install 後に `bunx expo install --fix -- --ignore-scripts`、`bun run typecheck`、`bun run build:web`、
  `make before-commit` を実行する。

#### 進捗ログ

- 2026-07-17: 必読文書、既存の harness 実装、Makefile、GitHub Actions、作業ツリーを確認した。
- 2026-07-17: ADR 番号を `0008` とし、ルート Expo アプリと Rules Provider を既定経路に選んだ。
- 2026-07-17: Domain と Local Agent の日本語 BDD テストを先に追加し、module 未実装による Red を
  確認してから Passport、Bridge、Rules Provider、Lounge 状態機械、遅延 loader を実装した。
- 2026-07-17: iOS、Android、Web 共通の entry point と Screen、Expo 設定、Metro 設定、アセットを
  追加し、Hono / Vite 用の `init-project` スキルと参照を削除した。
- 2026-07-17: read-only レビューで見つかった SPA 出力設定、Metro runtime 依存、Lounge 終了理由の
  公開範囲、Local Agent の失敗契約を修正した。Public Passport は Lounge 開始時に投影する構造へ
  変更し、準備画面の滞在で 20 分の保持期限を延長できないようにした。
- 2026-07-17: 追加レビューで見つかったタイマー満了と判定操作の競合を純粋な Lounge reducer と
  React の機能的 state 更新で解消した。破棄処理を冪等にし、競合順序の回帰テストも追加した。
- 2026-07-17: security review で Bridge の平文初期表示と、Expo 依存整合時の lifecycle script 防御の
  迂回を検出した。Bridge はデフォルトで mask し、Owner の明示操作中だけ表示して inactive / background
  遷移時に再 mask するよう修正した。Expo 整合コマンドには `--ignore-scripts` の透過を必須にした。
- 2026-07-17: `bun test` 111 件、`bun test src --coverage` の対象 8 ファイル 100％、harness の
  68 テスト、Biome、対象 Markdown の textlint、architecture harness の error / warning 0 件、
  `git diff --check` を通した。最終 read-only レビューに未解消の新規 high / medium 指摘はなかった。
- 2026-07-17: Expo 依存が未導入のため `bun run typecheck` は `tsc: command not found` で停止した。
  `bun.lock` の更新、Expo の型検査、実際の Web Export はコーディネータの install 後に実行する。

#### 振り返り

- **問題**: Public Passport を Lounge 開始前に投影すると、Encounter 入力画面の滞在時間と Lounge の
  20 分期限が別に進み、公開投影を 20 分以上保持できる余地があった。
- **根本原因**: UI の画面遷移と Privacy 保持契約を別々に考え、投影時刻を Lounge 開始時刻と
  同一にする制約が初期 controller に入っていなかった。
- **予防策**: 準備画面は Local Private Profile の公開選択だけを保持し、2 つの Public Passport は
  `startLounge` と同じ操作内で投影する。一気通貫テストで Passport 投影、Rules 判定、`retired`、
  完全破棄を同じシナリオとして固定する。
- **問題**: Native module の loader 失敗が任意例外のまま外へ漏れ、失敗した Promise を再利用する
  構造になっていた。
- **根本原因**: Issue 4 で Native runtime を接続しないことと、境界の失敗契約も未定義でよいことを
  混同した。
- **予防策**: module 読み込みと判定の失敗を別の型付きエラーへ正規化し、読み込み失敗だけは cache を
  破棄して再試行する。同時呼び出しでは同じ読み込み Promise を共有するテストを維持する。
- **問題**: Bridge の保持期限は守っていたが、結果画面の描画直後から平文を表示し、肩越し閲覧の
  予防策を実装していなかった。
- **根本原因**: Privacy の削除契約を Domain 状態に落とした一方、Security の表示契約を UI state と
  回帰テストへ落としていなかった。
- **予防策**: Bridge の表示状態を純粋な reducer で `masked` から開始し、明示表示、再 mask、
  アプリ非アクティブ化による再 mask を日本語 BDD テストで固定する。
- **問題**: 通常 install は lifecycle script を止めていたが、Expo CLI が呼ぶ package manager の
  経路に同じフラグを透過していなかった。
- **根本原因**: 依存を整合する CLI を読み取り専用の検査として扱い、内部で install が実行される
  供給網境界を見落とした。
- **予防策**: 依存を変更するすべての経路で `--ignore-scripts` を明示し、README、AGENTS、Plan の
  コマンドを同じ形へ揃える。

---

### [Issue 5 型と Versioning 固定] - 2026-07-17

#### 目的

Local Private Profile、Public Passport、使い捨て Lounge、Pet の判断、将来の Peer Message、
手動 JSON バックアップを別の型と strict schema へ分離する。公開 Projection と外部入力境界で
個人情報、安定 ID、Raw LLM Prompt、Chain of Thought の混入を拒否し、Protocol Version と
Migration の互換性契約を固定する。

#### 制約

- 新しい依存を追加せず、供給網境界を増やさない依存なしの strict validator を実装する。
- Local Private Profile から Public Passport を生成できる経路は明示的な純粋 Projection だけにする。
- Lounge ID と Participant ID はセッションごとに Web Crypto から生成し、Domain へ乱数生成関数を
  注入する。
- Protocol Version は Major と Minor を必須にし、未知の Major Version と未対応の Minor Version を
  fail-closed で拒否する。
- 既存の Privacy データ台帳に従い、自由記述、安定 ID、端末情報、連絡先、保存先パスを交換型へ
  追加しない。
- Git 操作、依存追加、`.claude/settings.local.json` と品質設定の変更を行わない。

#### 設計判断

1. `zod` などの汎用 schema library を追加する案は宣言的で保守しやすいが、依存追加と lifecycle を含む
   供給網境界が増え、Issue 5 の制約に反する。
2. TypeScript の型と `JSON.parse` だけを使う案は実装量が少ないが、実行時には未知 field、欠落、
   過大入力、Version を拒否できない。
3. Domain の別型と純粋関数、Protocol の依存なし strict validator、Web Crypto adapter を分離する案は
   validator の保守責任が増えるが、型と実行時境界の両方を固定できる。

案 3 を採用する。すべての parser は allowlist 以外の key を拒否し、検証済み値を新しい object として
再構築する。Peer Envelope は 4 KiB、バックアップは 64 KiB、外部 JSON は深度 8 を上限とし、配列と
文字列はデータ種別ごとに固定する。Migration は入力を変更せず、成功時だけ新しい現行 schema を返す。

#### エッジケース

- 未知 field、必須 field の欠落、型不一致、重複する手掛かりと Participant ID を拒否する。
- 未知の Major Version、未対応の Minor Version、旧 schema 以外の Migration 入力を拒否する。
- 4 KiB を超える Peer Message、64 KiB を超えるバックアップ、深度 8 を超える JSON を拒否する。
- 乱数生成器が短い値、長い値、または同じ byte 列を返した場合は ID を発行しない。
- Migration が失敗しても入力 object と保存済みの現行データを変更しない。

#### タスク

1. 本セクション、`docs/architecture/data-model.md`、ADR-0009 を先に作成する。
2. strict validator と各 Schema の日本語 BDD テストを Red で追加する。
3. Domain の型、Projection、セッション ID、判断、バックアップの純粋関数を実装する。
4. Protocol Version、Peer Envelope、JSON 上限、Migration、Web Crypto 境界を実装する。
5. 正常、異常、境界、互換性、Projection の Snapshot Test を Green にする。
6. 指定された全ゲートと Domain import 検査を実行し、結果を本セクションへ追記する。

#### 検証手順

- `bun run typecheck`。
- `bun test`。
- `bun biome check .`。
- `bunx textlint`。
- `bun scripts/architecture-harness.ts`。
- `make before-commit`。
- `rg -n "from ['\"](?:react|react-native|expo|@react-native|.*storage|.*transport|.*llm)" src/domain` で
  Domain に UI、Storage、Transport、LLM package の import がないことを確認する。

#### 進捗ログ

- 2026-07-17: 指定された規則、用語集、Privacy データ台帳、脅威モデル、既存 Domain、ADR template、
  既存 111 テストを確認した。
- 2026-07-17: 案 3 を選定し、外部入力を fail-closed にする上限と型境界を設計した。
- 2026-07-17: 依存なしの strict validator、9 種類の別 Schema、Version 1.0 の Peer Envelope、
  Web Crypto の乱数 adapter、Version 0 から 1 への純粋 Backup Migration を実装した。
- 2026-07-17: 未知 field、必須 field 欠落、不正 Version、文字列、配列、byte 数、ネスト深度、
  Migration 失敗、Public Passport の公開 key を日本語 BDD テストで固定した。
- 2026-07-17: `bun run typecheck`、158 件の `bun test`、`bun biome check .`、対象 Markdown の
  `bunx textlint`、error と warning が 0 件の architecture harness を通した。
- 2026-07-17: Domain import 検査は React Native、Storage、Transport、LLM package の一致が 0 件だった。
  `make before-commit` は harness 68 件、対象 source test 90 件、関数と行の coverage 100%、Web Export を
  含む全段階を通した。

#### 振り返り

- 外部 JSON の深度検査は再帰すると検査自体が stack を消費するため、byte 上限を先に適用し、
  明示 stack を使う反復走査で深度 8 を強制する。
- Schema parser は検証済み field から新しい object を組み立て、入力参照と未知 field を内部へ
  持ち込まない。Public Passport の受信回数を人物 ID へ変換する状態も持たない。
- Bridge の表示文は版管理済み手掛かりから Domain 内で導出し、Agent Decision の外部 schema へ
  自由記述やモデルの思考過程を追加しない。

---

### [Issue 7 Passport 初回設定] - 2026-07-17

#### 目的

氏名、メール、電話、OAuth を要求せず、Pet Name、Emoji、任意の Owner Alias、版管理済みの
会話材料、Languages を明示保存し、Lounge 参加直前に今回の Public Passport を項目単位で
確認できる初回体験を完成する。

#### 制約

- 新しい npm 依存を追加せず、Web は `localStorage`、Native は既存の `expo-file-system` を使う。
- Domain は React Native、Storage、Transport、LLM を import しない。
- Draft を自動保存せず、Owner が明示保存した Local Private Profile だけを再起動後に復元する。
- Pet Name と Owner Alias 以外は版管理済みカタログ選択とし、機密情報を入力しない案内を表示する。
- Makefile、`.github/workflows/ci.yml`、`.claude/settings.local.json` を変更しない。
- Git 操作、`rm`、`npx`、型エスケープ、Mock、Stub、フォーカスしたテストを使わない。

#### 設計判断

1. 入力ごとの自動保存は復元性が高いが、明示保存前の Draft を永続化するため採用しない。
2. Domain が Storage を直接扱う案は呼び出しが短いが、純粋性と依存方向を壊すため採用しない。
3. app 層の Storage Port と Web / Native adapter、Domain の純粋 validation、単一の共有 builder に
   分ける案は境界コードが増えるが、保存と共有を別の明示操作にできるため採用する。

Schema Version 1 の必須 field を黙って変えず、Local / Public Profile と Backup を Version 2、Peer
Protocol を Version 1.1 にする。旧 Backup は strict validation 後に純粋 Migration し、手掛かりが
ない旧 Profile は会話材料を捏造せず拒否する。

#### エッジケース

- 空白だけまたは上限超過の表示名、未許可 Emoji、重複または件数超過のカタログ値を拒否する。
- 空の Owner Alias は許可し、Public Passport へ field を作らない。
- Storage 利用不可、読込失敗、不正保存データ、保存失敗を区別して表示する。
- 保存失敗時は Draft を維持し、保存済み Profile として画面遷移しない。
- Preview で Pet Name または全手掛かりを OFF にした場合は Lounge 参加を無効にする。
- Preview、QR Projection、Peer Payload は同じ Public Passport object から作り、Snapshot で固定する。
- 再起動時に Draft、Preview、Public Passport、Lounge を復元しない。

#### タスク

1. 設計書、Privacy データ台帳、Data Model、用語集、ADR-0011、本セクションを先に更新する。
2. Domain validation、Schema Version、Migration、Projection の日本語 BDD テストを Red で追加する。
3. Storage Port、Web / Native adapter、実ファイル I/O の adapter test を追加する。
4. 初回設定、空と失敗の固有 UI、共有 Preview、Accessibility を既存 `PassportApp` へ統合する。
5. 指定ゲート、review、security review、simplify を実行し、指摘を解消する。

#### 検証手順

- `bun run typecheck`。
- `bun test`。
- `bun biome check .`。
- `bunx textlint` で変更 Markdown を検査する。
- `bun scripts/architecture-harness.ts`。
- `make before-commit`。
- Domain import 検査と Preview / Payload Snapshot を確認する。

#### 人間検証

初見利用者 5 名中 4 名以上が 90 秒以内に完了できるかは人間検証待ちである。

---

### [Issue 8 QR 招待・共有確認・Ready フロー] - 2026-07-17

#### 目的

対面会場で、閉じた Lounge へ安全に参加し、全員が共有内容を確認して Ready になるまで
Pet を動かさないフローを作る。M1 は単一端末で完全動作し、M3 の複数端末 Transport から
同じ Use Case を呼べる構造にする。

#### 制約

- QR は Versioned Public Passport または Versioned Lounge Invite だけを扱う。
- QR 読取だけで参加確定させず、共有 Preview と明示 Consent（Ready 操作）を挟む。
- Camera 権限拒否をアプリ全体の利用不能にしない。Passport 編集は権限状態に関わらず
  到達できる導線を維持する。
- 同じ QR の再読取を人物の安定 ID として利用しない。
- 新しい npm 依存を追加せず、`expo-camera` 等の Native Camera Package も
  `react-native-svg` も追加しない。
- Domain（invite の encode / decode、Version、期限、定員、重複判定、Ready gating）は
  React Native、Storage、Transport、Camera Package を import しない純 TypeScript とする。
- Git 操作、`rm`、`npx`、型エスケープ、Mock、Stub、フォーカスしたテストを使わない。

#### 設計判断

1. 実 QR エンコーダ（Reed-Solomon 準拠）を自作または追加依存する案は、M1 が実カメラでの
   走査を要件にしていない以上オーバースペックで、自作は誤り込みやすく 100％ カバレッジの
   検証コストも高い。Payload から決定論的に導出する視覚表現に留める。
2. Room の定員を可変にし N 者間判定を実装する案は、既存 Rules Provider が 2 者間の
   Bilateral 比較しか実装しておらず、この Issue の範囲を超える。定員 2 名に固定し、
   N 者間対応は Known follow-ups とする。
3. QR スキャンの seam を `QrScannerPort` という型付き Port とし、M1 は同一端末内で
   Host が publish した内容を Guest の `scan()` がそのまま返す in-process adapter を
   実装する案を採用する。Camera Permission の 5 状態（未許可・許可・拒否・後から無効化・
   Hardware 不在）は Port の状態として模擬でき、M3 は同じ Port の実装を実カメラへ
   差し替えるだけで済む。

QR decode の型付き Error は、QR の内容そのものに依存する 6 種類（非 Passport QR、
不正 Prefix、不正 JSON、未知 Version、過大 Payload、重複読取）を protocol 層の
`QrPayloadError` に、Room の状態に依存する 2 種類（期限切れ、満員）を domain 層の
`LoungeRoomError` に分離する。参加者が定員（2 名）に達し、かつ全員が Ready になった
時点でだけ Room が `ready` へ遷移し、そこから既存の Agent State Machine
（`src/domain/lounge.ts` の `ActiveLounge` 以降）を開始する。

詳細は [`docs/design/qr-invite-and-ready-flow.md`](./docs/design/qr-invite-and-ready-flow.md)
を正本とする。

#### タスク

1. 設計書、本セクションを先に作成する。
2. Lounge Invite、Lounge Room（Ready gating）、QR Payload の encode / decode、Camera
   Permission Port の日本語 BDD テストを Red で追加する。
3. Domain（`lounge-invite.ts`、`lounge-room.ts`）と Protocol
   （`lounge-invite-schema.ts`、`qr-payload.ts`）、App 層（`qr-scanner-port.ts`、
   `qr-scan-flow.ts`、`camera-permission-notice.ts`、`qr-error-notice.ts`）を実装する。
4. QR の視覚表現（`qr-matrix.ts` + `QrCodeView.tsx`）、Host / Guest 用の新規 Screen
   （`HostInviteScreen.tsx`、`QrScanScreen.tsx`）を実装する。
5. `PassportApp.tsx` を、Owner の共有確定 → Host の Lounge/Invite 作成 → Guest の
   QR 読取・共有確認・Ready → 双方 Ready で Agent State Machine 開始、という流れへ配線する。
6. 単一端末 2 人分のオフライン E2E を、既存 Lounge 状態機械の呼び出し列を通しで検証する
   テストとして固定する。
7. 指定ゲートを実行し、合格後にコミットする。

#### 検証手順

- `bun run typecheck`。
- `bun test src --coverage` で 100％ を確認する。
- `bun biome check .`。
- `bunx textlint` で変更 Markdown を検査する。
- `bun scripts/architecture-harness.ts --staged --fail-on=error`。
- `make before-commit`。
- Domain / Protocol の QR・Room 実装が `react-native` / `expo-camera` /
  `react-native-svg` を import しないことを確認する。

#### 進捗ログ

- 2026-07-17: 既存の Passport / Lounge / Peer Protocol（Issue 5）と account-free
  onboarding（Issue 7）を確認し、Rules Provider が 2 者間 Bilateral 判定であること、
  Backup / Settings 画面がまだ実装されていないこと、`bun test --coverage` は
  テストから import されたファイルだけを計測すること（`.tsx` は現状未計測）を把握した。
- 2026-07-17: 設計書とタスク分解を先に作成し、QR の 6 エラーと Room の 2 エラーへの
  分離、定員 2 名固定、`QrScannerPort` の in-process adapter という 3 判断を確定した。
- 2026-07-17: `lounge-invite.ts`、`lounge-room.ts`、`lounge-invite-schema.ts`、
  `qr-payload.ts`、`qr-scanner-port.ts`、`qr-scan-flow.ts`、
  `camera-permission-notice.ts`、`qr-error-notice.ts`、`qr-matrix.ts` をテスト先行で
  実装した。`qr-matrix.ts` の初版は FNV-1a の最下位 bit が乗数の奇偶にしか依存しない
  弱い avalanche を持ち、別 Payload が同じ Matrix になる回帰を「異なる Payload なら
  異なる Matrix」テストで検出したため、MurmurHash3 の finalizer 相当の mix 手順を追加した。
- 2026-07-17: `QrCodeView.tsx`、`HostInviteScreen.tsx`、`QrScanScreen.tsx` を追加し、
  `PassportApp.tsx` を Host / Guest の Room・Invite・Ready フローへ配線した。Owner と
  Guest の共有 Preview 確認 UI は `SharePreviewGate` へ集約し、Cognitive Complexity
  超過（19、上限 15）を、try/catch の分離と共通化で解消した。
- 2026-07-17: `bun test src --coverage` で 220 テスト、対象ファイル 100％、
  `bun run typecheck`、`bun biome check .` を通した。新規 Markdown への
  `bunx textlint` も個別に通した。
- 2026-07-17: `/review` 相当の独立 Agent 3 系統（正確性・Wrapper 整合性・重複/効率/
  Convention）と `/security-review` を並列実行した。Security は指摘なし。正確性系統が
  重大な回帰を検出した。「Encounter 完了後の遷移先」を誤って `guest-share-preview`
  （Guest 用）へ向けており、Owner が Profile 保存後に到達する唯一の入口
  （`saveLocalProfile` / 復元 `useEffect`）は変わらず `encounter` のままだったため、
  Host が Invite QR へ到達する経路（`share-preview` → `hostLounge`）が実行時に
  一切到達できない閉路になっていた。加えて Room の 1 秒 tick が `ready` 到達後も
  破棄されず、Active Lounge 中も無駄に動き続ける点も検出された。両方を修正し、
  Encounter → Owner の共有 Preview（Host 前段）→ Host Invite → Guest Scan →
  （新規入力なしで）Guest の共有 Preview → Ready、という順序へ確定し、
  `src/app/passport-app-stage-flow.test.ts`（ソーステキスト検査、レンダリング基盤を
  追加しない）で同じ誤りの再発を防ぐ Test を追加した。重複/効率系統の指摘（Lounge と
  Lounge Room の TTL 判定重複、invite の冗長な state、QR 文字列と Matrix の毎秒再計算）
  も同じタイミングで解消した。
- 2026-07-17: 修正後に `bun run typecheck`、`bun test src --coverage`
  （238 テスト、対象ファイル 100％）、`bun biome check .`、
  `bun scripts/architecture-harness.ts --staged --fail-on=error`、`make before-commit`
  （harness・harness_test・pre_release_check・lint_text・lint・typecheck・
  test_coverage・Web Export の全段階）を再実行し、すべて Green を確認した。
- 2026-07-17: `/simplify` 相当の独立 Agent 4 系統（Reuse・Simplification・Efficiency・
  Altitude）を並列実行した。Efficiency は指摘なし。Reuse は
  `passport-onboarding-accessibility.test.ts` と `qr-invite-accessibility.test.ts` が
  `source` / `expectInOrder` を重複実装している点を検出したため、
  `src/screens/accessibility-test-kit.ts` へ集約し、`passport-app-stage-flow.test.ts`
  の同型 helper も同じ集約先へ揃えた。Simplification は `hostParticipantId` が
  `loungeRoom.participants[0]` から一意に導出できる冗長 state だと指摘したため、
  `invite` と同じ理由で `useMemo` 導出へ変更した。Altitude は `guest-share-preview`
  の render 分岐が `resolveGuestProfile` を毎回呼び直し、失敗時に無言で catch-all
  画面へ fall through する潜在的な隙を指摘したため、Scan 成功時に確定した
  `guestProfile` を state として保持し、render では再導出しない形に修正した。加えて
  Altitude は Stage 遷移全体を `reduceLounge` 相当の pure reducer へ抽出すべきという
  より大きな指摘も出したが、本 PR 内での修正範囲を広げすぎるため見送り、
  フォローアップとして記録した。
- 2026-07-17: 全修正後に `bun run typecheck`、`bun biome check .`、
  `bun test src --coverage`（238 テスト、対象ファイル 100％。
  `accessibility-test-kit.ts` も計測対象になり 100％）、
  `bun scripts/architecture-harness.ts --staged --fail-on=error`、`make before-commit`
  の全段階を再実行し、Green を確認した。

#### 振り返り

- **問題**: Payload から決定論的に Matrix を作る初版の hash 関数が、異なる Payload でも
  同じ視覚表現を返す場合があった。
- **根本原因**: FNV-1a は乗数が奇数のため最終文字までの XOR チェーンで最下位 bit の
  偶奇だけが決まり、乗算そのものは最下位 bit を変えない。最下位 bit だけを判定に使うと
  実質「文字コードが奇数の文字数の偶奇」しか見ていないことになる。
- **予防策**: 「同じ Payload は同じ Matrix、異なる Payload は異なる Matrix」という
  日本語 BDD テストを先に固定していたため、この回帰は Red として検出できた。
  MurmurHash3 の finalizer 相当の追加 mix で、どの bit を読んでも十分な拡散を持たせた。
- **問題**: Owner 用と Guest 用の共有 Preview 画面の配線をそれぞれ `PassportApp.tsx` に
  直接書くと、関数の Cognitive Complexity が上限を超えた。
- **根本原因**: 両者は対象の Profile / Selection / 主操作が違うだけで、Preview 生成と
  Validation Error 表示の構造は完全に同じだった。重複した分岐を 1 つの関数へ集約せず
  そのまま置いていた。
- **予防策**: 共通の確認 UI を `SharePreviewGate` という 1 つの内部 Component へ抽出し、
  Owner / Guest はそれぞれの Profile と Selection、Callback だけを渡す形に変えた。
  重複除去と Cognitive Complexity 抑制を同じリファクタで両立した。
- **問題**: `EncounterSetupScreen` の続行操作の遷移先を Guest 用の
  `guest-share-preview` へ書き換えた一方、Profile 保存・復元後に最初に到達する
  `encounter` への遷移そのものは変更しなかったため、Host が Invite QR を作る
  `share-preview` / `hostLounge` に実行時到達できる経路が存在しなくなっていた。
- **根本原因**: 「Encounter は Host 前段から Guest 後段へ移動する」という設計変更を、
  遷移先を書き換えた 1 箇所だけで完結したと誤認し、同じ画面を指す他の遷移元
  （Profile 保存・復元）を洗い出さなかった。`bun test` と `tsc --noEmit` は
  Stage の値そのものを検証しないため、この種の配線ミスを検出しない。
- **予防策**: Encounter は Host 前段のまま据え置き、Guest は Scan 成功後に
  Encounter で入力済みの内容を新たな入力を求めず再利用する設計へ修正した
  （Owner の共有 Preview → Host Invite → Guest Scan → Guest の共有 Preview → Ready）。
  再発防止として、各関数の本体が正しい Stage へ遷移することをソーステキストで
  検査する `src/app/passport-app-stage-flow.test.ts` を追加した。レンダリング基盤を
  新設しない制約の中で、Stage 配線を独立した Agent レビューが再現なく検出できる
  程度の検証は用意できたが、実際にアプリを操作しての手動確認は人間検証として残る。
- **問題**: Room が `ready` へ遷移して Agent State Machine（既存 Lounge）を開始した後も、
  Room の 1 秒 tick（`useEffect([loungeRoom])`）が動き続けていた。
- **根本原因**: tick の停止条件を `status === 'expired'` だけにしており、
  `ready` から Active Lounge へ移った後に Room 自体を破棄する手当てを
  `markHostReady` / `guestReady` に書いていなかった。
- **予防策**: 両関数が `ready` に到達した瞬間に `loungeRoom` を `null` にし、
  `qrScannerPort` も publish 済み内容を取り下げるよう修正した。
- **問題**: `guest-share-preview` の render が毎回 `resolveGuestProfile` を呼び直して
  おり、失敗時は Error 表示なしに後続の別 Stage の分岐へ無言で fall through する
  潜在的な隙があった。実運用では発生しない（`encounteredProfile` の入力元が
  Scan 成功時から変化しない）が、将来の変更で容易に露見しうる構造だった。
- **根本原因**: Owner 用の `privateProfile` は明示保存の成功時にだけ state へ確定する
  のに対し、Guest 用だけは render のたびに関数呼び出しから再導出しており、
  確定済みの値を保持する対称性が崩れていた。
- **予防策**: Scan 成功時に確定した Guest Profile を `guestProfile` という state へ
  保持し、render は再導出せずその値だけを参照するよう変更した。Owner 側の
  `privateProfile` と同じ「確定した値を state に置く」設計に揃えた。
- **問題**: `hostParticipantId` を独立 state として持っていたため、`invite` を
  導出値へ変更した際と同じ「同期の取り忘れ」リスクが残っていた。
- **根本原因**: Host は `hostLounge()` が Room 作成直後に必ず最初の参加者として join
  するため、`loungeRoom.participants[0].participantId` から一意に導出できるにも
  関わらず、個別の `useState` を維持していた。
- **予防策**: `invite` と同じ理由で `useMemo` 導出へ変更し、`setHostParticipantId` の
  呼び出し忘れという分類のバグを構造的に排除した。
- **問題**: Accessibility Test file を追加するたびに、ファイル読込と文言順序検査の
  helper（`source` / `expectInOrder`）を新しいファイルへ複製していた。
- **根本原因**: 最初の Accessibility Test file を書いた時点で、2 つ目以降が続くことを
  見込んだ共有 helper を用意していなかった。
- **予防策**: `src/screens/accessibility-test-kit.ts` へ集約し、既存・新規の
  Accessibility Test file と `passport-app-stage-flow.test.ts` の全てがそこから
  import する形へ揃えた。

---

### [Issue 6 Delivery 品質ゲート] - 2026-07-17

#### 目的

JavaScript、Rules Provider、Web Export の Green と、Native module を含む Development Build の
実機動作を別の証拠として扱う。通常 install では lifecycle script と Native Artifact 取得を
実行せず、明示的な opt-in、取得元の可視化、SHA-256 検証を通した場合だけ取得する。

#### 制約

- `bun install --ignore-scripts`、`bun install --frozen-lockfile --ignore-scripts`、
  `trustedDependencies = []` を維持する。
- `llama.rn` と新しい npm 依存は追加せず、Native Artifact 取得経路だけを将来の導入へ備える。
- Expo Go と Web は Native module を解決せず、Rules Provider で Encounter を完走する。
- iOS 実機検証は有料 Apple Developer Program を前提にせず、Xcode Personal Team を使う。
- ネットワーク取得、CI、iOS 実機、Android 実機は本サンドボックス外の検証として分離する。

#### 設計判断

1. `llama.rn` を `trustedDependencies` へ追加して `postinstall` に取得させる案は導入が短いが、通常
   install と Native Artifact 取得の監査境界が混ざるため採用しない。
2. Native Artifact の URL と SHA-256 を Makefile へ先行固定する案は 1 コマンドで取得できるが、
   未導入の `llama.rn` Version と Artifact を誤って組み合わせるため採用しない。
3. `make setup-llama-native` だけが、将来 install 済みになる `llama.rn` の Version 固定 manifest を
   検証し、取得元と期待値を表示して公式 downloader を強制再実行し、完了 marker を純 TypeScript で
   再照合する案は、通常 install と opt-in 取得を分離しながら package と Artifact を同じ Version に
   固定できる。

案 3 を採用する。shell wrapper は `set -euo pipefail` で失敗を伝播し、`llama.rn` が未導入なら通信前に
非 0 終了する。純 TypeScript 境界は package metadata、Artifact manifest、64 桁の SHA-256、相対 path、
完了 marker を fail-closed で検証する。公式 downloader は `--force` で cache marker による省略を許さず、
manifest の SHA-256 と取得 byte が一致した場合だけ展開と marker 作成を完了する。

#### データの流れと責務

- `make install` と `make install_ci` は依存と `bun.lock` だけを扱い、lifecycle script を実行しない。
- `make setup-llama-native` は install 済み package の metadata を TypeScript 検証へ渡し、検証済みの
  Release URL と SHA-256 を表示してから downloader を実行し、完了 marker を再検証する。
- `make before-commit` は architecture harness、harness test、pre-release check、textlint、Biome、
  typecheck、app test、Web Export を同じ順で実行する。
- CI は `bun.lock` の frozen install 後、Expo Compatibility を独立 step で検査し、ローカルと同じ
  `make before-commit` を実行する。
- Expo Go と Web の composition root は Rules Provider に固定し、Native module は将来の Development
  Build 専用 composition root だけから遅延ロードする。

#### エッジケース

- `llama.rn` package、manifest、downloader のいずれかが無ければ取得前に非 0 終了する。
- package 名、Version、repository、Artifact 名、相対 path、SHA-256 が不正なら取得しない。
- Artifact 取得、SHA-256 検証、展開、marker 作成のいずれかが失敗したら成功表示をしない。
- Expo Go または Web で Native module が無くても、Rules Provider は Bridge または `no-signal` を返す。
- Renovate が Expo SDK と React Native の互換範囲を外した場合は、専用 CI step を非 0 にする。
- Xcode Personal Team の Provisioning Profile が失効した場合は、再 Build と再 install を必要とする。

#### タスク

1. 本セクション、ADR、Native Build 手順を先に記録する。
2. Native Artifact metadata と SHA-256 marker 検証の日本語 BDD テストを Red で追加する。
3. 純 TypeScript 検証、`set -euo pipefail` wrapper、Make target を実装する。
4. install、before-commit、CI、Renovate 検出経路、`.gitignore` を受け入れ条件へ揃える。
5. Rules Provider の既存 composition と遅延 Local Agent 境界を確認し、必要な保証だけを強化する。
6. 指定されたオフラインゲートを実行し、結果と外部検証事項を追記する。

#### 検証手順

- `bun run typecheck`。
- `bun test`。
- `bun biome check .`。
- 変更した Markdown を対象にした `bunx textlint`。
- `bun scripts/architecture-harness.ts`。
- `make before-commit`。
- `make setup-llama-native` が未導入の `llama.rn` を通信前に非 0 で拒否すること。
- CI、実際の Native Artifact 取得、iOS / Android Development Build 実機動作はコーディネータが
  ネットワークと端末を使って検証すること。

#### 進捗ログ

- 2026-07-17: 指定された規則、Makefile、Bun / CI / Renovate 設定、ADR-0008、Rules Provider と
  Local Agent の境界、既存 158 テストを確認した。
- 2026-07-17: 通常 install と Native Artifact 取得を分離し、未導入 package の Version を先行固定しない
  案 3 を選定した。
- 2026-07-17: `package.json` の空 `trustedDependencies` を追加し、`bunfig.toml` と両方が空であることを
  architecture harness の日本語 BDD 3 テストで機械強制した。
- 2026-07-17: Native Artifact metadata、公式 URL、Version、SHA-256、package 内 path、展開先、完了 marker を
  fail-closed で検証する純 TypeScript と日本語 BDD 8 テストを追加した。
- 2026-07-17: `set -euo pipefail` の opt-in wrapper、Make target、CI の frozen install と専用 Expo
  compatibility step、Renovate group、Native 秘匿値と Build 出力の ignore を接続した。
- 2026-07-17: Expo Go / Web の App composition が Rules Provider を直接使い、Local Agent loader が App の
  module graph に含まれない既存保証を確認した。90 app tests と Web Export が Green である。
- 2026-07-17: `bun run typecheck`、169 件の `bun test`、`bun biome check .`、変更 Markdown の
  `bunx textlint`、error と warning が 0 件の全件 architecture harness、`make before-commit` を通した。
- 2026-07-17: `make setup-llama-native` は未導入の `llama.rn` を network 接続前に
  `PACKAGE_NOT_INSTALLED` の非 0 で拒否した。Artifact 実取得、CI、iOS / Android 実機は外部検証へ残した。

#### 振り返り

- 未導入 package の Artifact URL を repository 側へ先行固定せず、将来 lock された package の Version と
  manifest から取得計画を作ることで、依存 Version と Native Artifact の drift を防いだ。
- 公式 downloader は `--force` で取得 byte の SHA-256 を毎回照合し、TypeScript 境界は取得前 metadata と
  取得後 marker を再照合する。通常 install はどちらの実行経路も持たない。
- JavaScript、Web、Native の証拠を能力表と CI step で分離し、Linux CI Green を code signing、権限、ABI、
  実機 runtime の代替にしない完了境界を明示した。
