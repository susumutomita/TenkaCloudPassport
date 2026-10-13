// Stable public discovery URLs. Each selected payload remains pinned to its immutable commit.
// No lesson data is bundled; new manifest versions do not require an app update.
export const PUBLISHED_CATALOGS = [
  {
    catalogID: 'interviewlab.algorithms.derivation',
    title: '典型アルゴリズムの考え方',
    description:
      '総当たりから改善し、不変条件・計算量・類題への使い方を考える。',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-algorithms-manifest.json',
  },
  {
    catalogID: 'interviewlab.cs-math',
    title: 'CS・数学の基礎',
    description: '計算量、論理、確率、並行処理を基礎から理解する。',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-foundations-manifest.json',
  },
  {
    catalogID: 'interviewlab.system-design',
    title: 'システム設計',
    description: '要件から設計を組み立て、競合・障害・トレードオフを説明する。',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-design-manifest.json',
  },
  {
    catalogID: 'interviewlab.algorithms.implementation',
    title: '典型アルゴリズムの実装',
    description: '理解した型を実装し、境界条件と反例を確かめる。',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-implementation-manifest.json',
  },
  {
    catalogID: 'interviewlab.warmups',
    title: '短い復習問題',
    description: '小さな例を手で動かし、典型パターンの理解を確かめる。',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-warmups-manifest.json',
  },
  {
    catalogID: 'interviewlab.interview-practice',
    title: '考え方・経験を説明する',
    description: '判断の根拠や経験を、自分の言葉で説明する。',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-interview-manifest.json',
  },
] as const;
