# OSS Alpha Release User Feedback

> Baseline status: 本文は実装前の初見 Simulation で検出した Fail / BLOCK を保存する Review 記録です。
> 現在の受け入れ状態を示す表ではありません。対応後の独立再 Review は `Not run` であり、この文書だけで
> Source Candidate、Public OSS Alpha、Product セッションを昇格しません。

## 対応状況

| Baseline finding | Current response | Remaining evidence |
| --- | --- | --- |
| README の入口、成功条件、公開境界が不明確 | JA / EN README で Repository、Web、Expo Go、Native Build、Draft Candidate を分離した。 | Candidate commit 上の immutable Actions URL と Reviewer は `Not run`。 |
| Candidate の再現コマンド、出力、Recovery が不足 | 固定 ref、未作成 Output、SPDX、Notice、Manifest、checksum、2 回生成を Runbook と CLI に実装した。 | 固定 Candidate commit からの実生成は `Not run`。 |
| Walkthrough が Product 手順と分離されていない | JA / EN の安全な Document Walkthrough を追加し、Support Matrix から直接 Link した。 | 未経験者 Dry Run と物理能力は `Not run`。 |
| Rules Provider と Local Model が同じ能力行にある | JA / EN の Support Matrix で別行に分けた。 | Candidate Build での実行証跡は両方 `Not run`。 |
| 実機証拠なしの `Verified` 表示 | Release Status を Candidate commit / immutable Evidence がない限り `Not run` に戻した。 | Gate B の全項目が未達で Public OSS Alpha は `Blocked`。 |

Good First Issue は Repository 内に 3 件の候補と Template だけを用意しています。GitHub 上の実在 Open Issue
3 件は作成していません。「実在 Open Issue 3 件」と「Open Issue 0 件」は同時に満たせないため、Maintainer が
優先条件を決めるまで Public 受け入れは `Blocked` のままです。

## 目的

Issue 29 の OSS Alpha Release を、Maintainer の口頭補足がない状態で初めて触る外部 Contributor と Local Champion の視点から検証した結果です。検証対象は現在の README、リリース仕様、設計、QA 計画、Facilitator Kit、Native Build 手順です。

本検証は文書上の導線をたどるシミュレーションです。端末、実機、Nearby Transport、Local Model、複数参加者による動作確認ではありません。現在 `Not run` とされている能力を、本検証によって `Verified` に変更してはなりません。

## 判定

| 対象 | 判定 | 理由 |
| --- | --- | --- |
| 外部 Contributor の初回セットアップ | **BLOCK** | 実行経路の選択、前提条件、最初の成功判定、失敗時の復帰方法が不足しており、環境不足と製品不具合を区別できないため |
| Source Release の再現 | **BLOCK** | 設計で参照する生成コマンドと利用者向け手順が現在のリポジトリに存在せず、固定 ref から同一成果物を再生成して検証できないため |
| Local Champion の Walkthrough | **条件付き ALLOW** | 文書の読み合わせだけであり、参加者データを扱わず、全能力を `Not run` のまま維持する場合に限り実施可能であるため |
| Local Champion の Product セッション | **BLOCK / Not run** | 配布、実 QR、Nearby、Local Model、Group、Host Loss、Accessibility、Full Delete、未経験者 Dry Run の必須証跡がないため |
| Public OSS Alpha | **BLOCK / Not run** | QA 計画が要求する Physical Gate が未実施であり、Draft Source Candidate と Public Release の境界が README から判別できないため |

現時点で安全に公開できる状態は「公開リリース」ではなく「検証用 Draft Source Candidate」に限定されます。ただし、その Draft Candidate 自体も生成・検証手順が実装されるまでは受入不可です。

## シミュレーション 1: 外部 Contributor

### README から実行経路を選ぶ

README は `make dev`、iOS、Android、Web を同じ節で案内していますが、Bun、Web、Expo Go、Native Build のどれを最初に選ぶべきかを示していません。初回利用者は、iOS と Android も Web と同程度にすぐ動くと解釈し得ます。一方、Native Build 手順には `expo-dev-client` と `llama.rn` が未導入であり、実機 Local Agent 経路が未証明であると記載されています。この差は README を読み終えるまで分かりません。

必要な修正は、README 冒頭に次の選択表を置くことです。

| 経路 | 誰向けか | 前提 | 最初の成功 | 現在の保証 |
| --- | --- | --- | --- | --- |
| Bun gate | Contributor | 対応 Bun、Git | `make before-commit` が成功する | Repository Contract のみ |
| Web | UI と Rules Provider の確認者 | 対応 Bun、ブラウザー | 表示された URL でアプリが開く | Web の明示した範囲のみ |
| Expo Go | 実機 UI の確認者 | 対応端末、Expo Go、同一ネットワーク | QR から起動し初期画面が表示される | Native module を使わない範囲のみ |
| Native Build | Native module の開発者 | Xcode または Android SDK、Development Build | 対象端末で Development Build が起動する | 現在は `Not run` または `Blocked` を明記 |

### セットアップする

