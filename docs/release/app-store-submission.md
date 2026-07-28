# App Store 申請メタデータ（v1.1.0）

本書は TenkaCloud Passport v1.1.0 を App Store Connect（ASC）へ申請するための、owner がそのまま
コピーして使えるメタデータ一式です。誇張を避け、実装済みの範囲だけを事実として記述します
（fail-closed）。文字数上限は Apple の一般的な既知の値を目安として付しますが、最終的な上限と
入力欄の実際の文字数は申請時に ASC の画面上で確認してください。

対象は iOS App Store のみです。Android の署名済み配布は別トラック（
[Release Status と Device Matrix](../releases/status.md) の「Signed Android distribution」
参照、現在 `Planned` / `Blocked`）であり、本書の対象外です。

Section 1-4（App 名・説明文・キーワード・プロモーションテキスト）は ASC の申請画面で読者が
実際に目にする文言であるため日本語・英語の両方を用意しています。Section 5 以降（App Privacy の
根拠、審査官向け Notes、年齢レーティング、owner 手順）は owner・審査官向けの運用文書であり、
英語が必要な箇所（Section 7 の App Review Notes は Apple の審査官が読むため英語で記載）を除いて
日本語のみとします。

## 1. App 名・サブタイトル候補

**App 名**: `TenkaCloud Passport`（`app.json` の `expo.name` と同じ、変更しない）。

**サブタイトル候補**（Apple の目安上限は 30 文字、ASC で最終確認する）。

| # | 日本語 | English |
| --- | --- | --- |
| 1 | 名刺不要の自己紹介カード | No card, no account needed |
| 2 | QR で自己紹介、アカウント不要 | Free intro cards, no account |
| 3 | 無料・アカウント不要の自己紹介 | QR intro cards, zero setup |

owner が 1 案を選びます。3 案とも実装済みの機能（名刺不要・アカウント不要・QR）だけを述べており、
対応端末だけで動く Apple Intelligence 連携はサブタイトルには含めていません。

## 2. 説明文（Description）

### 日本語

```
TenkaCloud Passport は、名刺がなくても自己紹介を渡せる、無料でアカウント不要のアプリです。

■ 名刺不要、アカウント不要
名前（必須）・肩書き・自己紹介・リンクなどを入力して保存するだけ。ログインもアカウント作成も
要りません。

■ QR を見せるだけ
保存した自己紹介カードは QR コードとして表示します。相手はこのアプリを入れなくても、標準の
カメラで QR を読み取るだけでブラウザに自己紹介ページが開きます。連絡先への追加はページ内の
ボタンを押した場合だけの任意操作です（連絡先への追加は iPhone / Safari で確認済みです。
Android では保存した .vcf ファイルを開く一手間が必要で、この経路は未検証です。LINE、X、
Instagram などの SNS アプリ内ブラウザでは、ファイルの保存自体が失敗する場合があります）。

■ サーバーへの送信ゼロ
自己紹介データは QR コードの URL フラグメントに埋め込まれ、相手のブラウザ内だけで復号されます。
このデータがサーバーへ送信されることはありません。

■ 端末内で会話の共通点を見つける
相手の自己紹介ページを取り込むと、確認済みの会話テーマから共通点と最初の質問を端末内だけで
見つけます。この基本機能はモデルのダウンロードなしで動作します。

対応端末（iPhone 15 Pro 以降・iOS 26 以降で Apple Intelligence を有効にしている場合）では、
OS 内蔵の Apple Intelligence が自動的に働き、自己紹介文にある共通点を補助的に見つけたり、
共通点の下に短い会話例を生成したりできます。ダウンロードや同意画面はなく、送信も一切ありません。
会話例には「AI が作った例で、実際のやり取りではない」ことを常時表示します。入力と生成結果は
端末内のメモリにだけ置かれ、保存もサーバー送信もされません。非対応端末では従来どおり確認済み
テーマからの一致だけで動作します。

データを預からない、アカウントを作らない、名刺を用意しない。まずは自分の自己紹介カードを
作ってみてください。
```

