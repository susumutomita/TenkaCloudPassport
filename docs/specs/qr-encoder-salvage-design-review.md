# 純 TypeScript QR エンコーダのサルベージ Design Review（M3 表示契約）

## Scope

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/66>。
- Role: Designer。
- 対象: `src/qr/encoder.ts` が返す `EncodedQr` を、M3 の QR 表示・読取 UI が consume するときの表示契約。本 Issue の成果物は UI を持たない protocol 層モジュールであり、本書はコードを変更せず、M3 renderer が守るべき要件を先に固定する。
- 正本: 仕様は [仕様書](./2026-07-20-qr-encoder-salvage.md)、実装設計は [設計](../design/2026-07-20-qr-encoder-salvage.md)、M1 の QR 表示設計は [QR 招待・共有確認・Ready フローの設計](../design/qr-invite-and-ready-flow.md)。

## 前提となる実装事実

Review にあたり、次の実装事実を確認した。

- `EncodedQr` は `version`（1〜26）、`errorCorrection: 'M'`、`matrix: readonly (readonly boolean[])[]` を持つ。`true` が暗モジュールである。
- `matrix` は quiet zone を含まない。一辺は `version * 4 + 17` モジュール（21〜121）である。
- finder pattern は左上・右上・左下に置かれる。`matrix[row][column]` を row 0 = 上端として描画すれば ISO/IEC 18004 の標準の向きになる。
- `encodeQr` は決定論的であり、同一入力は常に同一 matrix を返す。
- `QR_ENCODER_MAX_BYTES = 1024` は `src/protocol/qr-payload.ts` の `QR_PAYLOAD_MAX_BYTES = 1024` と一致し、どちらも生文字列（`TCPQ1:` prefix を含む）の UTF-8 byte 数で判定する。

## 1. M3 renderer の表示契約

M3 で `EncodedQr` を描画する renderer は、実カメラでのスキャン可能性を保つため次を守る。

### quiet zone

- `matrix` は quiet zone を含まないため、renderer が四辺すべてに 4 モジュール以上の quiet zone を必ず付与する。描画領域は最小でも `(size + 8) × (size + 8)` モジュール相当になる。
- quiet zone はモジュールサイズに比例させる。固定 padding（M1 の `QrCodeView` は 12 px 固定）を流用しない。モジュールが 10 px なら quiet zone は 40 px 以上必要であり、固定 12 px では不足する。
- quiet zone の色は背景（明側）と同一にする。カードの角丸・影・枠線は quiet zone の外側に置き、quiet zone 内には何も描画しない。

### モジュールのコントラスト

- 暗モジュールは明背景に対してコントラスト比 4.5:1 以上を確保する。推奨は現行 theme の `colors.ink`（#17201d）を `colors.white`（#ffffff）上に描画する組み合わせで、コントラスト比は約 16.7:1 になる。
- 暗モジュールに brand color や gradient を使わない。中間調はカメラの二値化を不安定にする。
- 誤り訂正レベルは M（約 15 ％）である。この誤り訂正予算は会場の照明・反射・斜め読取のために温存し、ロゴの重ね置き・モジュールの角丸化・ドット化などの装飾で消費しない。matrix をそのまま正方モジュールで描画する。

### 最小表示サイズとピクセル整合

- 1 モジュールは物理ピクセルで 2 px 以上とし、モジュールサイズは整数ピクセルに snap する。端数スケーリングによるアンチエイリアスは隣接モジュールを滲ませ、読取率を下げる。
- renderer はモジュールサイズを `floor(利用可能幅（物理 px） / (size + 8))` で決め、結果が 2 px を下回る場合はレイアウトを広げる。matrix を非整数倍率で縮小して収めることはしない。
- Lounge Invite の実 Payload（数百 byte 級）は Version 15〜22 前後、上限の 1,024 byte は Version 26（121 モジュール、quiet zone 込み 129 モジュール）になる。最悪ケースの Version 26 でも 2 px/モジュールを満たせる幅（物理 258 px 以上）を確保できる画面設計にする。
- 読取距離の目安は QR の一辺の約 10 倍である。対面で腕の長さ（約 50 cm）から読み取る運用のため、画面上の一辺はできる限り大きく、利用可能幅いっぱいに表示する。

### ダークモード時の反転禁止

- アプリの theme に関わらず、QR は常に「明背景に暗モジュール」で描画する。反転（暗背景に明モジュール）はカメラの finder pattern 検出を失敗させる読取器が多く、禁止する。
- ダークモード導入時も QR カード部分だけは白背景を維持する。周囲の画面が暗くても、QR カードと quiet zone は明側で固定する。
- 表示中は端末の画面輝度が極端に低いと読取に失敗するため、輝度を上げる案内または自動引き上げを M3 で検討する（契約ではなく推奨）。

### 決定論と再描画

- `encodeQr` は同一入力に対して同一 matrix を返すため、renderer は Payload 単位で memoize できる。`HostInviteScreen` は残り時間表示のため 1 秒ごとに再 render するので、M1 の `QrCodeView` と同様に `useMemo` 相当で encode をキャッシュし、毎秒の再 encode を避ける。1,024 byte 入力の encode は 100 ms 未満だが、UI スレッドで毎秒繰り返してよい負荷ではない。

## 2. M1 装飾表現から M3 実 QR へ切り替える際の UX 上の注意

