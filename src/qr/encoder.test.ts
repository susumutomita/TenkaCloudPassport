import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import jsQR, { type QRCode } from 'jsqr';
import { createLoungeInvite } from '../domain/lounge-invite';
import { encodeQrPayload, QR_PAYLOAD_MAX_BYTES } from '../protocol/qr-payload';
import { encodeQr, QR_ENCODER_MAX_BYTES, QrEncodingError } from './encoder';

function rows(matrix: readonly (readonly boolean[])[]): string[] {
  return matrix.map((row) => row.map((cell) => (cell ? '1' : '0')).join(''));
}

const QUIET_ZONE_MODULES = 4;
const PIXELS_PER_MODULE = 4;

interface RasterizedQr {
  readonly pixels: Uint8ClampedArray;
  readonly widthInPixels: number;
}

function rasterize(matrix: readonly (readonly boolean[])[]): RasterizedQr {
  const widthInModules = matrix.length + QUIET_ZONE_MODULES * 2;
  const widthInPixels = widthInModules * PIXELS_PER_MODULE;
  const pixels = new Uint8ClampedArray(widthInPixels * widthInPixels * 4);
  for (let y = 0; y < widthInPixels; y += 1) {
    for (let x = 0; x < widthInPixels; x += 1) {
      const row = Math.floor(y / PIXELS_PER_MODULE) - QUIET_ZONE_MODULES;
      const column = Math.floor(x / PIXELS_PER_MODULE) - QUIET_ZONE_MODULES;
      const luminance = matrix[row]?.[column] === true ? 0 : 255;
      const offset = (y * widthInPixels + x) * 4;
      pixels[offset] = luminance;
      pixels[offset + 1] = luminance;
      pixels[offset + 2] = luminance;
      pixels[offset + 3] = 255;
    }
  }
  return { pixels, widthInPixels };
}

function decodeWithJsQr(
  matrix: readonly (readonly boolean[])[]
): QRCode | null {
  const { pixels, widthInPixels } = rasterize(matrix);
  return jsQR(pixels, widthInPixels, widthInPixels);
}

function utf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function captureError(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error: unknown) {
    return error;
  }
}

function expectDataTooLarge(captured: unknown): void {
  expect(captured).toBeInstanceOf(QrEncodingError);
  if (captured instanceof QrEncodingError) {
    expect(captured.code).toBe('DATA_TOO_LARGE');
  }
}