### English

```
TenkaCloud Passport is a free, account-free app for introducing yourself without a business card.

- No card, no account
Enter your name (required), title, a short bio, and links, then save. No sign-up, no login.

- Just show a QR code
Your saved Intro Card displays as a QR code. The other person does not need to install anything —
they scan it with their phone's stock Camera app, and their browser opens your intro page.
Adding you to Contacts is a fully optional tap inside that page (verified working on iPhone /
Safari; on Android, opening the downloaded .vcf takes one extra step and this path is unverified;
in-app browsers inside apps like LINE, X, or Instagram may fail to save the file at all).

- Zero server transmission
Your intro data lives in the QR code's URL fragment and is decoded entirely inside the other
person's browser. It is never sent to a server.

- Find common ground on-device
Import the other person's intro page and the app finds a shared conversation topic and a first
question entirely on your device. This base flow works without downloading a model.

On supported devices (iPhone 15 Pro or later, iOS 26 or later, with Apple Intelligence enabled),
the OS's built-in Apple Intelligence automatically helps identify common ground from the intro
text and, on request, creates a short hypothetical conversation example. There is no download or
consent screen, and nothing is ever transmitted. The app always labels that example as AI-generated
and not a record of a real exchange. The inputs and generated example stay only in device memory;
they are never saved or sent to a server. On unsupported devices, the app continues to work from
confirmed conversation themes only.

No data collected. No account required. No business card needed. Create your Intro Card and try it.
```

## 3. キーワード

Apple の目安上限はカンマ区切りで合計 100 文字です。

日本語版は次のとおりです（約 52 文字の目安）。

```
名刺,自己紹介,QR,クラウド,会話,共通点,プライバシー,オフライン,アカウント不要,交流,人脈,無料
```

English 版は次のとおりです（約 83 文字の目安）。

```
business card,QR code,intro,networking,privacy,offline,conversation,no account,free
```

## 4. プロモーションテキスト（Promotional Text）

Apple の目安上限は 170 文字です。ASC からアプリ本体を再申請せずに更新できる欄なので、
season 施策やキャンペーンに応じて owner が自由に書き換えられます。

日本語版は次のとおりです。

```
名刺不要、アカウント不要。QR を見せるだけで自己紹介ページが開きます。データはサーバーへ送信されません。相手カードを取り込めば端末内で共通点を見つけ、対応端末では Apple Intelligence で短い会話例も作れます。
```

English 版は次のとおりです。

```
No business card or account. Share an intro by QR with zero server data. Find common ground on-device, with Apple Intelligence creating a clearly labeled conversation example on supported devices.
```

ASC の実画面で文字数を再確認し、上限を超える場合は「対応端末では Apple Intelligence で / with Apple
Intelligence creating a clearly labeled conversation example on supported devices」を削って
基本価値を優先します。

## 5. URL

| 項目 | 値 |
| --- | --- |
| サポート URL | `https://github.com/susumutomita/TenkaCloudPassport` |
| マーケティング URL | `https://card.tenkacloud.com` |
| プライバシーポリシー URL（日本語デフォルト） | `https://card.tenkacloud.com/privacy` |
| プライバシーポリシー URL（English、ASC のローカライズ欄に追加する場合） | `https://card.tenkacloud.com/en/privacy` |

サポート URL は GitHub Issues（`.../issues`）が実質の窓口です。プライバシーポリシーページは
`site/privacy/index.html`（日本語）と `site/en/privacy/index.html`（English）としてリポジトリに
実在します。

## 6. App Privacy（プライバシー「栄養ラベル」）回答

**回答: Data Not Collected（データを収集していません）** で申告できます。

### 根拠

