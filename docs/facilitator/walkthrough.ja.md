# 安全な Document Walkthrough

- Kit Version: 1.0。
- 所要時間: 5〜10 分。
- 対象: Product セッションの実機証跡が揃っていない Local Champion と Facilitator。

## Stop Gate

これは文書と図だけを読む説明です。Product セッションを開始しないでください。実参加者の情報を入力しないで
ください。氏名、写真、Profile、連絡先、端末 ID、会話内容を収集しません。実 QR を生成または読み取らないで
ください。Nearby Transport を開始しないでください。App、Camera、Local Model、複数端末を操作しません。
物理能力はすべて `Not run` のままにします。

## 読み合わせ

1. [Architecture Overview](../architecture/overview.md)を開く。Domain は React Native、Storage、Transport、
   Model Runtime から独立し、App 層が Port を通じて外部能力を呼ぶ、と説明する。
2. Pet は Owner が公開を選んだ少量の手掛かりだけを扱い、根拠が弱ければ `no-signal` で退く、と説明する。
   人や相性を採点しない。
3. Bridge は人間同士が話し始める理由を最大 1 つ示すものであり、連絡先交換や関係の成立を保証しない、と
   説明する。
4. Host は一時的な Lounge を管理し、Guest は本人の Preview と同意を自分で判断する役割だと説明する。
   この Walkthrough では Host、Guest、参加者を実際に集めない。
5. [Privacy Data Inventory](../privacy/data-inventory.md)を開き、Owner が共有前に Preview を確認すること、
   Product Consent と Research Consent が別判断であること、Lounge 由来データが永続化されないことを読む。
6. [Release Status](../releases/status.md)を開く。`Implemented` は Source 成熟度であり、対象 Build の
   `Verified` 証拠ではないことを確認する。必要な証跡が揃うまで Product セッションは Blocked である。

質問へ推測で答えず、上記の正本を指します。実演、登録、参加募集へ切り替えません。最後に
「物理能力はすべて Not run のままです。Walkthrough 完了」と読み上げて終了します。
