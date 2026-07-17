# ADR-0010: Native Delivery の証拠と Artifact 取得を分離する

- **Status**: Accepted。
- **Date**: 2026-07-17。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

Expo Go、Web Export、純 TypeScript test が Green でも、`llama.rn` の Native Artifact、code signing、
端末権限、ABI を含む iOS / Android Development Build の実機動作は証明できない。`llama.rn` は
Native Artifact を package の `postinstall` で取得するため、通常 install で lifecycle script を許可すると、
ADR-0001 の供給網境界も曖昧になる。

Issue 6 の時点では `llama.rn` と `expo-dev-client` を依存へ追加しない。未導入 package の Version に対して
Native Artifact URL と SHA-256 を先行固定せず、将来導入した package 自身の Version 固定 manifest を正本に
する必要がある。

## Decision

`make install` は `bun install --ignore-scripts`、`make install_ci` は
`bun install --frozen-lockfile --ignore-scripts` を維持する。`bunfig.toml` と `package.json` の
`trustedDependencies` は空配列に固定し、`llama.rn` の `postinstall` を通常 install では実行しない。

Native Artifact 取得は `make setup-llama-native` だけに許可する。この command は install 済みの
`node_modules/llama.rn` が持つ package metadata と Native Artifact manifest を純 TypeScript で検証し、
各取得元 URL と期待 SHA-256 を表示する。shell wrapper は `set -euo pipefail` を使い、公式 downloader を
`--force` 付きで実行して cache marker による取得省略を許さない。downloader 完了後は純 TypeScript 検証を
再実行し、manifest と完了 marker の SHA-256 が一致した Artifact だけを成功として表示する。

`llama.rn` が未導入、metadata が不正、Artifact が空、パスが package 外を指す、SHA-256 が不正、取得、
byte checksum、展開、完了 marker のいずれかが失敗した場合は非 0 で終了する。Issue 6 のオフライン環境では
未導入拒否と純 TypeScript の検証ロジックまでを test し、実取得はコーディネータの検証項目に分離する。

Delivery の証拠は次の 4 種類を混同しない。

| 実行環境 | Provider | Native module | 必須の証拠 |
| --- | --- | --- | --- |
| Expo Go | Rules Provider である。 | 利用不可である。 | Encounter の app test である。 |
| Web | Rules Provider である。 | 利用不可である。 | Web Export と browser smoke である。 |
| iOS Development Build | Rules Provider と将来の Local Agent である。 | Build へ組み込んだ場合だけ利用できる。 | Xcode Personal Team の個人端末 Build と実行である。 |
| Android Development Build | Rules Provider と将来の Local Agent である。 | Build へ組み込んだ場合だけ利用できる。 | 対応 ABI の実機 Build と実行である。 |

CI は `bun.lock` を frozen install した後、`expo install --check` を Native Compatibility の専用 step で
実行する。その後、ローカルと同じ順序で architecture harness、harness test、pre-release check、textlint、
Biome、typecheck、app test、Web Export を実行する。Renovate の Expo / React Native 更新は専用 group とし、
互換性 step が失敗した変更を自動 merge しない。

iOS の個人端末検証は Xcode Personal Team をデフォルトにし、有料 Apple Developer Program を前提にしない。
App Store / TestFlight 配布、EAS 上の iOS 実機向け signing、Personal Team の上限を越える端末共有、
有料 membership が必要な capability を使う時点を有料 Program への移行境界にする。

## Consequences

- **Good**: 通常 install の Green を Native Artifact 取得成功として扱わない。
- **Good**: 取得元、期待 SHA-256、検証結果を同じ command の log に残せる。
- **Good**: Expo Go / Web は Native module がなくても Rules Provider で完走できる。
- **Good**: Renovate による Expo SDK と React Native の互換性ずれを merge 前に検出できる。
- **Bad**: `llama.rn` 導入後は通常 install に加えて明示的な Artifact setup が必要になる。
- **Bad**: Linux CI だけでは code signing、端末権限、Metal、Android ABI の実機動作を証明できない。
- **Tradeoff**: URL と checksum を repository 独自 manifest へ複製する案より、導入した package の
  Version 固定 manifest を使うことで重複と Version drift を避ける。ただし upstream manifest と
  downloader 形式が変わった場合は opt-in command の validator 更新が必要になる。

## References

- 関連文書: [Native Development Build 手順](../development/native-builds.md)。
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md)。
- 関連 ADR: [ADR-0008](./0008-expo-local-agent-foundation.md)。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/6 。
- 外部資料: https://github.com/mybigday/llama.rn 。
- 外部資料: https://docs.expo.dev/develop/development-builds/create-a-build/ 。
- 外部資料: https://developer.apple.com/help/account/basics/about-your-developer-account/ 。
