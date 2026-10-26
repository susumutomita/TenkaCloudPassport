/** Preserve fail-closed source invariants without compile-only non-null assertions. */
export function requireDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Invalid forensic practice state.');
  return value;
}
