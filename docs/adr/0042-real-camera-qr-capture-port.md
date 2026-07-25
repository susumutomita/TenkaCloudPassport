# ADR-0042: 会話エージェントの QR 読取に実カメラ Port を新設し、単一端末デモ用の in-process Port と併存させる

- **Status**: Accepted
- **Date**: 2026-07-25
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

会話エージェント画面の「QR 再スキャン」を Development Build で押しても、相手の
自己紹介カードを取り込めない。原因はアプリに実カメラの読取実装が存在しないこと
である。`QrScannerPort` の実装は `createInProcessQrScannerPort`
（`src/app/qr-scanner-port.ts`）1 種類だけで、これは単一端末デモ用の in-process
stub である。`scan()` はカメラを参照せず、`publish()` で内部変数へ入れておいた
文字列を返すだけで、`publish()` を呼ぶのは Lounge の Host Invite 経路
（`kind: 'lounge-invite'` の QR Payload）だけである。

そのため会話エージェントの再スキャンは、何も publish されていなければ
`NOTHING_TO_SCAN` で失敗し、Lounge Invite が publish 済みなら自己紹介ページ
URL ではないため `INVALID_SHARE_URL` で失敗する。どちらの経路でも成功しえない。

実カメラ走査は [`docs/design/qr-invite-and-ready-flow.md`](../design/qr-invite-and-ready-flow.md)
で当時のスコープ外として明記されたまま、会話エージェント側の導線だけが先行して
露出していた。

同時に、in-process Port には現在も守るべき役割がある。Lounge の Host Invite から
Guest Scan までを 1 台で完走できるという性質は、2 人目の協力者を用意できない
App Store 審査官が単独で機能を確認できる導線として設計に組み込まれている。

## Decision

`QrScannerPort` を実カメラ実装へ差し替えるのではなく、実カメラ専用の
`CameraQrCapturePort`（`src/app/camera-qr-capture.ts`）を新設し、2 つの Port を
責務で分けて併存させる。

- `QrScannerPort`（in-process）は Lounge Invite の単一端末フロー専用のまま残す。
- `CameraQrCapturePort` は「対面の相手端末に表示された QR を実カメラで 1 件読む」
  ことだけを担い、会話エージェントの再スキャンがこれを使う。

`capture()` は Promise を 1 つ返し、権限が `not-determined` なら 1 度だけ要求し、
granted にならなければ Camera Preview を開かずに
`QrScanError('PERMISSION_NOT_GRANTED')` で失敗する。Preview が開いている間は
`status` が `capturing` になり、Overlay Component
（`src/components/CameraQrCaptureOverlay.native.tsx`）が `useSyncExternalStore` で
購読して全画面 Modal を描画する。読み取れた文字列は Component から
`deliver()` で Port へ戻し、取り消しは `cancel()` が
`QrScanError('SCAN_CANCELLED')` で決着させる。

Platform 分割は既存 idiom（`web-crypto-random.ts` / `.native.ts`、
`default-agent-model-provider.ts` / `.native.ts`）にそのまま従う。`expo-camera`
を import するのは `default-camera-qr-capture.native.ts` と
`CameraQrCaptureOverlay.native.tsx` の 2 ファイルだけで、Screen と Domain は
Port の型しか知らない。Web / Bun Test 経路の既定 Composition は権限状態を
`hardware-unavailable` に固定し、`capture()` は黙って no-op になるのではなく
既存の「この端末にはカメラがありません」という文言で失敗する。

権限 Response の状態導出（`cameraPermissionStateFromResponse`）と待機の状態機械は
Platform 非依存の純関数・純オブジェクトとして `camera-qr-capture.ts` に置き、
`bun test` で直接実行する。`.native.ts` 側は `expo-camera` の関数を注入する配線
だけに留め、実行検証は実機に委ねる。

## 選択肢

1. **in-process Port を実カメラ実装へ差し替える（不採用）**: 単一端末で Lounge を
   完走できる性質が失われる。Host が表示した Invite QR を自分のカメラで読むことは
   できないため、審査官向けの単独確認導線と `docs/design/qr-invite-and-ready-flow.md`
   の単一端末 2 人分フローが同時に壊れる。
2. **`scan()` の中で「publish 済みなら in-process、無ければカメラ」と切り替える
   （不採用）**: 呼び出し側から見て同じ 1 つの API が状況によって別の物理経路を
   使う。AGENTS.md が禁じる暗黙のフォールバックであり、失敗時にどちらの経路で
   失敗したのかを利用者にも開発者にも説明できない。
3. **責務の異なる 2 つの Port を併存させる（採用）**: 呼び出し側が「単一端末デモの
   受け渡し」と「実カメラ読取」のどちらを要求しているかを型で表明する。Lounge の
   既存フローは 1 行も変わらない。

## Consequences

- **Good**: 会話エージェントが対面の相手のカードを実際に取り込めるようになり、
  取り込み手段が手動 URL 貼り付けとサンプルカードだけという状態を脱する。
- **Good**: 権限 5 状態は既存の `CameraPermissionState` と
  `camera-permission-notice.ts` の文言へそのまま合流し、会話エージェント専用の
  権限文言体系を新設しない。
- **Good**: Camera Preview の開閉が `status` 1 つに集約され、画面離脱・セッション
  やり直しの経路（`open` / `close` / `onReset`）が通る `resetTransientState` から
  `cancel()` を呼ぶだけで Preview が残らない。
- **Bad**: Lounge の Guest Scan は依然として in-process Port のままで、2 台の端末
  では成立しない。本 ADR は会話エージェントの取り込み経路だけを実カメラ化する。
- **Bad**: `expo-camera` は Native Module であり、既存の Development Build は
  作り直しが必要になる。
- **Tradeoff**: QR を読む口が 2 つになる。将来 Lounge 側も実カメラへ移すときは、
  in-process Port を審査・デモ専用として明示的に残すのか、単一端末フロー自体を
  やめるのかを、この ADR を supersede して決める。

## References

- 関連コード: `src/app/camera-qr-capture.ts`、`src/app/default-camera-qr-capture.ts`、
  `src/app/default-camera-qr-capture.native.ts`、
  `src/components/CameraQrCaptureOverlay.native.tsx`、
  `src/app/use-conversation-agent-flow.ts`、`src/app/qr-scanner-port.ts`
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/146
- 関連 ADR: [ADR-0036](./0036-on-device-conversation-agent.md)、
  [ADR-0041](./0041-conversation-agent-step-b-n-party.md)
- 関連設計: [`docs/design/qr-invite-and-ready-flow.md`](../design/qr-invite-and-ready-flow.md)
- 外部資料: https://docs.expo.dev/versions/latest/sdk/camera/
