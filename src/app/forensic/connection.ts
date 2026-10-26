/** One owner connection. A failed open is retryable; erase never opens a database. */
export class PracticeConnection<T> {
  #pending: Promise<T> | undefined;
  constructor(
    private readonly connect: () => Promise<T>,
    private readonly close: (database: T) => Promise<void>,
    private readonly deleteFiles: () => Promise<void>
  ) {}
  open(): Promise<T> {
    if (!this.#pending) {
      const pending = Promise.resolve()
        .then(this.connect)
        .catch((error) => {
          if (this.#pending === pending) this.#pending = undefined;
          throw error;
        });
      this.#pending = pending;
    }
    return this.#pending;
  }
  async erase(): Promise<void> {
    const pending = this.#pending;
    // An open failure may leave a partial file, which must still be removed.
    const database = pending ? await pending.catch(() => null) : null;
    if (database) await this.close(database);
    if (this.#pending === pending) this.#pending = undefined;
    await this.deleteFiles();
  }
}
