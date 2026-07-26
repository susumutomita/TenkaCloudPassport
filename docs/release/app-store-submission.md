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
任意ダウンロードの端末内 AI はサブタイトルには含めていません。

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

■ 端末内で会話の共通点を見つける（任意）
相手の自己紹介ページを取り込むと、確認済みの会話テーマから共通点と最初の質問を端末内だけで
見つけます。この基本機能はモデルのダウンロードなしで動作します。

Settings で端末内 AI を明示的に有効化した場合は、自己紹介文にある共通点を補助的に見つけたり、
共通点の下に短い会話例を任意生成したりできます。会話例には「AI が作った例で、実際のやり取りでは
ない」ことを常時表示します。入力と生成結果は端末内のメモリにだけ置かれ、保存もサーバー送信も
されません。

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

- Optional on-device way to find common ground
Import the other person's intro page and the app finds a shared conversation topic and a first
question entirely on your device. This base flow works without downloading a model.

If you explicitly enable the optional on-device AI in Settings, it can additionally use the intro
text to help identify common ground and, on request, create a short hypothetical conversation
example. The app always labels that example as AI-generated and not a record of a real exchange.
The inputs and generated example stay only in device memory; they are never saved or sent to a
server.

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
名刺不要、アカウント不要。QR を見せるだけで自己紹介ページが開きます。データはサーバーへ送信されません。相手カードを取り込めば端末内で共通点を見つけ、任意の端末内 AI で短い会話例も作れます。
```

English 版は次のとおりです。

```
No business card or account. Share an intro by QR with zero server data. Find common ground on-device and optionally create a clearly labeled AI conversation example.
```

ASC の実画面で文字数を再確認し、上限を超える場合は「任意の端末内 AI / optionally」を削って
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
- 会話エージェントが取り込んだ相手カード、端末内モデルの Prompt / token / 検証前 Output、
  検証済みの会話例は `L3` の短命データである。アプリと GGUF runtime のメモリにだけ存在し、
  File、AsyncStorage、Benchmark 本文、Diagnostic Report、Pilot Aggregate、Log、Share Sheet、
  Clipboard、外部 Endpoint へ複製しない。
- Local Model Benchmark が保持するのは Model digest と時間・Memory・Thermal・Battery の数値だけで、
  Prompt、会話内容、氏名、端末識別子を含まない。

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

(a) On-device conversation agent and optional AI conversation example
The app includes an on-device conversation agent that finds common ground between intro cards.
By default it runs fully offline with no model download, no account, and no network: it selects a
shared conversation topic and a first question from a fixed, pre-reviewed catalog shipped inside
the app.

A user may explicitly enable an optional on-device language model from Settings. No model is
bundled in the app binary, the download does not start without that opt-in, and inference makes no
network calls. When enabled, the model may point out an overlap between the two intro-card
free-text descriptions. For that factual common-ground result, it may only return substrings copied
from the corresponding input, and the app verifies each substring character-for-character before
showing it.

After a local-model bridge is displayed, the user may tap "Show an AI conversation example." This
is a separate, optional surface. The app always shows a non-dismissible notice that the output is
AI-generated and not a record of a real exchange. The prompt has no fields for either person's
name, email, phone number, or links. The output is restricted to one JSON object containing 2-6
alternating owner/peer turns, with the owner first and each line limited to 80 characters. Extra
fields, invalid speaker order, control characters, line breaks, email addresses, URLs, and
phone-like number sequences are rejected. The complete JSON object is validated before the first
bubble is shown; partial unvalidated output is never rendered. The user can cancel, retry, or
regenerate, and the original common-ground result remains visible if generation fails or times out.

The prompt, tokens, unvalidated output, and validated example stay only in app/runtime memory. They
are not logged, persisted, exported, copied to the clipboard, shared with the counterpart, or sent
to any server. The feature is absent in the rules-only, web, Expo Go, model-unavailable, and
provider-fallback paths.

You can test the base agent single-handed on one device: open the conversation agent from Settings
and tap "Try with a sample" ("サンプルで試す"). This injects a fixed fictional counterpart card,
with no real person or real contact information. To test the optional AI example, first enable the
trusted on-device model in Settings and wait until activation completes, run the sample bridge, and
tap the AI example button below the common ground and first question.

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
optional on-device AI inference. None of these depend on a server-hosted backend.

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
- [ ] Rules / Model 無効状態で、会話エージェントの共通点と最初の質問が動き、AI 会話例 Section が
      表示されないことを確認する。
- [ ] Settings で信頼済み端末内 Model を明示的に有効化し、Download、Import、Activate を完了する。
- [ ] Local primary Bridge の下にだけ AI 会話例ボタンと Disclosure が表示されることを確認する。
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

### 端末内 LLM と preview entitlement

v1.1.0 で会話エージェントの端末内 LLM を再有効化しました（根拠
[ADR-0043](../adr/0043-grounded-quote-bridge-and-local-llm-reenablement.md)。ADR-0038 が
v1.0 の暫定措置として置いていた Provider の Rules 固定を supersede します）。会話例の限定された
自由生成面は [ADR-0047](../adr/0047-labeled-on-device-conversation-examples.md) を正本とします。

モデルはアプリに同梱せず、利用者が Settings で明示的に有効化したときにだけダウンロードします。
モデルを入れていない端末では従来どおり Rules 方式で動作し、会話例 Section は表示しません。
したがって production（App Store へ提出する Build）にモデルを同梱する必要はありません。

`app.json` の `llama.rn` plugin は `entitlementsProfile: ["preview"]` のみを持ち、production Build
には extended memory entitlement を適用しません。この entitlement を要する実機テストには Apple
Developer Portal 側の capability 有効化と Provisioning Profile の再生成という別の owner 作業が
必要です。

手順と根拠は
[`llama-provider-development-build.md`](../design/llama-provider-development-build.md) の
該当節、[Issue 104 設計文書](../design/2026-07-23-on-device-conversation-agent.md)、
[会話例設計](../design/2026-07-26-conversation-example.md) を正本とします。

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
