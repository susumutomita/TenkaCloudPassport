interface OwnedLearningData {
  inspect(): Promise<{ readonly count: number; readonly bytes: number }>;
  remove(): Promise<void>;
}
/** The deletion coordinator owns the lease/journal; construction never erases data. */
export function combineOwnedLearningData(
  ...stores: readonly OwnedLearningData[]
): OwnedLearningData {
  return {
    async inspect() {
      const usage = await Promise.all(stores.map((store) => store.inspect()));
      return usage.reduce(
        (sum, item) => ({
          count: sum.count + item.count,
          bytes: sum.bytes + item.bytes,
        }),
        { count: 0, bytes: 0 }
      );
    },
    async remove() {
      for (const store of stores) await store.remove();
    },
  };
}