describe('QR Code Model 2 byte mode encoder', () => {
  it('既知入力 HELLO WORLD を Version 1・誤り訂正 L の既知 matrix にする', () => {
    // ADR-0032 で誤り訂正 M → L へ切替。期待 matrix は本プロジェクトの
    // devDependency ではない第三者 QR エンコーダ実装（`toqr`、format info の
    // EC level indicator 込みで BCH を計算する実装）を一時スクリプトで実行し、
    // 独立に生成した Version 1・EC-L の "HELLO WORLD" と bit 単位で一致することを
    // 確認済み（同じ手順で旧 EC-M の matrix も一致し、比較手法自体の妥当性を
    // 検証している）。
    const qr = encodeQr('HELLO WORLD');

    expect(qr.version).toBe(1);
    expect(qr.errorCorrection).toBe('L');
    expect(rows(qr.matrix)).toEqual([
      '111111101011101111111',
      '100000100011001000001',
      '101110101101001011101',
      '101110101100101011101',
      '101110101001001011101',
      '100000100111101000001',
      '111111101010101111111',
      '000000000001100000000',
      '111100101111110011101',
      '010111010011111101100',
      '111100101001010100011',
      '111111010001000101010',
      '111000110100110000101',
      '000000001101001100101',
      '111111100011111110000',
      '100000100000010101111',
      '101110100010101001000',
      '101110101010001001110',
      '101110101110100100100',
      '100000101101011110001',
      '111111101001010100000',
    ]);
  });

  it('日本語 UTF-8 入力も同じ入力なら同じ matrix を返す', () => {
    expect(encodeQr('招待 QR')).toEqual(encodeQr('招待 QR'));
  });

  it('入力 byte 数に必要な最小 Version を選ぶ', () => {
    // Version 1・誤り訂正 L の容量は 17 byte（RS_BLOCKS_L[0] = [1, 26, 19] →
    // floor((19 * 8 - 4 - 8) / 8) = floor(17.5) = 17）。18 byte からは Version 2 が
    // 必要になる。
    expect(encodeQr('a'.repeat(17)).version).toBe(1);
    expect(encodeQr('a'.repeat(18)).version).toBe(2);
    expect(encodeQr('a'.repeat(QR_ENCODER_MAX_BYTES)).version).toBe(26);
  });

  it('encoder の上限は QR wire format の上限と一致する', () => {
    // QR_PAYLOAD_MAX_BYTES は QR_ENCODER_MAX_BYTES を re-export した恒真値になった
    // （Issue 73 #2、正本は qr/encoder.ts）。この assert は今後常に真になるが、
    // 正本が逆転して二重リテラルへ戻る変更が入ったときに検知する tripwire として残す。
    expect(QR_ENCODER_MAX_BYTES).toBe(QR_PAYLOAD_MAX_BYTES);
  });

  it('QR_ENCODER_MAX_BYTES を超える入力を型付き Error にする', () => {
    expectDataTooLarge(
      captureError(() => encodeQr('a'.repeat(QR_ENCODER_MAX_BYTES + 1)))
    );
  });

  it('文字数は上限以下でも UTF-8 byte 数が QR_ENCODER_MAX_BYTES を超える多バイト入力を型付き Error にする', () => {
    // 'あ' は UTF-8 で 3 byte。文字数（UTF-16 code unit 数）は上限以下のまま
    // byte 数だけが 1 byte 超過するよう、最小限の文字数を逆算する。
    const charCount = Math.ceil((QR_ENCODER_MAX_BYTES + 1) / 3);
    const input = 'あ'.repeat(charCount);

    expect(input.length).toBeLessThanOrEqual(QR_ENCODER_MAX_BYTES);
    expectDataTooLarge(captureError(() => encodeQr(input)));
  });

  it('孤立サロゲートは TextEncoder が U+FFFD へ正規化するため置換文字と同じ matrix になる', () => {
    expect(encodeQr('\ud800')).toEqual(encodeQr('�'));
  });
});

