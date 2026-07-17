# ADR-0008: Expo と Local Agent 境界をアプリ基盤に採用する

- **Status**: Accepted。
- **Date**: 2026-07-17。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

TenkaCloud Passport は iOS、Android、Web で同じ Domain と Screen を使う単一モバイルアプリとする。
TypeScript Template の Hono / Vite workspace は製品要件に不要であり、Lounge の中核フローは
中央サーバーなしで成立しなければならない。端末内モデルの候補である `llama.rn` は Expo Go と
Web では利用できず、直接 import すると Native module を持たない bundle の解決を壊す。

## Decision

Expo SDK 57 / React Native 0.86 アプリをリポジトリルートへ置き、Hono / Vite workspace は作らない。
iOS、Android、Web は同じ `App.tsx`、Screen、純 TypeScript Domain を使う。Expo Go / Web のデフォルトは
端末外と通信しない Rules Provider とし、確認済みの共通カタログ項目がある場合だけ主要 Bridge を
1 件生成し、それ以外は `no-signal` を返す。

Local Agent は結果契約の interface と遅延 loader を受け取る adapter に分ける。`llama.rn` の依存と
直接 import は Issue 4 へ入れない。後続 Issue の Development Build 専用 composition root が
`() => import('llama.rn')` に相当する loader を注入し、Expo Go / Web の module graph へ Native module を
含めない。loader は Local Agent の最初の生成要求まで実行しない。

Lounge はメモリ内の状態機械とし、Bridge または `no-signal` の確定直後に Pet を `retired` へ遷移する。
退出、Host 終了、壁時計の 20 分満了、単調増加時計の 20 分経過のうち最も早い契機で、結果を含む
Lounge 由来データを破棄する。

## Consequences

- **Good**: 単一の Domain と Screen で iOS、Android、Web の契約を揃えられる。
- **Good**: Expo Go / Web で依存追加なしに Rules Provider の Encounter を完走できる。
- **Good**: Native module の有無を build 境界へ閉じ込め、Web Bundle の解決対象から外せる。
- **Good**: Bun、Biome、architecture harness、供給網防御、ADR、GitHub Actions を継続利用できる。
- **Bad**: Issue 4 では GGUF モデルを使う Local Agent の実機動作を検証できない。
- **Bad**: 単一端末 Lounge は相手の公開済みカタログ項目を同じ端末へ入力する操作が必要である。
- **Tradeoff**: Expo アプリを workspace へ分離する案は複数アプリが必要になった時点で再検討する。
- **Tradeoff**: `llama.rn` の直接 import は Development Build、実機 CI、モデル配布と検証の設計が
  揃った後に、専用 composition root だけで採用する。

## References

- 関連設計: [初回 Encounter の設計](../design/initial-encounter.md)。
- 関連コード: `src/domain/`、`src/local-agent/`、`App.tsx`。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/4 。
- 関連 ADR: [ADR-0007](./0007-privacy-data-contract.md)。
- 外部資料: https://docs.expo.dev/ 。
