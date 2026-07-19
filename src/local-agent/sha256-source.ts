/** Model 全体を展開せず、offset / length で byte 列を読む Port。 */
export interface Sha256Source {
  readonly sizeBytes: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}