README のセットアップには、対応 Bun バージョン、OS 別前提、取得する ref、クリーンな作業ツリー、成功時の出力がありません。`bunx expo install --fix -- --ignore-scripts` は依存関係ファイルを変更し得ます。しかし、初回利用者は変更が期待値なのか、環境差なのかを判断できません。そのまま Pull Request に混ぜる危険があります。

必要な修正は次のとおりです。

1. 対応 Bun バージョン、Git、OS 別ツール、Expo Go の要否を開始前に列挙する。
2. Release Candidate の tag または commit SHA を checkout する手順を示し、移動する main を再現性の基準にしない。
3. 再現確認には frozen lockfile を使う専用コマンドを示す。
4. `expo install --fix` が変更し得るファイルと、変更が出た場合は作業を止めて差分を確認することを示す。
5. 各コマンドに成功時の短い出力例と、次に進める条件を記載する。

### 最初の成功を判断する

README は起動コマンドを示すだけです。どの画面、URL、状態を「成功」とするかを示していません。Contributor は Metro の起動、アプリの初期画面表示、Rules Provider の応答、Native module の動作を同じ成功として扱い得ます。

各経路には 1 つの観測可能な成功判定が必要です。Web の例は「指定 URL で初期画面が表示され、Rules Provider と表示される」です。Expo Go の例は「QR から起動し Native-only 機能が無効表示になる」です。Native Build の例は「Build ID と端末情報を記録して初期画面が表示される」です。このように確認範囲を限定します。

### 失敗から復帰する

現在の文書には、よくある失敗を環境不足、既知の未実装、製品不具合に分類する表がありません。そのため、Xcode 未導入、Android SDK 未設定、端末から Metro に到達不能、Native module 未導入、生成先が既に存在する、といった状態で安全な次の行動が分かりません。

少なくとも次の復帰表が必要です。

| 失敗 | 状態 | 安全な次の行動 |
| --- | --- | --- |
| Bun の版が不一致 | `Blocked` | 対応版へ切り替え、依存関係を固定条件で再取得する |
| Web は起動するが Expo Go から接続できない | `Not run` | ネットワーク前提を確認し、解消しなければ Web 経路へ戻る。Expo Go を `Verified` にしない |
| Native module が見つからない | `Blocked` | Expo Go で代替できると推測せず、Development Build の前提不足として記録する |
| 既存の成果物ディレクトリがある | `Blocked` | 上書きせず、新しい空の出力先を指定する |
| 成果物生成が途中で失敗する | `Blocked` | 部分成果物を配布せず、失敗した出力先を隔離して新しい空の出力先で再実行する |
| checksum が一致しない | `Blocked` | 配布と Release 昇格を停止し、ref、manifest、生成環境を再確認する |
| 必須証跡が古い、または参照不能 | `Blocked` | 過去の `Verified` を引き継がず、再実行するまで昇格しない |

## シミュレーション 2: Local Champion

### README から Facilitator Kit へ移動する

README は Facilitator Kit へリンクしていますが、リンクの手前で「現在は Product セッションを開始してはならない」と明示していません。Kit の先頭には `Physical Dry Run Not run` とあるものの、その後に P1 から P10 までの具体的な Product セッション手順が続きます。初めて読む Champion は、細かな手順が存在すること自体を実施許可と誤認し得ます。

README と Kit の先頭に、現在選べるモードを明示してください。

| モード | 現在の可否 | 許可する行為 | 禁止する行為 |
| --- | --- | --- | --- |
| Document Walkthrough | 可 | 文書、図、役割、停止条件の読み合わせ | 実参加者データ、実 QR、Nearby 接続、Product セッションの開始 |
| Repository Demo | 証跡がある経路のみ | 明示された Web または Rules Provider の範囲を1人で確認 | 端末能力や Local Model の実証と表現すること |
| Product セッション | 不可 | なし | 参加者募集、データ入力、QR 配布、Group 実施 |

### `Not run` を解釈する

Kit の能力表は安全側に倒れていますが、「Rules Provider / Local Model」が 1 つの行にまとめられています。README は Web と Expo Go で Rules Provider が動くと述べています。一方、Kit は同じ行を `Not run` としています。そのため、Champion は Web の Repository Demo まで禁止なのか、Local Model だけが未確認なのか判断できません。

Rules Provider と Local Model は別行に分ける必要があります。また、`Implemented`、`Experimental`、`Planned` はソース状態です。`Verified`、`Not run`、`Blocked` は実行証跡の状態であり、同義ではありません。この違いを表の直前に明記してください。`Implemented` であっても、対象端末・対象 Build の証跡がなければ Product セッションでは `Not run` のままです。

### Walkthrough を安全に終える

現状は Product セッションを停止する規則はありますが、代替となる Walkthrough の台本がありません。Champion は安全に止めた後、どこまで説明してよいか分かりません。

Walkthrough 専用の 1 枚手順には、次を含める必要があります。

