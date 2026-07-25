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
未実装の機能（オンデバイス AI 等）はサブタイトルには含めていません。

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
相手の自己紹介ページを取り込むと、確認済みの会話テーマの中から共通点と最初の質問を端末内だけで
見つけます。相手の情報は端末のメモリにだけ保持し、終了すると消えます。サーバーへ送信することは
なく、オフラインでも動作します。モデルのダウンロードやアカウントは不要です。

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
Import the other person's intro page and the app finds shared conversation topics and a first
question from a pre-reviewed theme catalog, entirely on your device. Their info stays only in your
device's memory and is cleared when you exit. Nothing is sent to a server, it works offline, and
no model download or account is needed.

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

日本語版は次のとおりです（約 101 文字の目安）。

```
名刺不要、アカウント不要。QR を見せるだけで、相手は標準カメラで自己紹介ページを開けます。連絡先追加は任意。データはサーバーへ送信されません。相手カードを取り込めば、端末内だけで会話の共通点も見つけられます。
```

English 版は次のとおりです（約 168 文字の目安）。

```
No business card, no account. Show a QR — your intro page opens in their camera app. Contact-add is optional. Zero server data. Find common ground on-device, fully offline.
```

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

(a) On-device conversation agent (optional model download)
The app includes an on-device conversation agent that finds common ground between two intro cards.
By default it runs fully offline with no model download, no account, and no network: it selects a
shared conversation topic and a first question from a fixed, pre-reviewed catalog of theme IDs
shipped inside the app.
A user may optionally enable an on-device language model from Settings, which downloads a model
file to the device. No model is bundled in the binary, the download never starts without an
explicit opt-in, and the model runs entirely on the device with no network calls at inference time.
When enabled, the model may additionally point out an overlap between the two intro-card free-text
descriptions, but it cannot write its own words: it may only return substrings copied verbatim from
those two texts, and the app rejects any quote it cannot find character-for-character in the
corresponding input before anything is displayed. Every displayed sentence comes from a fixed
template owned by the app.
The counterpart's info is held only in device memory and is cleared on exit; nothing is sent to a
server.
You can test this single-handed, on one device, without a second phone or a real QR scan: open the
conversation agent (Settings > "Try the on-device conversation agent") and tap "Try with a sample"
("サンプルで試す"). This injects a fixed sample counterpart card (fictional name, no real person)
so you can see the agent surface a shared conversation theme end to end, on one device, offline and
instantly.

