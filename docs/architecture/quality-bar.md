# Quality Bar（Definition of Done）

完了は固定手順の消化ではなく、mobile user から観測できる振る舞いが受け入れ条件を満たすことを証拠で示せる状態です。

## Definition of Done

- domain、provider、shared screen、native boundary の責務が一貫している。
- loading、empty、error、success と、変更に関係する keyboard、accessibility、small screen を扱う。
- authentication token、credential、個人情報を insecure storage、log、fixture、screenshot へ残さない。
- Expo Go、Development Build、Web の対応範囲を明示し、unsupported path で silent fallback しない。
- production code に仮実装、暗黙の mock fallback、握りつぶした失敗、不要な重複を残さない。
- 変更に最も近い test、web export、device / simulator preview を実行し、required CI を通す。
- 実 device、store build、external identity provider でしか確認できない条件は、未検証事項と確認方法を明記する。

## Test strategy

- pure domain logic は unit、provider contract は integration、screen interaction は component / screen test、native behavior は device または simulator で検証する。
- external API、time、secure storage、native module は test double で制御してよい。実接続でしか確認できない契約には別の integration path を持つ。
- coverage は blind spot の指標として使い、既存 CI 閾値を満たす。数値だけを上げる assertion を追加しない。
- TDD の順序、テストタイトルの言語、blanket No Mock を一律に要求しない。最も確実で安価な回帰検出を選ぶ。

## Not completion criteria

- `Plan.md`、設計文書、Issue を作ったこと。
- 特定 Skill、review、固定 role の subagent を実行したこと。
- lint、coverage、CI だけが緑で、利用者フローまたは runtime behavior を確認していないこと。

複雑な identity、native、data migration の判断は必要に応じて文書化する。文書作成をすべての変更へ課す ceremony にはしない。
