# OSS Alpha Release Design Review

## Scope

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/29>。
- Role: Product Designer。
- 対象: Root README、Contributor 向け導線、Feature / Device / Model / Transport Matrix、
  Architecture Diagram、Release Checklist、JA / EN の情報対称性である。
- Method: 初めて Repository を訪れた外部 Contributor、Local Champion、Release Operator、
  Security Reviewer の 4 経路を、入口から「次に安全に実行できる操作」まで机上 Simulation した。
- Physical device、Assistive Technology、実ブラウザの Markdown / Mermaid 読み上げ: `Not run`。

## Verdict

Current contributor-facing information architecture: `BLOCK`。

Source-only Alpha と物理 Gate を分離する設計方針は妥当です。しかし現行 README は、実装済み機能と
実機検証済み能力を一目で区別する Matrix、英語だけで完結する導線、環境別の成功 / 失敗状態、Architecture の
テキスト代替をまだ持っていません。次の契約を README と Release 文書へ反映するまで、初見 Contributor が安全に
Alpha の範囲を判断できる状態とはしません。

## Primary user journeys

README は機能一覧から始めず、目的別に次の 4 経路を提示する。

| 読者 | 最初の問い | 最初に選ぶ導線 | 到達すべき成功状態 |
| --- | --- | --- | --- |
| 外部 Contributor | 手元で何を動かせるか。 | Web / Expo Go / Native Build のいずれかを選ぶ。 | 実行した環境、Provider、未対応能力を説明できる。 |
| Local Champion | この Build で Product Lounge を開催できるか。 | Device / Transport Matrix と Facilitator Kit を読む。 | `Verified` の証拠がある経路だけを選び、`Not run` なら Walkthrough に限定できる。 |
| Release Operator | 同じ Source Candidate を再現できるか。 | Release Candidate 手順と Artifact Manifest を読む。 | Git ref、Version、全 Artifact digest、再現性結果を照合できる。 |
| Security Reviewer | Release に秘密値や参加者 Data がないか。 | Security / Privacy Canon と Release Checklist を読む。 | 除外対象、検査結果、残る `Not run` / `Blocked` を追跡できる。 |

「アプリを試す」と「公開可否を判断する」を同じ Quickstart に置きません。前者の成功はローカルで画面または
Rules Flow が動くことであり、後者の成功は Release Checklist と物理 Evidence が揃うことです。

## Proposed README information architecture

Root README の見出し順を次で固定する。深い設計文書を先に読ませず、各節の最後に次の安全な行動を 1 つ示す。

```text
TenkaCloud Passport
├── Product boundary / 非目標
├── Alpha status / Source-only と物理 Gate
├── Choose a path / 目的別入口
│   ├── Web
│   ├── Expo Go
│   ├── iOS Development Build
│   ├── Android Development Build
│   ├── Release Candidate の再現
│   └── Facilitator Kit
├── Feature Matrix / 実装状態
├── Device, Model, Transport Matrix / 検証状態
├── Architecture / 依存方向とテキスト代替
├── Canon / Product, Privacy, Security, Protocol, ADR
├── Contributing / Guide, Issue, PR, Good First Issue
└── Release / Checklist, Changelog, Limitations, Rollback
```

### 1. Product boundary

最初の viewport で、日本語と English の双方が次を理解できるようにする。

- デジタル名刺、人物検索、相性 Score、継続 Chat ではない。
- Pet は Owner が今回の共有を許可した確認済み手掛かりだけから、口頭会話を始める理由を最大 1 つ提示する。
- 根拠が弱ければ `no-signal` とし、Bridge 後は Pet が退く。
- Account、中央 Server、Participant Analytics を中核体験の前提にしない。

詳細な Product 定義は [CONCEPT](../../CONCEPT.md) と
[Product Contract](../product/product-contract.md) へ委ねるが、非目標を理解するためにリンク先を開くことを
必須にしない。

### 2. Alpha status

Product 名の直後に、装飾 Badge だけではなく次の平文を置く。