1. 実参加者の氏名、写真、プロフィール、端末識別子を入力しない。
2. 実 QR を生成または読み取らず、Nearby を開始しない。
3. 概念図を用いて Pet、Bridge、Host、Guest、Consent、停止条件を説明する。
4. 各物理能力を `Not run` のまま読み上げ、推測で補完しない。
5. 質問、混乱、停止理由だけを個人情報なしで記録する。
6. Product セッションの開始条件となる証跡の保存先と承認者を示して終了する。

## Release Candidate の受入ギャップ

設計と QA 計画は Source Release CLI、manifest、checksums、release checklist、feature/device/model/transport matrix を前提としています。しかし、現在の利用者導線からは、それらを生成・検証する実行可能なコマンドと文書へ到達できません。設計上のエラー処理が存在しても、利用者が実行できる runbook がなければ再現可能な Release にはなりません。

| 受入項目 | 現在の結果 | 受入に必要な具体的修正 |
| --- | --- | --- |
| Alpha 境界の理解 | Fail | README 冒頭で Draft Candidate、Public OSS Alpha、Product セッションの状態を分離する |
| Bun quickstart | Fail | 対応版、固定 ref、frozen install、成功出力、復帰方法を追加する |
| Web quickstart | Fail | Expo Go と分離し、URL、成功画面、確認範囲を示す |
| Expo Go quickstart | Fail | QR、ネットワーク、Native-only 制限、失敗時の Web fallback を示す |
| Native Build quickstart | Fail | Xcode / Android SDK、Development Build、未導入 module、`Not run` 状態を示す |
| Source Candidate 生成 | Fail | 実在する 1 つのコマンド、入力 ref、空の出力先、終了コードを提供する |
| Source Candidate 検証 | Fail | manifest と checksums の検証コマンド、期待ファイル集合、署名方針を提供する |
| Feature status | Fail | `Implemented / Experimental / Planned` と証跡状態を分離した matrix を追加する |
| Device / Model / Transport status | Fail | Build ID、OS、端末、Provider、Transport、実施日、証跡 URL を含む matrix を追加する |
| Known limitations | Fail | 既知の未導入、未実施、サポート外を一か所に集約する |
| Change log と rollback | Fail | version の意味、Draft 取消、再発行、証跡失効の手順を追加する |
| Contribution 導線 | Fail | CONTRIBUTING、Issue Template、Good First Issue、PR 前 gate の読み方を追加する |
| Local Champion walkthrough | Fail | Product セッションと分離した、個人情報を扱わない専用台本を追加する |
| Public Release gate | Not run | 固定された Physical Gate の全件を同一候補 Build で実施し、証跡を承認する |

## 優先修正

### P0: 誤実施と誤公開を止める

1. README の最上部に現在の Release State を置き、Public OSS Alpha と Product セッションが `Not run` であることを明示する。
2. Facilitator Kit のリンク前に、現時点では Document Walkthrough のみ許可されることを明示する。
3. 実参加者データ、実 QR、Nearby、Group を Walkthrough で使わない停止条件を追加する。
4. Draft Source Candidate と Public Release の昇格条件を別の checklist にする。

### P1: 初回成功と復帰を作る

1. Bun、Web、Expo Go、Native Build を別々の quickstart に分ける。
2. 各 quickstart に前提、コマンド、期待出力、最初の成功、既知の失敗、復帰、証跡を記載する。
3. Source Candidate 生成と checksum 検証に 1 つずつ copy-and-paste 可能なコマンドを提供する。
4. 出力先の衝突、部分成果物、checksum 不一致、古い証跡を fail-closed にする。

### P2: 外部 Contributor が自走できる入口を作る

1. CONTRIBUTING、Issue Template、Good First Issue を提供する。
2. `make before-commit` の成功条件と、失敗時に変更してはならない invariant / 設定を案内する。
3. Product Contract、Architecture、Threat Model、Data Inventory、Release Checklist、Known Limitations を README から直接たどれるようにする。
4. Mermaid 図に同等内容のテキスト説明を添える。
5. 英語話者が日本語 README を経由せず、同じ境界と停止条件へ到達できる英語入口を用意する。

## 再受入条件

次の全件を満たした場合にのみ、外部 Contributor と Local Champion による再受入へ進めます。

- クリーンな環境の Contributor が Maintainer の補足なしで経路を 1 つ選び、最初の成功を観測し、失敗を分類できる。
- 固定 ref と空の出力先から Source Candidate を生成し、manifest と checksums を独立に検証できる。
- 失敗時に部分成果物が配布対象にならず、既存成果物が上書きされない。
- Champion が README だけで Walkthrough と Product セッションの可否を正しく判断できる。
- Walkthrough が実参加者データ、実 QR、Nearby、Group を使わず完了できる。
- `Implemented` と `Verified` を混同せず、対象 Build に証跡がない能力を `Not run` と記録できる。
- Public OSS Alpha は、固定した Physical Gate の全証跡が同一候補 Build に結び付くまで Draft のままである。

最終受入は 2 段階とします。まず Draft Source Candidate の再現性と文書導線を受け入れます。その後に Physical Gate を実施して Public OSS Alpha を判断します。この順序を逆転してはなりません。
