/**
 * Issue 110: クラウド基礎クイズの版管理済み同梱カタログ。`src/domain/clue-catalog.ts` と同じ
 * 「`Record` を `as const` でキー付けし `keyof typeof` から ID の型を導出する」流儀を踏襲する。
 * TenkaCloudChallenge 等の外部サービスへの通信・依存は持たない（設計文書
 * `docs/design/2026-07-23-cloud-basics-quiz.md` の「A: 同梱のみ」を採用、ADR-0034）。
 *
 * `bitIndex` は 0 起点・append-only の不変条件を持つ。既存設問の `bitIndex` を変更・再利用
 * すると、進捗を載せた過去の QR（`src/protocol/intro-card-url.ts` の `q`）の意味がずれてしまう
 * ため、将来設問を足す場合は必ず次の空き番号（現在は 16）から採番すること。
 * `quiz-catalog.test.ts` がこの一意性・連続性を機械的に固定する。
 */
export const QUIZ_CATALOG_VERSION = '2026-07-23';

export type QuizCategory =
  | 'iam'
  | 'network'
  | 'storage'
  | 'compute'
  | 'observability';

export interface LocalizedText {
  readonly ja: string;
  readonly en: string;
}

type QuizChoices = readonly [
  LocalizedText,
  LocalizedText,
  LocalizedText,
  LocalizedText,
];

interface QuizQuestionDefinition {
  readonly bitIndex: number;
  readonly category: QuizCategory;
  readonly prompt: LocalizedText;
  readonly choices: QuizChoices;
  readonly correctIndex: 0 | 1 | 2 | 3;
  readonly explanation: LocalizedText;
}

/**
 * 16 問、AWS クラウド基礎（IAM / ネットワーク / ストレージ / コンピュート / 可観測性の
 * 5 カテゴリ）。事実の正確性を最優先し、AWS 公式ドキュメントで確認できる内容だけを出題する
 * （誤答を正解にしない、曖昧な設問を作らない）。各設問は日英で prompt・choices・explanation を
 * 持つ。`as const satisfies Record<...>` により、`as const` のリテラル精度（`choices` が正確に
 * 4 要素のタプルであること、`correctIndex` が固有のリテラルであること）を保ったまま、
 * `QuizQuestionDefinition` の構造を型チェック時に強制する。
 */