- Release kind: `Source-only Alpha Candidate`。
- Public release state: `Draft` または `Published`。
- Source ref / Version。
- Repository verification month。
- Physical device acceptance: `Verified` / `Not run` / `Blocked`。
- Native / Web Binary を含まないこと。

CI Badge、Issue close、`Implemented` は物理検証の代わりにしない。日付のない「現在」「対応済み」は避け、
Matrix の検証月と Source ref へ結び付ける。

### 3. Choose a path

共通準備と環境別手順を分離する。

1. Bun / Git の共通前提と frozen install を示す。
2. Web、Expo Go、iOS Development Build、Android Development Build を別の小見出しにする。
3. 各経路は `Prerequisites`、`Commands`、`First success`、`Not available`、`Recovery` の同じ順を使う。
4. Command の直後に「何が表示されれば成功か」を書く。
5. Native Build では Personal Team の無料検証範囲と Public iOS 配布不可を同じ節で示す。

`make dev` の後に iOS / Android / Web command を並べるだけでは、Expo Go と Development Build の能力差を
判定できない。Local LLM、実 Camera、Nearby Transport が未導入または未検証なら、その経路の成功条件に含めない。

### 4. Canon navigation

README の Canon 節は、読者の判断目的と正本を対応させる。

| 判断 | 正本 |
| --- | --- |
| 何を作る / 作らないか。 | [CONCEPT](../../CONCEPT.md)、[Product Contract](../product/product-contract.md) |
| 何を共有・保持・破棄するか。 | [Data Inventory](../privacy/data-inventory.md)、[Retention Policy](../privacy/retention-policy.md) |
| 何を脅威として止めるか。 | [Threat Model](../security/threat-model.md) |
| QR / Peer の Wire 契約は何か。 | [Peer Protocol](../architecture/peer-protocol.md) |
| なぜその設計を採用したか。 | `docs/adr/` index |
| 現場で何を確認するか。 | [Facilitator Kit](../facilitator/README.md) |

リンク文言は「こちら」「詳細」ではなく判断対象を表す。README と各言語版の相対 Link は、実在 Path と Fragment を
機械検査する。

## Status model

Feature の成熟度と Evidence の状態は別軸です。同じ `Status` 列へ混ぜません。

### Feature maturity

| Label | 意味 | 禁止する読み替え |
| --- | --- | --- |
| `Implemented` | Release ref の Production Path に実装があり、Repository Gate を通る。 | 特定 Device で動作確認済みとは限らない。 |
| `Experimental` | Release ref に bounded な実装があるが、API、Adapter、物理証跡のいずれかが安定条件を満たさない。 | Pilot で使用可能とは限らない。 |
| `Planned` | Release ref の Production Path に実装がない。 | 設計文書や Issue の存在を実装としない。 |

### Verification evidence

| Label | 意味 | 必須表示 |
| --- | --- | --- |
| `Verified` | 記載した Source ref、環境、月、手順で証拠を確認した。 | Scope、Evidence link、検証月。 |
| `Not run` | 対象条件でまだ実施しておらず、成功も失敗も主張しない。 | 未実施理由と安全な代替経路。 |
| `Blocked` | 既知の不足条件により実施開始または完了ができない。 | Blocker、解除条件、owner または追跡 Issue。 |

`Implemented + Not run`、`Experimental + Verified` のような組合せを許す。`Not run` は薄い色や空欄で表さず、
必ず文字 Label と判断文を持たせる。

## Matrix contracts

### Feature Matrix

横幅を抑えるため、最大 6 列とする。

| Capability | Maturity | Runnable environment | Repository evidence | Physical evidence | Limitation / next step |
| --- | --- | --- | --- | --- | --- |
| 各機能名 | `Implemented` / `Experimental` / `Planned` | Web、Expo Go、Development Build など | Test / Source ref | `Verified` / `Not run` / `Blocked` | 制約と Issue link |

最低でも Domain、Rules Provider、Local LLM、Storage、バックアップ、QR、Handshake、Peer Protocol、Nearby Transport、
Group Lounge、Diagnostics / Full Delete を 1 行ずつ持つ。大きな「Native」行へ Local LLM、Camera、Transport を
まとめない。

### Device / OS Matrix