describe('jsQR による round-trip 検証', () => {
  it('ASCII 入力 HELLO WORLD を Version 1 で encode し jsQR が同じ文字列に実デコードする', () => {
    const input = 'HELLO WORLD';

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(qr.version).toBe(1);
    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(input));
    expect(decoded?.data).toBe(input);
  });

  it('日本語 UTF-8 入力を encode し jsQR が同じ UTF-8 byte 列に実デコードする', () => {
    const input = '天下クラウドパスポート QR 招待';

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(input));
  });

  it('QR_ENCODER_MAX_BYTES 境界の入力を Version 26 で encode し jsQR が同じ byte 列に実デコードする', () => {
    // ADR-0032: 旧 EC-M・1,024 byte が選んでいた最密 Version 26（121 module）を、
    // 誤り訂正 L 化後も新上限 QR_ENCODER_MAX_BYTES（1,367 byte）ちょうどで維持する
    // ことを固定する（密度不変の直接的な回帰ガード）。
    const input = 'a'.repeat(QR_ENCODER_MAX_BYTES);

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(qr.version).toBe(26);
    expect(qr.matrix.length).toBe(26 * 4 + 17);
    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(input));
    expect(decoded?.data).toBe(input);
  });

  it('絵文字を含むサロゲートペア入力を encode し jsQR が同じ UTF-8 byte 列に実デコードする', () => {
    const input = '招待🎌';

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(input));
  });

  it('文字数指示子が 8 bit から 16 bit に切り替わる 230 / 231 byte 境界を実デコードできる', () => {
    // 誤り訂正 L では Version 9 の容量が 230 byte（旧 EC-M は 180 byte）に伸びるため、
    // 8 bit ↔ 16 bit の切り替わり境界も 230 / 231 byte へ移動する。
    const beforeInput = 'a'.repeat(230);
    const afterInput = 'a'.repeat(231);

    const beforeBoundary = encodeQr(beforeInput);
    const afterBoundary = encodeQr(afterInput);

    expect(beforeBoundary.version).toBe(9);
    expect(afterBoundary.version).toBe(10);
    expect(decodeWithJsQr(beforeBoundary.matrix)?.binaryData).toEqual(
      utf8Bytes(beforeInput)
    );
    expect(decodeWithJsQr(afterBoundary.matrix)?.binaryData).toEqual(
      utf8Bytes(afterInput)
    );
  });

  it('version 情報ブロックが初めて現れる 134 / 135 byte 境界を実デコードできる', () => {
    // 誤り訂正 L では Version 6 の容量が 134 byte（旧 EC-M は 106 byte）に伸びるため、
    // Version 7 から追加される version 情報ブロックの初出境界も 134 / 135 byte へ
    // 移動する。
    const beforeInput = 'a'.repeat(134);
    const afterInput = 'a'.repeat(135);

    const beforeBoundary = encodeQr(beforeInput);
    const afterBoundary = encodeQr(afterInput);

    expect(beforeBoundary.version).toBe(6);
    expect(afterBoundary.version).toBe(7);
    expect(decodeWithJsQr(beforeBoundary.matrix)?.binaryData).toEqual(
      utf8Bytes(beforeInput)
    );
    expect(decodeWithJsQr(afterBoundary.matrix)?.binaryData).toEqual(
      utf8Bytes(afterInput)
    );
  });

  it('空文字列を Version 1 の 21x21 matrix にし jsQR が空 payload に実デコードする', () => {
    const qr = encodeQr('');
    const decoded = decodeWithJsQr(qr.matrix);

    expect(qr.version).toBe(1);
    expect(qr.matrix.length).toBe(21);
    for (const row of qr.matrix) {
      expect(row.length).toBe(21);
    }
    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual([]);
    expect(decoded?.data).toBe('');
  });

  it('TCPQ1: envelope で encode した実運用形の Lounge Invite payload を jsQR が実デコードする', () => {
    // encoder 単体の合成文字列だけでなく、実運用の生文字列（protocol 層の
    // encodeQrPayload が組み立てる `TCPQ1:{...}` envelope）を通して round-trip を
    // 検証する（Issue 73 #3、PM レビュー S-3-1 の残件）。protocol → qr は依存方向に
    // 反するため、依存は test からだけ張る。
    const invite = createLoungeInvite({
      loungeId: `lng_${'a1'.repeat(16)}`,
      joinSecret: `jsc_${'b2'.repeat(32)}`,
      hostDiscoveryHint: 'local-v1:host-a',
      transportFingerprint: `sha256_${'c3'.repeat(32)}`,
      issuedAtEpochMs: 1_000_000,
      expiresAtEpochMs: 1_000_000 + 10 * 60 * 1000,
      capacity: 2,
      requiredCapabilities: ['rules-provider-v1'],
    });
    const raw = encodeQrPayload({ kind: 'lounge-invite', value: invite });

    const qr = encodeQr(raw);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(raw.startsWith('TCPQ1:')).toBe(true);
    expect(decoded).not.toBeNull();
    expect(decoded?.binaryData).toEqual(utf8Bytes(raw));
    expect(decoded?.data).toBe(raw);
  });
});

// ISO/IEC 18004 の誤り訂正レベル L・Byte mode データ容量表（Version 1〜26、
// index = version - 1）。QR でよく参照される公開の容量表と一致し、本プロジェクトの
// devDependency ではない第三者 QR エンコーダ実装（`toqr`）を一時スクリプトで実行した
// 出力とも独立に突合済み（ADR-0032）。各 Version の「ちょうど収まる最大 byte 数」で
// encode すると、RS_BLOCKS_L の転記ミスも format info（EC level indicator を含む
// BCH）の誤りも、どちらか一方でも間違っていれば mask 選択・codeword 配置がずれて
// jsQR の実デコードに失敗するため、全 26 Version を機械的に保証できる。
const VERSION_MAX_BYTE_LENGTH_L: readonly number[] = [
  17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586,
  644, 718, 792, 858, 929, 1003, 1091, 1171, 1273, 1367,
];