- M1 の `src/components/qr-matrix.ts` は Payload の hash から導出した見た目だけの Grid であり、Screenshot・画面共有されても Payload は判読できない。これは意図した privacy 特性である。M3 で実 QR に切り替えた瞬間、この特性は消える。Screenshot はそれ自体が Join Secret を含む完全な Invite の複製になる。
- したがって `screenshotRiskNotice`（`src/app/i18n/messages.ts` の「Screenshot や画面共有で、この QR が対面以外の相手に見られるリスクがある」旨の常設警告）は、M1 では予防的な注意だったが、M3 では文字どおりの脅威記述になる。警告の常設を維持し、文言が M3 の実態（QR の画像そのものが招待として機能する）を正しく伝えているかを切替時に再確認する。
- Replay 防止の正本は Screenshot の抑止ではなく、1 回限り Join Secret の原子的消費と Secret Rotation、20 分 TTL である（M1 設計の判断を維持する）。Screenshot 検知・防止 API に依存する設計へ流れない。
- 画面の情報順序は `src/screens/qr-invite-accessibility.test.ts` が「QR、期限、Screenshot リスク、参加者状態、主操作」で固定している。実 QR への切替でこの順序を崩さない。
- M1 の装飾 Grid は 16 × 16 固定だが、実 QR は 21〜121 モジュールで Payload 長により密度が大きく変わる。レイアウトはモジュール数可変を前提に組み直し、密度が上がっても前述の最小モジュールサイズを下回らないことを切替時の受け入れ条件にする。
- 装飾表現と実 QR を同一画面に併存させない。読み取れない Grid が「スキャンできる QR」と誤認される事故を避けるため、切替は画面単位で一括して行い、その判断は仕様書のスコープ外宣言どおり M3 の ADR として記録する。

## 3. アクセシビリティ要件（WCAG 2.1 AA）

- 非テキストコンテンツ（達成基準 1.1.1）: QR は画像であり、`accessibilityRole="image"` と `accessibilityLabel`（残り時間を含む説明）を必須にする。M1 の `QrCodeView` が持つ props 契約（`payload` と `accessibilityLabel`）を M3 でも維持する。
- 代替経路の必須化: QR を視認できない・カメラを向けられないユーザーが参加から排除されないよう、M3 では QR 読取以外の参加経路が必要になる。`QrScannerPort` は `denied` / `revoked` / `hardware-unavailable` を型として持ち、M1 設計は「Camera 拒否がアプリ全体の利用不能に波及しない」ことまでは保証しているが、Lounge 参加自体の代替（例: 短い招待コードの手入力を `QrScannerPort` の別実装として提供する）は未設計である。M3 の設計課題として明示的に扱う。
- コントラスト（達成基準 1.4.3・1.4.11）: QR 周辺の説明文・期限表示・警告文は 4.5:1 以上、ボタン等の UI 部品は 3:1 以上を確保する。QR モジュール自体は前節の契約（約 16.7:1）で満たされる。
- リフローと拡大（達成基準 1.4.10）: 200 ％ 拡大時にも QR が見切れず全体が表示されること。QR は縮小側の下限（最小モジュールサイズ）を守りつつ、スクロールで全体を確認できるレイアウトにする。
- 意味のある順序（達成基準 1.3.2）: スクリーンリーダーの読み上げ順は前述の固定順序（QR、期限、Screenshot リスク、参加者状態、主操作）に従う。既存テストを M3 でも維持する。
- 動的更新の抑制: 残り時間の毎秒更新をそのまま live region にすると読み上げが止まらなくなる。分単位の節目だけ通知するなど、更新頻度を抑える。

## 4. エラー状態の扱い（DATA_TOO_LARGE / INVALID_DATA）

- 到達可能性: `QR_PAYLOAD_MAX_BYTES` と `QR_ENCODER_MAX_BYTES` はどちらも 1,024 byte で、同じ生文字列表現に対して判定される。protocol 層の検証を通過した Payload が `DATA_TOO_LARGE` になることはなく、UI でこのエラーを観測した場合は protocol 層との不変条件が壊れたことを意味する。`INVALID_DATA` も内部不整合であり、正常運用では到達しない。
- fail-closed の維持: エラー時に装飾 Grid・部分的な matrix・以前の QR を代替表示しない。読み取れない、または古い招待を「スキャンできる QR」として提示することが最悪の failure mode である。QR 領域はエラー状態の表示に置き換える。
- encode の時点: encode は Invite 発行時（`host-invite` 画面へ遷移する前）に同期的に行い、失敗したら画面遷移自体を中止する。QR 画面が「描画できない Payload を抱えて mount する」状態を作らない。
- 回復導線: エラー表示には「Invite を作り直す」操作と、Passport 編集へ戻る導線を置く（Camera 権限拒否時と同じく、失敗がアプリ全体の利用不能に波及しない構造を保つ）。入力の切り詰めによる自動回復はしない。
- privacy: エラーメッセージ・ログに Payload の内容や長さ以外の断片を含めない。`QrEncodingError` の `code` と定型文言だけを表示する。

## EncodedQr 型の十分性判定

判定: M3 renderer にとって不足なし。

- 描画に必要な情報は `matrix`（quiet zone なしの正方 boolean 行列、`true` = 暗）だけで完結し、一辺の長さは `matrix.length` から導出できる。
- `version` は表示サイズの事前見積り（レイアウト計算）に、`errorCorrection: 'M'` は「装飾で誤り訂正予算を消費しない」契約の根拠として使える。
- 採用 mask 番号は型に含まれないが、描画には不要であり不足ではない。
- quiet zone を matrix に含めない設計は、色・サイズ・余白を renderer の責務に置く設計（実装設計の責務境界）と整合しており、本書の表示契約で補完される。型の変更は要求しない。

## M3 への引き継ぎ事項

- QR 読取以外の参加経路（招待コード手入力等）の設計。
- 実 QR 切替の ADR 化と、`screenshotRiskNotice` 文言の再確認。
- Version 26（quiet zone 込み 129 モジュール）での最小モジュールサイズ検証を含む、実機での明るさ・距離・画面サイズ差の人間検証（M1 設計の人間検証項目を引き継ぐ）。