- アカウント・ログイン・サインアップの経路、Analytics SDK・クラッシュレポート SDK・広告 SDK、
  外部推論 API への送信のいずれも存在しない。設計根拠は
  [Privacy データ台帳](../privacy/data-inventory.md) の「データ最小化の契約」を正本とする。
- 自己紹介データは QR コードの URL フラグメントに埋め込むだけであり、HTTP リクエストとして
  サーバーへ送信されない（相手のブラウザ内だけで復号する静的ページ、外部リクエストゼロ）。
- 会話エージェントが取り込んだ相手カード、Prompt / token / 検証前 Output、検証済みの会話例は
  `L3` の短命データである。アプリのメモリと、対応端末では OS 内蔵の Apple Intelligence（`FoundationModels`
  framework）にだけ存在する。File、AsyncStorage、Benchmark 本文、Diagnostic Report、Pilot
  Aggregate、Log、Share Sheet、Clipboard、外部 Endpoint へは複製しない。Apple Intelligence 自体は
  OS が管理し、アプリから推論内容へ外部送信はできない。
- 開発者向け診断機能として残置している旧オンデバイス Model（Qwen・`llama.rn`）の
  Local Model Benchmark が保持するのは Model digest と時間・Memory・Thermal・Battery の
  数値だけで、Prompt、会話内容、氏名、端末識別子を含まない。この経路は消費者向け導線から
  撤去済みで、開発者が診断目的で明示的に操作した場合だけ動く。

iOS の Privacy Manifest（`PrivacyInfo.xcprivacy`）は `expo prebuild` や EAS Build のたびに、
インストール済みの Native package から自動集約されるファイルです。`ios/` ディレクトリは
`.gitignore` の `/ios/` 対象でリポジトリに含めておらず、本書はその時点の生成内容を断定しません。
owner は Submit 前に一度 prebuild または EAS Build を実行し、生成された
`ios/TenkaCloudPassport/PrivacyInfo.xcprivacy` で `NSPrivacyCollectedDataTypes` が空配列、
`NSPrivacyTracking` が `false` であることを確認します。`NSPrivacyAccessedAPITypes` には
`UserDefaults`・`FileTimestamp`・`DiskSpace`・`SystemBootTime` など Required Reason API の
定型カテゴリが並ぶ見込みですが、これらはいずれもデータ収集の申告ではなく、API 使用理由の
申告です。生成内容が上記の根拠と矛盾する場合は、原因になった Native package を特定してから
申告します。

### 権限（Info.plist）

`app.json` の `ios.infoPlist` には `ITSAppUsesNonExemptEncryption: false` が定義されています。

v1.1.0 から `NSCameraUsageDescription` が加わります。会話エージェントが対面の相手の自己紹介
ページ QR を読み取るために、`expo-camera` の config plugin 経由でカメラ用途文言を宣言します
（根拠 [ADR-0042](../adr/0042-real-camera-qr-capture-port.md)）。自分の QR を表示するだけなら
従来どおりカメラは不要で、相手が標準カメラアプリで読む経路も変わりません。

マイク・位置情報・連絡先の usage description は定義していません。これは意図的です。
`expo-camera` の plugin 設定で `microphonePermission: false` と `recordAudioAndroid: false` を
明示し、カメラ以外の権限を要求しない構成にしています。

## 7. App Review Notes（審査官向け）

ASC の App Review Notes 欄は Apple の審査官（英語話者を前提とする）が読むため、以下は英語のまま
ASC へ貼り付けます。

