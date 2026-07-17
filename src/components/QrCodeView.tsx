import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../ui/theme';
import { buildQrMatrix } from './qr-matrix';

interface QrCodeViewProps {
  readonly payload: string;
  readonly accessibilityLabel: string;
}

const CELL_SIZE = 10;

export default function QrCodeView({
  payload,
  accessibilityLabel,
}: QrCodeViewProps) {
  // HostInviteScreen は残り時間表示のため 1 秒ごとに再 render するが、payload 自体は
  // 変わらないため、256 セル分の hash 計算を毎秒繰り返さないよう payload 単位で
  // memoize する。
  const matrix = useMemo(() => buildQrMatrix(payload), [payload]);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={styles.frame}
    >
      {matrix.map((row, rowIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 固定サイズの Grid であり行の並び替えは発生しない
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((filled, columnIndex) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: 固定サイズの Grid であり Cell の並び替えは発生しない
              key={`cell-${rowIndex}-${columnIndex}`}
              style={[styles.cell, filled ? styles.filled : undefined]}
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
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    backgroundColor: colors.white,
    height: CELL_SIZE,
    width: CELL_SIZE,
  },
  filled: {
    backgroundColor: colors.ink,
  },
});
