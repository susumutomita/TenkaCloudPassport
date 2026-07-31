# AGENTS.md

TenkaCloudPassport の AI エージェント向け作業契約です。方法ではなく、アプリ境界、安全、検証可能な完了条件を固定します。

## Repository

Expo / React Native で構築する mobile application です。domain、provider、shared screen、native boundary を明確に分離します。

```bash
make install
make dev
```

`make dev` は Development Build、`make start` は Expo Go、`make stop` は repository の Metro process だけを安全に停止します。

## Working contract

- 依頼、Issue、既存 screen、domain、provider、test から受け入れ条件を把握する。リポジトリから解決できる曖昧さは自分で調べる。
- 新しい component、hook、provider を足す前に既存実装を検索し、削除または再利用を検討する。
- 方法はタスクに合わせて選ぶ。`Plan.md`、専用 Skill、固定 role、固定人数の subagent、文書先行、TDD の順序は必須ではない。
- domain、provider、UI、error state、test を必要な範囲で接続し、利用者から観測できる working increment を作る。
- 単純な修正を ceremony や multi-agent 化で膨らませない。複雑な native boundary、identity、security 変更では独立した比較や反証を使ってよい。

## Guardrails

- `.env`、秘密情報、credential、個人情報を読み書きしない。
- 破壊的操作、production release、store submission、shared environment への変更は、明示的な承認なしに行わない。
- authentication token、credential、sensitive user data を insecure storage、log、fixture、screenshot へ残さない。
- Expo Go と Development Build の境界を保ち、native module を Expo Go path へ暗黙に流さない。
- チェックを通すためだけに test、type、lint、harness、設定を弱めない。設定または invariant が根本原因なら、証拠と検証を伴って修正してよい。
- failure を空値、固定 UI、silent fallback へ変換して隠さない。

## Verification

モデルが自分で成否を判定できる検証を先に見つける。domain unit、provider integration、screen test、Expo web export、device / simulator preview を変更のリスクに合わせて使う。

- external API、time、secure storage、native module の境界では test double を使ってよい。production code に mock fallback を置かない。
- UI 変更では loading、empty、error、success、keyboard、accessibility、small screen を関連する範囲で確認する。
- バグ修正は失敗を再現し、修正後に同じ経路で解消したことを確認する。
- model ID や provider selection は設定境界へ置き、特定のモデル世代を常時 prompt で固定しない。

PR 前の標準ゲート:

```bash
make before-commit
```

PR 本文には、受け入れ条件、実行した検証、native / Expo boundary の影響、残る risk または未検証事項を書く。Skill は必要なときだけ使い、完了の必須経路にはしない。

## Sources of truth

- architecture invariant: [`docs/architecture/harness.md`](./docs/architecture/harness.md)
- quality: [`docs/architecture/quality-bar.md`](./docs/architecture/quality-bar.md)
- steering: [`docs/architecture/steering.md`](./docs/architecture/steering.md)