```
This app is free, requires no account, and does not run any server that receives user data.

(a) On-device conversation agent and Apple Intelligence conversation example
The app includes an on-device conversation agent that finds common ground between intro cards.
By default it runs fully offline with no model download, no account, and no network: it selects a
shared conversation topic and a first question from a fixed, pre-reviewed catalog shipped inside
the app. This base flow runs on every device, including devices and Simulators that do not support
Apple Intelligence.

On supported devices (iPhone 15 Pro or later, iOS 26 or later, with Apple Intelligence enabled in
Settings > Apple Intelligence & Siri), the app automatically uses the OS's built-in Apple
Intelligence (the `FoundationModels` framework) to help find common ground. There is no separate
opt-in screen, no model bundled in the app binary, no download, and inference makes no network
calls — it runs entirely through the OS's own on-device model. When available, the model may point
out an overlap between the two intro-card free-text descriptions. For that factual common-ground
result, it may only return substrings copied from the corresponding input, and the app verifies
each substring character-for-character before showing it. On devices that do not support Apple
Intelligence, the app shows a brief, permanent notice that conversation openers come from confirmed
themes only, and continues to work from the base flow above.

After a bridge is displayed on a supported device, the user may tap "Show an AI conversation
example." This is a separate, optional surface. The app always shows a non-dismissible notice that
the output is AI-generated and not a record of a real exchange. The prompt has no fields for
either person's name, email, phone number, or links. The output is restricted to one JSON object
containing 2-6 alternating owner/peer turns, with the owner first and each line limited to 80
characters. Extra fields, invalid speaker order, control characters, line breaks, email addresses,
URLs, and phone-like number sequences are rejected. The complete JSON object is validated before
the first bubble is shown; partial unvalidated output is never rendered. The user can cancel,
retry, or regenerate, and the original common-ground result remains visible if generation fails or
times out.

The prompt, tokens, unvalidated output, and validated example stay only in app/runtime memory. They
are not logged, persisted, exported, copied to the clipboard, shared with the counterpart, or sent
to any server. The AI conversation example feature is absent on devices without Apple Intelligence,
and on the rules-only, web, and Expo Go paths.

You can test the base agent single-handed on one device. When creating your test Intro Card,
select at least one conversation theme that the built-in sample also has — for example
"オープンソース" (Open source) — and optionally write a one-line self introduction. Then open the
conversation agent from the home screen button and tap "Try with a sample" ("サンプルで試す").
This injects a fixed fictional counterpart card, with no real person or real contact information,
and the agent surfaces the shared theme as common ground with a first question. If you create a
card with only a name (no theme, no self introduction), the agent correctly reports that no common
ground was found — that is the designed no-signal state, not a malfunction. If your review device
or Simulator supports Apple Intelligence, run the sample bridge and tap the AI chat button below
the common ground and first question to test the AI-to-AI icebreaker chat — no setup step is
required. If Apple Intelligence is not available on your review device or Simulator, the app
instead shows the permanent "confirmed themes only" notice mentioned above, and the AI chat button
is absent; that is the designed fallback, not a malfunction.

(b) QR intro flow
Create an Intro Card (name is the only required field), then show its QR code. Scanning it with a
second device's stock Camera app (no app install needed) opens the intro page in that device's
browser. The QR encodes a plain HTTPS URL whose fragment contains the card data; URL fragments are
not sent in HTTP requests. Contact-add inside that page is optional and one tap.

(c) Zero data collection
There is no account, login, analytics SDK, crash-reporting SDK, advertising SDK, external inference
API, or server that receives user data. The build's auto-generated iOS Privacy Manifest is checked
from the release build before submission: NSPrivacyCollectedDataTypes must be empty and
NSPrivacyTracking must be false.

Guideline 4.2 (native functionality beyond a repackaged website): the app provides on-device
storage of the user's own Intro Card, fully offline QR generation, camera-based QR intake, and
on-device AI inference through Apple Intelligence on supported devices. None of these depend on a
server-hosted backend.

Guidelines 1.1 / 1.2 (user-generated / AI-generated content): the app does not provide a public
feed, community, messaging service, shared AI history, or a way to publish the generated example.
The only model-authored display text is a short, explicitly requested, clearly labeled hypothetical
conversation example visible to the requesting user on that device. It is bounded and fully
validated as described above, then discarded when the flow is reset, regenerated, closed, or the
process ends.

A dedicated report/flag flow is not included in this version because the generated example is
private, transient, on-device, not sent to another user, not persisted, and not publishable. The
product design requires this decision to be revisited before adding persistence, sharing,
clipboard/export, cloud inference, public/community surfaces, longer open-ended generation, tools,
or sensitive-topic inputs.
```