環境と能力を 1 つの巨大な表へ交差させない。Web / Expo Go と Native Development Build を分ける。

- Web / Expo Go: Runtime、Browser または Expo Go Version、Rules Flow、QR source、検証月、Evidence。
- iOS Development Build: Device family、iOS range、Build ID、Camera、Local Model、Transport、Evidence。
- Android Development Build: Device family、Android / API range、ABI、Build ID、同じ Capability 列、Evidence。

端末名や OS が未指定なら空欄ではなく `Not run — device/build unspecified` とする。Simulator / Emulator の
結果を物理 Device 行へ入れず、別 Scope として表示する。

### Model Matrix

Model Weight の配布表にしない。Architecture、size bucket、digest prefix の形式、Runtime / ABI、取得方法、
License、Verification state、Memory limitation だけを持つ。Model file name、full path、download token、Weight 自体を
Release 文書へ載せない。候補がない場合は `Planned` とし、空の表を出さない。

### Transport Matrix

Peer Protocol と Nearby Transport を同じ行にしない。Transport ごとに次を記録する。

- Adapter / protocol 名と Source ref。
- iOS / Android の組合せ。
- Wi-Fi / Personal Hotspot / Internet disconnected の条件。
- participant 数、join count、p50 / p95、disconnect / recovery。
- secure channel / fingerprint / packet capture の Evidence。
- `Verified` / `Not run` / `Blocked` と検証月。

実 Adapter がない現状は `Nearby Transport: Planned`、Evidence は `Not run` です。in-process flow や Pure
TypeScript Peer Protocol を実通信 Evidence にしません。

## Empty, error, and unavailable states

文書も Contributor-facing UI であるため、正常表だけでなく次の状態を設計する。

| 状態 | 表示契約 | 次の操作 |
| --- | --- | --- |
| Matrix に候補がない。 | 空表を出さず、`Planned` と追跡 Issue を表示する。 | Issue を読み、Product Boundary 内の作業だけを選ぶ。 |
| Evidence がない。 | `Not run`、対象 Scope、未実施理由を表示する。 | 未検証能力へ依存しない経路へ戻る。 |
| 前提が不足する。 | `Blocked`、不足する Tool / Device / Credential、解除条件を表示する。 | 前提を用意するか別経路を選ぶ。 |
| Command が失敗する。 | 代表的な first failure と非破壊 Recovery を環境別に示す。 | Gate を飛ばさず、対応 Runbook へ進む。 |
| Evidence link が失効または参照不能である。 | 古い `Verified` を維持せず、状態を `Blocked` に戻す。 | Evidence を再取得し Review する。 |
| Candidate がまだない。 | `No draft candidate` と表示し、最新版らしい Asset を推測させない。 | Release 手順から同じ ref を再現する。 |

`—` は「対象外」にだけ使い、未実施、未知、失敗の代用にしない。対象外は `Not applicable` と理由を併記する。

## Documentation accessibility

### Headings and navigation

- H1 は 1 つ、見出し Level を飛ばさず、目次と見出しの語を一致させる。
- Product status、Quickstart、Matrix、Known Limitations を深い折り畳みの中へ隠さない。
- 同じ表示名の Link を複数の異なる宛先へ使わない。
- Command の意味と成功 signal を code block の外にも書く。

### Tables

- Status は色、絵文字、Badge だけで表さず、各行に文字 Label を置く。
- 1 行目を column header、1 列目を一意な row label とし、結合 Cell を使わない。
- 1 表を最大 6 列程度に分け、狭い viewport で横 Scroll しても Capability と Status の対応を失わせない。
- Cell に複数の判断を詰めず、Evidence と Limitation は短い Link / 要約にする。
- 表の直前に目的、直後に重要な結論を平文で書き、Screen Reader 利用者へ表全体の探索を強制しない。

### Mermaid and architecture

Mermaid は補助図とし、唯一の Architecture 説明にしない。

- 図の直前に「Domain は Platform に依存せず、App が Port を介して Storage、QR、Transport、Agent Runtime を
  呼ぶ」という要約を置く。