// npm `jsqr`（devDependency ^1.4.0）が Version 23 だけ decode に失敗する既知の
// バグを持つため、round-trip ループから除外し、専用の it で別途扱う（下記参照）。
const JSQR_KNOWN_BROKEN_VERSION = 23;

describe('jsQR による round-trip 網羅検証（Version 1〜26）', () => {
  for (const [index, maxByteLength] of VERSION_MAX_BYTE_LENGTH_L.entries()) {
    const version = index + 1;
    if (version === JSQR_KNOWN_BROKEN_VERSION) continue;

    it(`Version ${version}（${maxByteLength} byte）を encode し jsQR が同じ byte 列に実デコードする`, () => {
      const input = 'a'.repeat(maxByteLength);

      const qr = encodeQr(input);
      const decoded = decodeWithJsQr(qr.matrix);

      expect(qr.version).toBe(version);
      expect(decoded).not.toBeNull();
      expect(decoded?.binaryData).toEqual(utf8Bytes(input));
      expect(decoded?.data).toBe(input);
    });
  }

  it('Version 23 は jsQR 自身のバグにより round-trip 検証の対象から明示的に除外する', () => {
    // npm `jsqr` 1.4.x が bundle する QR Version テーブル
    // （node_modules/jsqr/dist/jsQR.js、versionNumber: 23 のエントリ）は
    // alignmentPatternCenters が [6, 30, 54, 74, 102] になっているが、
    // ISO/IEC 18004 の正しい値は [6, 30, 54, 78, 102]（4 番目の座標が 78。本
    // encoder.ts の ALIGNMENT_PATTERN_POSITIONS[22] および独立実装の第三者 QR
    // エンコーダ `toqr` の出力と一致する）。jsQR 側のこの転記ミスは
    // function pattern mask を誤らせ、codeword の zigzag 抽出位置をずらす。
    // その結果生じるビット破損は、訂正余地の大きい誤り訂正 M / Q / H では
    // Reed-Solomon が吸収できてしまい decode に成功する（一時スクリプトで
    // 確認済み）一方、最も訂正余地が薄い L だけが訂正しきれず decode が null に
    // なる。本実装の Version 23・EC-L の matrix 自体は `toqr` の出力と bit 単位で
    // 一致することを開発時に確認済み（ADR-0032）であり、これは本実装ではなく
    // jsQR 側の欠陥である。alignmentPatternCenters が将来修正され decode に
    // 成功するようになったら、この assert（`toBeNull()`）自体が失敗して気づける
    // ようにしておく（follow-up で upstream 報告・追従を管理する）。
    const version = JSQR_KNOWN_BROKEN_VERSION;
    const maxByteLength = VERSION_MAX_BYTE_LENGTH_L[version - 1] ?? 0;
    const input = 'a'.repeat(maxByteLength);

    const qr = encodeQr(input);
    const decoded = decodeWithJsQr(qr.matrix);

    expect(qr.version).toBe(version);
    expect(qr.matrix.length).toBe(version * 4 + 17);
    expect(decoded).toBeNull();
  });

  it('QR_ENCODER_MAX_BYTES は Version 26 の容量表と一致し、密度不変の基準値そのものになる', () => {
    const version26MaxByteLength =
      VERSION_MAX_BYTE_LENGTH_L[VERSION_MAX_BYTE_LENGTH_L.length - 1];
    if (version26MaxByteLength === undefined) {
      throw new Error('VERSION_MAX_BYTE_LENGTH_L が空になっている');
    }

    expect(QR_ENCODER_MAX_BYTES).toBe(version26MaxByteLength);
  });
});