## 8. 年齢レーティング・カテゴリ

### 年齢レーティングの想定回答

暴力表現、性的表現、ギャンブル、ホラー、成人向けテーマ、アルコール・薬物の描写のいずれも
含みません。アプリ内にユーザー生成コンテンツを不特定多数へ公開する経路（フィード、公開
プロフィール、コメント欄等）がなく、AI 会話例も利用者本人の端末にだけ短時間表示されて保存・
共有されません。アプリ内蔵のブラウザで任意の外部サイトを閲覧させる機能もありません（QR から
開く自己紹介ページは相手自身の端末のデフォルトブラウザで開きます）。

上記から **4+** を想定します。実際の値は ASC の最新質問票へ owner が事実どおり回答した結果で
確定します。質問票が AI 生成コンテンツを独立して尋ねる場合、本書の App Review Notes と実装に
合わせて「限定された端末内の生成面がある」と回答し、4+ を先に決めて回答を歪めません。

### カテゴリ候補

| 優先度 | カテゴリ | 選定理由 |
| --- | --- | --- |
| 主 | 仕事効率化（Productivity） | 名刺代わりに自己紹介情報を保存・提示する実務ツールとしての性格が最も強い。 |
| 副候補 1 | ソーシャルネットワーキング（Social Networking） | 初対面の相手との交流を助ける目的だが、フィードや公開プロフィールなど SNS 的機能は持たない。 |
| 副候補 2 | ユーティリティ（Utilities） | QR 生成・端末内保存という単機能ツールとしての側面。 |

owner の判断で主カテゴリを 1 つ選びます。副カテゴリは ASC が許せば併用します。

## 9. owner 実施手順（チェックリスト）

- [ ] スクリーンショットを取得する。ASC が要求する必須サイズを申請時点のアップロード画面で
      確認し、Simulator または実機で撮る。
- [ ] 基本の Intro Card 作成、QR 表示、相手ブラウザ表示を実機で確認する。
- [ ] Apple Intelligence 非対応の端末 / Simulator で、会話エージェントの共通点と最初の質問が
      確認済みテーマの一致だけで動くことを確認する。「現在 Apple Intelligence を利用できない
      ため、会話のきっかけは確認済みテーマから探します」という案内が表示され、AI 会話例
      ボタンが出ないことも確認する。
- [ ] Apple Intelligence 対応端末（iPhone 15 Pro 以降・iOS 26 以降、Settings > Apple
      Intelligence & Siri で有効化済み）で会話エージェントを開き、上記の案内が出ないこと、
      共通点抽出が Apple Intelligence 経由で動くことを確認する。有効化・ダウンロードの
      明示操作は不要（OS が管理するため）。
- [ ] 対応端末で Local primary Bridge の下にだけ AI 会話例ボタンと Disclosure が表示されることを
      確認する。
- [ ] Generate、Cancel、Retry、Regenerate、60 秒 Timeout、画面離脱、Reset、相手削除を確認し、
      どの経路でも Bridge が消えず、古い会話例が復活しないことを確認する。
- [ ] 日本語・英語で Disclosure、Privacy 文、左右の話者ラベル、VoiceOver の読み上げを確認する。
- [ ] 生成中・失敗・成功のスクリーンショットを審査メモ用に保存する。ただし Prompt や実在人物の
      自己紹介内容を Engineering Evidence へ残さず、固定サンプルだけを使う。
- [ ] ASC の該当 App でメタデータ（App 名・サブタイトル・説明文・キーワード・プロモーション
      テキスト・URL 群）を入力する。