(b) QR intro flow
Create an Intro Card (name is the only required field) from the first screen, then tap to show
its QR code. Scanning it with a second device's stock Camera app (no app install needed) opens
the intro page in that device's browser. If a second camera-equipped device is not available,
note that the QR encodes a plain HTTPS URL (https://card.tenkacloud.com/c#<data>), so any
standard QR reader works. Contact-add inside that page is optional and one tap.

(c) Zero data collection
There is no account, no login, no analytics SDK, and no server that receives user data. The
build's auto-generated iOS Privacy Manifest is expected to declare an empty
NSPrivacyCollectedDataTypes and NSPrivacyTracking as false; this is verified from a real build
prior to submission (see the App Privacy section of this document).

Guideline 4.2 (native functionality beyond a repackaged website): the app provides on-device
storage of the user's own Intro Card, fully offline QR generation from that stored data, and
(optionally) on-device AI inference — none of this depends on network access or a server-hosted
backend.

Guidelines 1.1 / 1.2 (user-generated / AI-generated content): the on-device agent runs entirely on
the device and never sends data off it. It works in two modes. By default it selects among a fixed,
pre-reviewed catalog of conversation-theme IDs shipped inside the app
(see docs/adr/0036-on-device-conversation-agent.md). If the user explicitly opts in and downloads a
local language model from Settings, the model may additionally point out an overlap between the two
intro-card free-text descriptions. Even then the model cannot write its own words: it may only
return substrings copied verbatim from the two texts, and the app rejects and discards any quote it
cannot find character-for-character in the corresponding input before anything is displayed
(see docs/adr/0043-grounded-quote-bridge-and-local-llm-reenablement.md). All displayed sentences
come from fixed templates owned by the app.
It does not generate open-ended free text shown to users, and it never reveals another person's
private data beyond the themes they explicitly chose to include on their own card. Because there is
no open-ended AI-generated text surface today, the app does not yet have a dedicated in-app
report/flag flow; if a future release adds open-ended generation, such a flow would need to be
added at that time.
```

## 8. 年齢レーティング・カテゴリ

### 年齢レーティングの想定回答

暴力表現、性的表現、ギャンブル、ホラー、成人向けテーマ、アルコール・薬物の描写のいずれも
含みません。アプリ内にユーザー生成コンテンツを不特定多数へ公開する経路（フィード、公開
プロフィール、コメント欄等）がなく、アプリ内蔵のブラウザで任意の外部サイトを閲覧させる機能も
ありません（QR から開く自己紹介ページは相手自身の端末のデフォルトブラウザで開きます）。
上記から **4+** を想定します。実際の値は ASC の年齢レーティング質問票へ owner が回答した結果で
確定します（本書はその想定であり、確定回答ではありません）。

### カテゴリ候補

| 優先度 | カテゴリ | 選定理由 |
| --- | --- | --- |
| 主 | 仕事効率化（Productivity） | 名刺代わりに自己紹介情報を保存・提示する実務ツールとしての性格が最も強い。 |
| 副候補 1 | ソーシャルネットワーキング（Social Networking） | 初対面の相手との交流を助ける目的だが、フィードや公開プロフィールなど SNS 的機能は持たない。 |
| 副候補 2 | ユーティリティ（Utilities） | QR 生成・端末内保存という単機能ツールとしての側面。 |

owner の判断で主カテゴリを 1 つ選びます。副カテゴリは ASC が許せば併用します。

## 9. owner 実施手順（チェックリスト）

- [ ] スクリーンショットを取得する。ASC が要求する必須サイズ（申請時点で 6.7 インチクラスの
      iPhone 相当が必須になっていることが多いが、Apple の要件は変わり得るため ASC の
      アップロード画面で実際の必須サイズを確認する）を Simulator または実機で撮る。
- [ ] ASC の該当 App でメタデータ（App 名・サブタイトル・説明文・キーワード・プロモーション
      テキスト・URL 群）を入力する。
- [ ] スクリーンショットをアップロードする。
- [ ] App Privacy（栄養ラベル）を入力する前に、一度 `expo prebuild` または EAS Build を実行して
      生成された `ios/TenkaCloudPassport/PrivacyInfo.xcprivacy` を開き、
      `NSPrivacyCollectedDataTypes` が空配列、`NSPrivacyTracking` が `false` であることを確認する。
      確認できたら本書の「6. App Privacy」の回答で入力する。
- [ ] 年齢レーティング質問票に回答する（本書の想定は 4+ だが、確定は質問票の回答結果による）。
- [ ] `docs/development/ios-testflight-release.md` の手順でタグ push 済みのビルドが TestFlight に
      届いていることを確認し、実機（自分の端末、可能なら友人の端末も）で一通り操作確認する。
- [ ] 上記すべてが揃った状態で Submit for Review する。

### 端末内 LLM と preview entitlement

v1.1.0 で会話エージェントの端末内 LLM を再有効化しました（根拠
[ADR-0043](../adr/0043-grounded-quote-bridge-and-local-llm-reenablement.md)。ADR-0038 が
v1.0 の暫定措置として置いていた Provider の Rules 固定を supersede します）。

モデルはアプリに同梱せず、利用者が Settings で明示的に有効化したときにだけダウンロードします。
モデルを入れていない端末では従来どおり Rules 方式で動作します。したがって production
（App Store へ提出する Build）にモデルを同梱する必要はありません。

`app.json` の `llama.rn` plugin は `entitlementsProfile: ["preview"]` のみを持ち、production Build
には extended memory entitlement を適用しません。この entitlement を要する実機テストには Apple
Developer Portal 側の capability 有効化と Provisioning Profile の再生成という別の owner 作業が
必要です。
手順と根拠は
[`llama-provider-development-build.md`](../design/llama-provider-development-build.md) の
該当節と [Issue 104 設計文書](../design/2026-07-23-on-device-conversation-agent.md) の
「モデルライフサイクル・entitlement・プライバシー・審査戦略」節を正本とします。

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
