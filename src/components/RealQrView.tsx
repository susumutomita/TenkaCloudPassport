import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../ui/theme';

export interface RealQrViewProps {
  readonly matrix: readonly (readonly boolean[])[];
  readonly size?: number;
}

const QUIET_ZONE_MODULES = 4;
const MIN_RENDER_SIZE = 240;
const MIN_PIXELS_PER_MODULE = 2;

/**
 * 実 QR（`encodeQr` が返す `EncodedQr.matrix`）を描く純表示コンポーネント。
 * `docs/design/qr-invite-and-ready-flow.md` の「M3 受け入れ基準」節（renderer）に従い、
 * 呼び出し側の指定に関わらず次をこのコンポーネント内で強制する。
 *
 * - 白地固定。ダークモードでも反転しない（誤り訂正の予算を消費する明暗反転を禁止する）。
 * - Quiet zone 4 module。
 * - 最小レンダリングサイズ 240px、かつ 1 module あたり物理 2px 以上。
 *   （誤り訂正 M・schema v2 Lounge Invite の最大 Version 26 = 121 module の場合、
 *   quiet zone を含む 129 module × 2px = 258px 四方が必要になる。）
 *
 * 既存の `QrCodeView`（装飾用のハッシュベース QR）とは別コンポーネントであり、
 * こちらは実際にスキャン可能な QR だけを描く。Accessibility Label は呼び出し側
 * （Screen）が Message Catalog の文言でラップする（props は `matrix` と `size` だけに
 * 保つ）。
 */
export default function RealQrView({ matrix, size }: RealQrViewProps) {
  const modulesPerSide = matrix.length + QUIET_ZONE_MODULES * 2;
  const resolvedSize = useMemo(
    () =>
      Math.max(
        size ?? MIN_RENDER_SIZE,
        MIN_RENDER_SIZE,
        modulesPerSide * MIN_PIXELS_PER_MODULE
      ),
    [size, modulesPerSide]
  );
  const cellSize = resolvedSize / modulesPerSide;
  const quietZoneSize = cellSize * QUIET_ZONE_MODULES;

  return (
    <View
      accessibilityRole="image"
      style={[
        styles.frame,
        {
          height: resolvedSize,
          padding: quietZoneSize,
          width: resolvedSize,
        },
      ]}
    >
      {matrix.map((row, rowIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 固定サイズの Grid であり行の並び替えは発生しない
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((filled, columnIndex) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: 固定サイズの Grid であり Cell の並び替えは発生しない
              key={`cell-${rowIndex}-${columnIndex}`}
              style={{
                backgroundColor: filled ? colors.ink : colors.white,
                height: cellSize,
                width: cellSize,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    // 白地固定。テーマや OS のダークモード設定を一切参照しない（M3 受け入れ基準）。
    backgroundColor: colors.white,
  },
  row: {
    flexDirection: 'row',
  },
});