export const QUIZ_CATALOG = {
  'iam-explicit-deny': {
    bitIndex: 0,
    category: 'iam',
    prompt: {
      ja: 'IAM ポリシーの評価で、明示的な Deny と Allow が競合した場合どちらが優先されるか。',
      en: 'In IAM policy evaluation, when an explicit Deny conflicts with an Allow, which wins?',
    },
    choices: [
      {
        ja: 'Allow が常に優先される',
        en: 'Allow always wins',
      },
      {
        ja: '明示的な Deny が常に優先される',
        en: 'An explicit Deny always wins',
      },
      {
        ja: '後から評価されたほうが優先される',
        en: 'Whichever is evaluated last wins',
      },
      {
        ja: 'リソースベースポリシーが常に優先される',
        en: 'Resource-based policies always win',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'AWS の権限評価では、いずれかのポリシーに明示的な Deny が 1 つでもあれば、他に Allow があってもそれが最優先され拒否される。',
      en: 'AWS evaluates an explicit Deny in any policy as taking precedence over any Allow, regardless of where the Allow comes from.',
    },
  },
  'vpc-public-subnet': {
    bitIndex: 1,
    category: 'network',
    prompt: {
      ja: 'パブリックサブネットの一般的な条件として正しいものはどれか。',
      en: 'What is the standard defining condition of a public subnet?',
    },
    choices: [
      {
        ja: 'NAT ゲートウェイ経由でのみ外部通信できる',
        en: 'It can only reach the internet through a NAT gateway',
      },
      {
        ja: 'インターネットゲートウェイへの経路を持つルートテーブルに関連付けられている',
        en: 'It is associated with a route table that has a route to an internet gateway',
      },
      {
        ja: 'セキュリティグループが存在しない',
        en: 'It has no security groups attached',
      },
      {
        ja: 'プライベート IP アドレスしか割り当てられない',
        en: 'It can only be assigned private IP addresses',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'パブリックサブネットとは、0.0.0.0/0 宛のトラフィックをインターネットゲートウェイ（IGW）へ向けるルートを持つサブネットのことを指す。',
      en: 'A public subnet is a subnet associated with a route table that routes 0.0.0.0/0 traffic to an internet gateway (IGW).',
    },
  },
  's3-consistency': {
    bitIndex: 2,
    category: 'storage',
    prompt: {
      ja: 'Amazon S3 の整合性モデルについて正しい記述はどれか。',
      en: 'Which statement about Amazon S3 consistency is correct?',
    },
    choices: [
      {
        ja: '更新には結果整合性しかなく、しばらく古いデータが返ることがある',
        en: 'Updates are only eventually consistent, so stale data may be returned for a while',
      },
      {
        ja: 'PUT/DELETE を含むすべての操作について強い整合性（strong consistency）を持つ',
        en: 'All operations, including PUT/DELETE, provide strong read-after-write consistency',
      },
      {
        ja: '整合性はリージョンごとに設定できる',
        en: 'Consistency behavior can be configured per region',
      },
      {
        ja: '整合性はバケットポリシーで変更できる',
        en: 'Consistency behavior can be changed via bucket policy',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'S3 は 2020 年 12 月以降、新規・上書き・削除を含むすべての操作について強い整合性を追加費用なしで提供する。',
      en: 'Since December 2020, S3 provides strong read-after-write consistency automatically for all operations (new objects, overwrites, and deletes) at no extra cost.',
    },
  },
  'lambda-basics': {
    bitIndex: 3,
    category: 'compute',
    prompt: {
      ja: 'AWS Lambda の説明として正しいものはどれか。',
      en: 'Which statement correctly describes AWS Lambda?',
    },
    choices: [
      {
        ja: '常時起動する仮想サーバーで、稼働時間に対してのみ課金される',
        en: 'An always-on virtual server billed only for uptime',
      },
      {
        ja: 'サーバー管理不要でイベント駆動型に実行され、呼び出しと実行時間に応じて課金される',
        en: 'A serverless, event-driven compute service billed by invocations and execution time',
      },
      {
        ja: 'EC2 インスタンスを事前に起動しなければ実行できない',
        en: 'It requires a pre-running EC2 instance to execute',
      },
      {
        ja: 'コンテナオーケストレーションのため常に EKS クラスタが必須である',
        en: 'It always requires an EKS cluster for container orchestration',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'Lambda はサーバーの管理が不要なイベント駆動型のコンピューティングサービスで、実行時間や呼び出し回数に応じて課金される。',
      en: 'Lambda is a serverless, event-driven compute service; you are billed based on invocations and execution duration, with no servers to manage.',
    },
  },
  'cloudwatch-role': {
    bitIndex: 4,
    category: 'observability',
    prompt: {
      ja: 'Amazon CloudWatch の役割として最も適切なものはどれか。',
      en: 'What is the primary role of Amazon CloudWatch?',
    },
    choices: [
      {
        ja: 'AWS リソースやアプリケーションのメトリクス・ログを収集し、監視やアラームを設定するサービスである',
        en: 'A service that collects metrics and logs from AWS resources and applications, and lets you configure monitoring and alarms',
      },
      {
        ja: 'IAM ユーザーの認証情報を管理するサービスである',
        en: 'A service for managing IAM user credentials',
      },
      {
        ja: 'VPC 間のプライベート接続を確立するサービスである',
        en: 'A service for establishing private connections between VPCs',
      },
      {
        ja: 'コンテナイメージを保存するレジストリサービスである',
        en: 'A registry service for storing container images',
      },
    ],
    correctIndex: 0,
    explanation: {
      ja: 'CloudWatch は AWS リソースとアプリケーションのメトリクス・ログを収集し、ダッシュボードやアラームで監視するためのサービスである。',
      en: 'CloudWatch collects metrics and logs from AWS resources and applications so you can monitor them via dashboards and alarms.',
    },
  },
  'iam-role-purpose': {
    bitIndex: 5,
    category: 'iam',
    prompt: {
      ja: 'IAM ロールの主な用途として正しいものはどれか。',
      en: 'What is the primary purpose of an IAM role?',
    },
    choices: [
      {
        ja: '恒久的なアクセスキーを人間のユーザーに割り当てるための仕組みである',
        en: 'A mechanism to assign permanent access keys to human users',
      },
      {
        ja: '一時的な認証情報を発行し、EC2 インスタンスや Lambda 関数、他アカウントなどに権限を委任する仕組みである',
        en: 'A mechanism that issues temporary credentials to delegate permissions to EC2 instances, Lambda functions, other accounts, and more',
      },
      {
        ja: 'パスワードポリシーを管理する仕組みである',
        en: 'A mechanism for managing password policies',
      },
      {
        ja: 'MFA デバイスを登録するための仕組みである',
        en: 'A mechanism for registering MFA devices',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'IAM ロールは AWS STS を通じて一時的な認証情報を発行し、EC2/Lambda 等の AWS サービスや他アカウント、フェデレーションユーザーへ権限を委任するために使う。',
      en: 'IAM roles issue temporary credentials via AWS STS to delegate permissions to AWS services (EC2, Lambda, etc.), other accounts, or federated users.',
    },
  },
  'security-group-stateful': {
    bitIndex: 6,
    category: 'network',
    prompt: {
      ja: 'セキュリティグループの特徴として正しいものはどれか。',
      en: 'Which statement about security groups is correct?',
    },
    choices: [
      {
        ja: 'ステートフルであり、インバウンドを許可すると対応する戻りのアウトバウンドは自動的に許可される',
        en: 'They are stateful, so allowing inbound traffic automatically allows the matching return outbound traffic',
      },
      {
        ja: 'ステートレスであり、インバウンドとアウトバウンドを個別に許可する必要がある',
        en: 'They are stateless, so inbound and outbound must be allowed separately',
      },
      {
        ja: '明示的な Deny ルールを設定できる',
        en: 'They support explicit Deny rules',
      },
      {
        ja: 'サブネット単位にのみ適用され、インスタンス単位には適用できない',
        en: 'They apply only at the subnet level, never to individual instances',
      },
    ],
    correctIndex: 0,
    explanation: {
      ja: 'セキュリティグループはステートフルなので、インバウンドを許可すればその戻りのアウトバウンド通信は自動的に許可される（Deny ルールを持てず、ステートレスで戻り通信も明示的に許可が要るのはネットワーク ACL の特徴）。',
      en: 'Security groups are stateful: allowing inbound traffic automatically allows the corresponding return outbound traffic. (Explicit Deny rules and statelessness are characteristics of network ACLs, not security groups.)',
    },
  },
  'ebs-basics': {
    bitIndex: 7,
    category: 'storage',
    prompt: {
      ja: 'Amazon EBS ボリュームの特徴として正しいものはどれか。',
      en: 'Which statement about Amazon EBS volumes is correct?',
    },
    choices: [
      {
        ja: '複数のアベイラビリティーゾーン（AZ）にまたがって自動的に複製される',
        en: 'It is automatically replicated across multiple Availability Zones',
      },
      {
        ja: '特定の AZ 内でのみ EC2 インスタンスにアタッチできるブロックストレージである',
        en: 'It is block storage that can only be attached to EC2 instances within the same Availability Zone',
      },
      {
        ja: 'オブジェクトストレージであり REST API 経由でのみアクセスできる',
        en: 'It is object storage accessible only via a REST API',
      },
      {
        ja: 'インスタンスストアと同様、インスタンス終了時に必ずデータが失われる',
        en: 'Like instance store, its data is always lost when the instance terminates',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'EBS は特定の AZ 内に存在するブロックストレージで、同じ AZ 内の EC2 インスタンスにだけアタッチできる（AZ をまたぐ複製は行われない）。',
      en: 'EBS volumes live within a single Availability Zone and can only be attached to EC2 instances in that same AZ; they are not automatically replicated across AZs.',
    },
  },
  'auto-scaling-purpose': {
    bitIndex: 8,
    category: 'compute',
    prompt: {
      ja: 'Auto Scaling グループの目的として最も適切なものはどれか。',
      en: 'What is the primary purpose of an Auto Scaling group?',
    },
    choices: [
      {
        ja: '需要に応じて EC2 インスタンス数を自動的に増減させ、可用性とコスト効率を両立させる',
        en: 'Automatically increase or decrease the number of EC2 instances based on demand, balancing availability and cost',
      },
      {
        ja: 'S3 バケットのストレージクラスを自動的に変更する',
        en: 'Automatically change an S3 bucket storage class',
      },
      {
        ja: 'IAM ポリシーを自動生成する',
        en: 'Automatically generate IAM policies',
      },
      {
        ja: 'RDS のバックアップを自動作成する',
        en: 'Automatically create RDS backups',
      },
    ],
    correctIndex: 0,
    explanation: {
      ja: 'Auto Scaling グループは、需要（負荷）の変化に応じて EC2 インスタンス数を自動的に増減し、可用性とコスト効率を両立させる仕組みである。',
      en: 'An Auto Scaling group automatically adds or removes EC2 instances in response to demand, helping balance availability with cost efficiency.',
    },
  },
  'cloudtrail-role': {
    bitIndex: 9,
    category: 'observability',
    prompt: {
      ja: 'AWS CloudTrail の主な役割として正しいものはどれか。',
      en: 'What is the primary role of AWS CloudTrail?',
    },
    choices: [
      {
        ja: 'アプリケーションのパフォーマンスメトリクスを可視化する',
        en: 'Visualizing application performance metrics',
      },
      {
        ja: 'AWS アカウント内で行われた API 呼び出し（誰が、いつ、何をしたか）を記録する監査ログサービスである',
        en: 'An audit-log service that records API calls made within an AWS account (who did what, and when)',
      },
      {
        ja: 'コンテナのログを集約するサービスである',
        en: 'A service for aggregating container logs',
      },
      {
        ja: 'DNS クエリを解決するサービスである',
        en: 'A service for resolving DNS queries',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'CloudTrail は AWS アカウント内の API 呼び出し履歴（誰が、いつ、何を行ったか）を記録する監査ログサービスである。',
      en: 'CloudTrail records a history of API calls made in an AWS account, capturing who made the call, when, and what action was taken.',
    },
  },
  'root-user-best-practice': {
    bitIndex: 10,
    category: 'iam',
    prompt: {
      ja: 'AWS アカウントのルートユーザーに関するベストプラクティスとして正しいものはどれか。',
      en: 'Which is a recommended best practice for the AWS account root user?',
    },
    choices: [
      {
        ja: '日常的な作業にルートユーザーを使い、IAM ユーザーは作成しない',
        en: 'Use the root user for everyday tasks and avoid creating IAM users',
      },
      {
        ja: 'ルートユーザーには MFA を設定し、日常業務には使わず IAM ユーザーやロールを利用する',
        en: 'Enable MFA on the root user, avoid using it for daily work, and use IAM users or roles instead',
      },
      {
        ja: 'ルートユーザーのアクセスキーを常時発行してアプリケーションに埋め込む',
        en: 'Keep root user access keys permanently issued and embedded in applications',
      },
      {
        ja: 'ルートユーザーのパスワードは共有して複数人で使う',
        en: 'Share the root user password among multiple people',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'ルートユーザーには MFA を設定した上で日常業務には使わず、代わりに権限を絞った IAM ユーザーやロールを使うことが AWS の標準的なベストプラクティスである。',
      en: 'AWS best practice is to enable MFA on the root user, avoid using it for routine tasks, and rely on scoped-down IAM users or roles instead.',
    },
  },
  'vpc-basics': {
    bitIndex: 11,
    category: 'network',
    prompt: {
      ja: 'Amazon VPC の説明として正しいものはどれか。',
      en: 'Which statement correctly describes Amazon VPC?',
    },
    choices: [
      {
        ja: 'AWS アカウント内に論理的に分離された仮想ネットワークを構築するサービスである',
        en: 'A service for provisioning a logically isolated virtual network within an AWS account',
      },
      {
        ja: 'オンプレミスでのみ利用できるネットワーク仮想化技術である',
        en: 'A network virtualization technology usable only on-premises',
      },
      {
        ja: '複数の AWS アカウントを跨いで自動的に 1 つのネットワークへ統合するサービスである',
        en: 'A service that automatically merges multiple AWS accounts into a single network',
      },
      {
        ja: 'DNS 名前解決専用のサービスである',
        en: 'A service dedicated solely to DNS name resolution',
      },
    ],
    correctIndex: 0,
    explanation: {
      ja: 'VPC（Virtual Private Cloud）は、AWS アカウント内に論理的に分離された仮想ネットワークを自分で定義・構築できるサービスである。',
      en: 'Amazon VPC lets you provision a logically isolated virtual network that you define within your AWS account.',
    },
  },
  's3-glacier-retrieval': {
    bitIndex: 12,
    category: 'storage',
    prompt: {
      ja: '取り出し（読み出し）までに数分から数時間程度の待ち時間が生じることがあるアーカイブ向けの S3 ストレージクラスはどれか。',
      en: 'Which S3 storage class is designed for archives and can involve a retrieval wait time ranging from minutes to hours?',
    },
    choices: [
      {
        ja: 'S3 Standard',
        en: 'S3 Standard',
      },
      {
        ja: 'S3 Intelligent-Tiering',
        en: 'S3 Intelligent-Tiering',
      },
      {
        ja: 'S3 Glacier Flexible Retrieval',
        en: 'S3 Glacier Flexible Retrieval',
      },
      {
        ja: 'S3 Standard-IA',
        en: 'S3 Standard-IA',
      },
    ],
    correctIndex: 2,
    explanation: {
      ja: 'S3 Glacier Flexible Retrieval はアーカイブ向けのストレージクラスで、取り出しオプションに応じて数分（迅速）から数時間（標準・大容量）の待ち時間が生じる。S3 Standard / Standard-IA はミリ秒単位で即時アクセスできる。',
      en: 'S3 Glacier Flexible Retrieval is built for archival data, with retrieval times ranging from minutes (Expedited) to hours (Standard/Bulk) depending on the option chosen. S3 Standard and Standard-IA both offer millisecond, immediate access.',
    },
  },
  'fargate-basics': {
    bitIndex: 13,
    category: 'compute',
    prompt: {
      ja: 'Amazon ECS/EKS の Fargate 起動タイプの特徴として正しいものはどれか。',
      en: 'Which statement correctly describes the Fargate launch type for ECS/EKS?',
    },
    choices: [
      {
        ja: 'コンテナを動かす EC2 インスタンスをユーザー自身がプロビジョニング・管理する必要がある',
        en: 'You must provision and manage the underlying EC2 instances yourself',
      },
      {
        ja: 'サーバーやクラスタのインスタンスを管理せずにコンテナを実行できるサーバーレスのコンピューティングエンジンである',
        en: 'A serverless compute engine that runs containers without managing servers or cluster instances',
      },
      {
        ja: 'Lambda 関数のみを実行するためのランタイムである',
        en: 'A runtime dedicated solely to executing Lambda functions',
      },
      {
        ja: 'オンプレミス環境でしか利用できない',
        en: 'It can only be used in on-premises environments',
      },
    ],
    correctIndex: 1,
    explanation: {
      ja: 'Fargate は、コンテナを動かすための EC2 インスタンスやクラスタを自分で管理する必要がないサーバーレスのコンピューティングエンジンで、ECS でも EKS でも使える。',
      en: 'Fargate is a serverless compute engine for containers: you never provision or manage the underlying EC2 instances or clusters, and it works with both ECS and EKS.',
    },
  },
  'cloudwatch-alarm': {
    bitIndex: 14,
    category: 'observability',
    prompt: {
      ja: 'Amazon CloudWatch Alarm の一般的な使い方として正しいものはどれか。',
      en: 'What is a typical use of a CloudWatch Alarm?',
    },
    choices: [
      {
        ja: 'メトリクスが指定したしきい値を一定期間超えた場合に通知やアクションを実行できる',
        en: 'It can trigger a notification or action when a metric crosses a defined threshold for a set period',
      },
      {
        ja: 'IAM ロールの権限を自動的に変更する',
        en: 'It automatically changes IAM role permissions',
      },
      {
        ja: 'S3 バケットのライフサイクルルールを設定する',
        en: 'It configures S3 bucket lifecycle rules',
      },
      {
        ja: 'VPC のルートテーブルを自動作成する',
        en: 'It automatically creates VPC route tables',
      },
    ],
    correctIndex: 0,
    explanation: {
      ja: 'CloudWatch Alarm は、指定したメトリクスがしきい値を一定期間超過（または下回る）したときに、通知（SNS 等）やオートスケーリングなどのアクションを実行させる仕組みである。',
      en: 'A CloudWatch Alarm watches a metric and, when it breaches a defined threshold over a set period, can trigger a notification (e.g. via SNS) or an action such as Auto Scaling.',
    },
  },
  'xray-basics': {
    bitIndex: 15,
    category: 'observability',
    prompt: {
      ja: 'AWS X-Ray の主な用途として正しいものはどれか。',
      en: 'What is the primary use case for AWS X-Ray?',
    },
    choices: [
      {
        ja: 'マイクロサービス間のリクエストをトレースし、レイテンシーやエラーの原因箇所を分析するサービスである',
        en: 'A service for tracing requests across microservices to analyze latency and pinpoint error sources',
      },
      {
        ja: 'DNS クエリのルーティングを行うサービスである',
        en: 'A service for routing DNS queries',
      },
      {
        ja: 'コンテナイメージの脆弱性スキャンを行うサービスである',
        en: 'A service for scanning container images for vulnerabilities',
      },
      {
        ja: 'IAM ポリシーの構文をチェックするサービスである',
        en: 'A service for checking IAM policy syntax',
      },
    ],
    correctIndex: 0,
    explanation: {
      ja: 'X-Ray は分散システム（マイクロサービス）間を流れるリクエストをトレースし、レイテンシーのボトルネックやエラーの発生箇所を分析するための分散トレーシングサービスである。',
      en: 'X-Ray is a distributed tracing service that follows requests as they travel across microservices, helping you analyze latency bottlenecks and pinpoint where errors occur.',
    },
  },
} as const satisfies Record<string, QuizQuestionDefinition>;

export type QuizQuestionId = keyof typeof QUIZ_CATALOG;

export interface QuizQuestion extends QuizQuestionDefinition {
  readonly id: QuizQuestionId;
}

/** カタログ登録順（= bitIndex 昇順）の ID 一覧。 */
export const QUIZ_QUESTION_IDS = Object.keys(QUIZ_CATALOG) as QuizQuestionId[];

/** 現在のカタログの設問数。ビューア（`site/c/index.html`）側の drift 検出用に export する。 */
export const QUIZ_QUESTION_COUNT = QUIZ_QUESTION_IDS.length;

export function isQuizQuestionId(value: string): value is QuizQuestionId {
  return Object.hasOwn(QUIZ_CATALOG, value);
}

export function quizQuestionById(id: QuizQuestionId): QuizQuestion {
  return { id, ...QUIZ_CATALOG[id] };
}

/** カタログ登録順（= bitIndex 昇順）ですべての設問を返す。 */
export function allQuizQuestions(): readonly QuizQuestion[] {
  return QUIZ_QUESTION_IDS.map(quizQuestionById);
}
