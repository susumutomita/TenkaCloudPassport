// Stable public discovery URLs. Each selected payload remains pinned to its immutable commit.
// No lesson data is bundled; new manifest versions do not require an app update.
export const PUBLISHED_CATALOGS = [
  {
    title: 'アルゴリズムの導出',
    version: '2026.10.1301',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-algorithms-manifest.json',
  },
  {
    title: 'CS・数学の基礎',
    version: '2026.10.1301',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-foundations-manifest.json',
  },
  {
    title: 'システム設計',
    version: '2026.10.1301',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-design-manifest.json',
  },
  {
    title: 'アルゴリズム実装・説明',
    version: '2026.10.1301',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-implementation-manifest.json',
  },
  {
    title: '短い練習カード',
    version: '2026.10.1301',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-warmups-manifest.json',
  },
  {
    title: '面接・経験・英語の説明',
    version: '2026.10.1301',
    manifestURL:
      'https://raw.githubusercontent.com/susumutomita/TenkaCloudInterviewCatalog/main/native-interview-manifest.json',
  },
] as const;
