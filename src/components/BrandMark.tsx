import { memo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../ui/theme';

interface BrandMarkProps {
  readonly size?: number;
  readonly color?: string;
}

/**
 * TenkaCloud ブランドの山頂マーク（bar + peak）。ビジュアルの正本は
 * claude.ai/design「TenkaCloud Passport Redesign.dc.html」のパス定数
 * （`docs/design/2026-07-20-ink-summit-redesign.md`）。文言を持たない
 * 純表示コンポーネントで、ロックアップの文字列は利用側（AppScreen）が持つ。
 *
 * AppScreen 経由で全画面に置かれ、lounge がアクティブな間は毎秒 re-render される
 * 親の下で描画されるため、size / color のプリミティブ props で memo 化して
 * 静的な SVG ツリーの再構築を避ける。
 */
function BrandMark({ size = 20, color = colors.ink }: BrandMarkProps) {
  return (
    <Svg accessible={false} height={size} viewBox="0 0 120 120" width={size}>
      <Rect x={26} y={24} width={68} height={12} rx={6} fill={color} />
      <Path
        d="M26 90 L60 48 L94 90"
        fill="none"
        stroke={color}
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default memo(BrandMark);