// Captured from reviewed a294e234 before the finite-domain refactor. These hashes
// lock exact matrix bits (including mask selection), not only decoded payloads.
const PRE_REFACTOR_QR_OUTPUT_SHA256 = [
  'ff195a911d01fc8d61d499080b95369c4986682dcc1c2ecf0991b77338be00b2',
  '000fdc9fb8a279401be082b7b7a3f7589f6c32159488bdd374d21c3cc6493456',
  'e13da8539d5a393797c19d37b89bf66cd66083dfb39327b54c83c29505c1e9cf',
  '5a71a283481cea1ae1e24ebf77337ea55ee653a811437a0604143adc672c8afc',
  'db1a892584eaa91a1f137b01c9b9ffdd0e9c9a0a056a8a1021e2766b5de8ad71',
  '521a7c6ee1e84fede5602c200c98314fac58779298521d68defe27add69f9e21',
  '8b2983adf51540653fcd2b0f5158c6c62b5ec9c8703cef90cc362480517e58de',
  'bb500605ecf916a8dae3f21974d3c492ea8d3b268722620e68a83bcfd5f80d87',
  '698d353e091b12132b9b948eca93d843e1bede6d6384650c08f6eae80c51f9bc',
  'ad679e9ac3eb33b554b0dc3076cd02f41fe58f2e305cba13fcef812bcaa92e12',
  '0c00e849e38834f38b7bbad6241f6a82e5956217b8bf22accf22faff14f5c364',
  '31edd8618b496117d90a6e3dbd7f80bb2bcc1ead58cd56482551061608762940',
  '1982f26abace7a2e36171564c7c757a05d23501c96401fefda7046a49b06c48d',
  '847b0daecb122a0a9500a38aaf4eb803411c9d0b98f6fdeac1ac886735fce27e',
  '6dd1218bc78fec79b51be8a9fef8c9aceadc021c90db42caa80e06df958dca06',
  'd76b9c113c98bde9ff3cfc6a772d3dbb13c25ffa9e4978787d3e7dea75243512',
  'b2a8d8ac10c0cd8022e37372c3fa55b6a86e0c210d8647ee3aea8a61945de202',
  'd4e14ac46c8b8ca32b1e08accb32e4ad4bc55aea3d2b839d4483b9c43af51c9d',
  '297a9775ee9a6f3f49f94bcd25908a5f32eba46c5a494e9b3f0bab0351ec1741',
  '8ac8399cadaec5df447d47d1d45f277fd06385a4d1307c789183741ffda63c76',
  '73de7ca464ad04370286f184f07500aa8a464a0b613ce7d47a4873bdf50184ca',
  '9ca445f85696f7537eb2b66401e9c8d6a3540f45279954c2c254fd3b6ac69cc9',
  '39088879bd9dfe00b393a647f61d090db85bd4a6646daac15b524724318f6a52',
  '497f630eae866d0296b8e7d98b7e14d86665626f6cda153631629a834877b724',
  'd6e0a64173c7e9cb996e33f533894b8e19f2a4fd9f92a37b92cd81dbb6abc04c',
  'c0d51fc31d58ffc68f5d9562604a369140dc7cb286335620c5889012cdc512ae',
] as const;

describe('QR output compatibility at every version capacity', () => {
  for (const [index, expected] of PRE_REFACTOR_QR_OUTPUT_SHA256.entries()) {
    it(`preserves exact version ${index + 1} matrix and mask`, () => {
      const byteLength = VERSION_MAX_BYTE_LENGTH_L[index];
      expect(byteLength).toBeDefined();
      if (byteLength === undefined) throw new Error('Missing capacity fixture');
      const qr = encodeQr('a'.repeat(byteLength));
      expect(qr.version).toBe(index + 1);
      expect(
        createHash('sha256')
          .update(JSON.stringify({ ok: true, output: qr }))
          .digest('hex')
      ).toBe(expected);
    });
  }

  it('accepts exactly 1367 UTF-8 bytes and rejects the adjacent multibyte lengths', () => {
    const prefix = '😀'.repeat(341);
    expect(encodeQr(`${prefix}abc`).version).toBe(26);
    for (const suffix of ['abcd', 'ああ']) {
      const value = prefix + suffix;
      expect(value.length).toBeLessThan(1367);
      const error = captureError(() => encodeQr(value));
      expectDataTooLarge(error);
      if (error instanceof QrEncodingError) {
        expect(error.message).toBe('QR encoder は 1367 byte 以下を扱います。');
      }
    }
  });
});