- [ ] スクリーンショットをアップロードする。
- [ ] App Privacy（栄養ラベル）を入力する前に、一度 `expo prebuild` または EAS Build を実行して
      生成された `ios/TenkaCloudPassport/PrivacyInfo.xcprivacy` を開き、
      `NSPrivacyCollectedDataTypes` が空配列、`NSPrivacyTracking` が `false` であることを確認する。
- [ ] ASC の App Review Notes に Section 7 の英語文を貼り付ける。
- [ ] 年齢レーティング質問票へ、公開 UGC は無いが限定された端末内 AI 会話例はあるという実装事実に
      基づいて回答する。
- [ ] `docs/development/ios-testflight-release.md` の手順でタグ push 済みのビルドが TestFlight に
      届いていることを確認し、実機（自分の端末、可能なら友人の端末も）で一通り操作確認する。
- [ ] 上記すべてが揃った状態で Submit for Review する。

### Apple Intelligence（OS 内蔵）とエンタイトルメント不要の理由

ADR-0057・ADR-0058 で、会話エージェントの Primary Provider を OS 内蔵の Apple Intelligence
（`FoundationModels` framework）へ一本化しました。対応端末（iPhone 15 Pro 以降・iOS 26 以降・
Apple Intelligence 有効）では OS が推論を担うため、モデルの同梱・ダウンロード・同意画面・
特別な entitlement のいずれも不要です。`modules/apple-foundation-models/` の native module は
`weak_frameworks = ['FoundationModels']` で弱リンクしており、iOS 26 未満・非対応端末でも
起動時クラッシュせず、確認済みテーマからの一致（Rules）へ自動的に切り替わります。

### 旧 端末内 LLM（Qwen・llama.rn）と preview entitlement（再導入口として残置・現在は未使用）

v1.1.0 で会話エージェントの端末内 LLM（Qwen・`llama.rn`）を一度再有効化しましたが（根拠
[ADR-0043](../adr/0043-grounded-quote-bridge-and-local-llm-reenablement.md)）、v1.1.1〜v1.1.6
の実機不具合の大半がこの経路のダウンロード・検証・削除起因だったため、ADR-0057・ADR-0058 で
消費者導線から撤去し、上記の Apple Intelligence へ置き換えました。実装（`use-local-model-management.ts`
/ `trusted-model-download.ts` 等）は再導入口としてリポジトリに残していますが、Settings・会話画面の
どこからも呼び出されず、production Build の実行結果には影響しません。

`app.json` の `llama.rn` plugin は `entitlementsProfile: ["preview"]` のみを持ち、production Build
には extended memory entitlement を適用しません（この記述は Qwen 経路が呼び出し不能な現在も、
plugin 設定自体は build に残っているため、事実として維持しています）。この entitlement を要する
実機テストには Apple Developer Portal 側の capability 有効化と Provisioning Profile の再生成という
別の owner 作業が必要です。

手順と根拠は
[`llama-provider-development-build.md`](../design/llama-provider-development-build.md) の
該当節、[Issue 104 設計文書](../design/2026-07-23-on-device-conversation-agent.md)、
[会話例設計](../design/2026-07-26-conversation-example.md)、
[ADR-0057](../adr/0057-apple-intelligence-primary-provider.md)、
[ADR-0058](../adr/0058-apple-intelligence-startup-gate-and-consumer-ui-removal.md) を正本とします。

## 10. TestFlight ビルドの起動方法

バージョンタグ `v1.1.0` を push すると、`.github/workflows/ios-release.yml`（`ios-release`
ワークフロー）が起動し、EAS の production プロファイルで Build から Submit（TestFlight への
提出）までを非対話で実行します。owner が行う操作は以下だけです。

```bash
git tag v1.1.0
git push origin v1.1.0
```

タグ push 後の運用（実行結果の確認、失敗時の再実行手順、`ios.buildNumber` は
`eas.json` の `appVersionSource: "remote"` により EAS 側で自動採番されるため手で書き換え不要、
等）は [`ios-testflight-release.md`](../development/ios-testflight-release.md) を正本とします。