- 図の直後に依存方向を番号付き List で再掲する。
- 色、線種、位置だけで `Implemented` / `Planned` や許可 / 禁止を区別しない。
- Node label は短くし、HTML、絵文字、改行依存を避ける。
- Mermaid が Render されない環境でも、同じ依存関係を読める text tree または List を残す。

## JA / EN contract

Root README の冒頭には両言語で Product boundary、Alpha state、Language navigation を置く。詳細を同じ File に
併記するか `README.ja.md` / `README.en.md` に分けるかは実装判断だが、次を必須とする。

- English 読者が日本語 Matrix を開かずに Release / Device の可否を判断できる。
- JA / EN で Feature row、Status、Evidence、Command、Known Limitation の集合が一致する。
- `Verified` / `Not run` / `Blocked` と `Implemented` / `Experimental` / `Planned` は翻訳して意味を変えず、
  両言語で同じ英語 Label を正本として使う。
- 一方の言語だけに安全上重要な Warning、Recovery、Apple 配布制約を置かない。
- Locale 切替 Link は各文書の冒頭と対応節に置き、同じ判断点へ移動できる。
- JA / EN parity は単語存在ではなく、Matrix の row key、状態、Evidence link、見出し構造で機械検査する。

## Findings and required integration

| Severity | Finding | Risk | Required integration |
| --- | --- | --- | --- |
| Blocker | README 冒頭に「デジタル名刺ではない」境界と Source-only Alpha 状態がない。 | 完成した Native Product または Profile 交換 App と誤認する。 | 両言語の Product boundary と Release state を first viewport に置く。 |
| Blocker | Feature maturity と Device verification の Matrix がない。 | Repository Test を実機 Evidence に読み替える。 | 2 軸の状態 Model と Evidence date / ref を持つ別 Matrix を作る。 |
| Blocker | Quickstart が環境別の成功、非対応、Recovery を分離していない。 | Expo Go で Local LLM / Transport が使える、または Native Build 済みと誤認する。 | 共通準備の後に Web / Expo Go / iOS / Android を同じ 5 項目で分ける。 |
| High | README に Architecture Diagram と非視覚代替がない。 | Contributor が Native dependency を Domain または Expo Go graph へ混入させる。 | Mermaid、平文要約、番号付き依存方向を同時に置く。 |
| High | CONCEPT、Threat Model、Data Inventory など必須 Canon が入口から揃っていない。 | Product / Privacy の変更先を誤る。 | 判断目的別 Canon table を追加する。 |
| High | English の自己完結した Contributor / Release 判断経路がない。 | English Contributor が日本語の `Not run` 条件を見落とす。 | JA / EN の見出し、row key、status、evidence parity を固定する。 |
| High | Empty、失敗、Evidence 失効時の表示規則がない。 | 空欄や古い `Verified` が成功に見える。 | `Planned` / `Not run` / `Blocked` と次操作を状態ごとに定義する。 |
| Medium | 大きな Matrix と Mermaid の Screen Reader / narrow viewport 代替が未定義である。 | 状態と対象 Scope の対応を失う。 | 6 列以下への分割、平文結論、text alternative を必須にする。 |
| Medium | Contributor Guide、Issue Template、Good First Issue への入口がない。 | 初回 PR が Product Boundary や Git 規律を壊す。 | Contributing 節から Guide、Issue / PR Template、候補 Issue へ 1 hop で到達させる。 |

## Review completion criteria

Designer 再 Review は次がすべて揃った時点で `ALLOW` にできる。

- Root README の JA / EN 両経路を初見 Simulation し、4 persona が最初の安全な行動を選べる。
- Feature Matrix と Device / Model / Transport Matrix に空欄がなく、状態と Evidence が別列である。
- `Not run` と `Blocked` の全行に理由、代替経路、追跡先がある。
- Mermaid を非表示にしても Architecture の依存方向を説明できる。
- 200％ Zoom、狭い viewport、Keyboard、Screen Reader の文書走査結果が記録される。
- JA / EN parity の構造 Test が Green である。

Assistive Technology と実ブラウザの結果は、Repository の Markdown 検査で代替せず、実施までは `Not run` とする。
