import { useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { colors } from '../ui/theme';

export interface RealQrViewProps {
  readonly matrix: readonly (readonly boolean[])[];
  readonly size?: number;
}

const QUIET_ZONE_MODULES = 4;
const PREFERRED_RENDER_SIZE = 240;

/**
 * 実 QR（`encodeQr` が返す `EncodedQr.matrix`）を描く純表示コンポーネント。
 * `docs/design/qr-invite-and-ready-flow.md` の「M3 受け入れ基準」節（renderer）に従い、
 * 呼び出し側の指定に関わらず次をこのコンポーネント内で強制する。
 *
 * - 白地固定。ダークモードでも反転しない（誤り訂正の予算を消費する明暗反転を禁止する）。
 * - Quiet zone 4 module。
 * - 通常は 240pt 以上。狭いウィンドウでは親の実測幅まで縮め、QR 全体と
 *   quiet zone が欠けないことを優先する。画面サイズや機種名は参照しない。
 *   密な QR の読取は実際の描画をデコードする回帰テストで確認する。
 *
 * 既存の `QrCodeView`（装飾用のハッシュベース QR）とは別コンポーネントであり、
 * こちらは実際にスキャン可能な QR だけを描く。Accessibility Label は呼び出し側
 * （Screen）が Message Catalog の文言でラップする（props は `matrix` と `size` だけに
 * 保つ）。
 */
export default function RealQrView({ matrix, size }: RealQrViewProps) {
  const modulesPerSide = matrix.length + QUIET_ZONE_MODULES * 2;
  const [availableWidth, setAvailableWidth] = useState(0);
  const preferredSize = Math.max(
    size ?? PREFERRED_RENDER_SIZE,
    modulesPerSide * 2
  );
  const maximumSize = Math.min(preferredSize, availableWidth);
  // Align every module to the physical pixel grid. Fractional cell edges blur
  // dense codes after a narrow resize even when the bounding box fits.
  const density = PixelRatio.get();
  const pixelsPerModule = Math.floor((maximumSize * density) / modulesPerSide);
  const cellSize =
    pixelsPerModule > 0
      ? pixelsPerModule / density
      : maximumSize / modulesPerSide;
  const resolvedSize = cellSize * modulesPerSide;
  const quietZoneSize = cellSize * QUIET_ZONE_MODULES;

  return (
    <View
      style={styles.container}
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
    >
      <View
        accessibilityRole="image"
        style={[
          styles.frame,
          {
            height: resolvedSize,
            padding: quietZoneSize,
            width: resolvedSize,
            marginLeft: PixelRatio.roundToNearestPixel(
              (availableWidth - resolvedSize) / 2
            ),
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
                  flexShrink: 0,
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
  },
  frame: {
    alignSelf: 'flex-start',
    // 白地固定。テーマや OS のダークモード設定を一切参照しない（M3 受け入れ基準）。
    backgroundColor: colors.white,
  },
  row: {
    flexDirection: 'row',
    flexShrink: 0,
  },
});
