import { createHash } from '../../domain/forensic/crypto';
import {
  applyOp,
  initialState,
  type Operation,
  type Projection,
  projectForTeam,
  type State,
} from '../../domain/forensic/upstream/index';
import { restoreSnapshot } from './snapshot';

export const PRACTICE_EDITION = '68b9fbe0d49f5f1d01e04cf8b52f284fd3153ee1';
const TEAM = 'solo';
export interface PracticeSqlite {
  execSync(sql: string): void;
  runSync(sql: string, ...bindings: (string | number | null)[]): unknown;
  getFirstSync<T>(
    sql: string,
    ...bindings: (string | number | null)[]
  ): T | null;
}
export interface PracticeKeys {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}
export interface ForensicPort {
  load(): Promise<Projection>;
  submit(operation: Operation): Promise<Projection>;
}
export interface PracticeFiles {
  inspect(): Promise<{ count: number; bytes: number }>;
  erase(): Promise<void>;
}
type Row = {
  edition: string;
  payload: string;
  digest: string;
  seed_digest: string;
};
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** Embedded host owns the private state. Screens receive only upstream projections. */
export class ForensicHost implements ForensicPort {
  readonly available = true;
  #tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly database: () => Promise<PracticeSqlite>,
    private readonly keys: PracticeKeys,
    private readonly randomHex: () => string,
    private readonly writeLease: <T>(operation: () => Promise<T>) => Promise<T>,
    private readonly files?: PracticeFiles
  ) {}
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation);
    this.#tail = result.catch(() => undefined);
    return result;
  }
  private async context() {
    const db = await this.database();
    db.execSync(
      'CREATE TABLE IF NOT EXISTS forensic_practice (id INTEGER PRIMARY KEY CHECK(id=1), edition TEXT NOT NULL, payload TEXT NOT NULL, digest TEXT NOT NULL, seed_digest TEXT NOT NULL)'
    );
    return db;
  }
  private save(db: PracticeSqlite, state: State) {
    const { matchSecret, ...snapshot } = state;
    const payload = JSON.stringify(snapshot);
    db.runSync(
      'INSERT OR REPLACE INTO forensic_practice (id, edition, payload, digest, seed_digest) VALUES (1, ?, ?, ?, ?)',
      PRACTICE_EDITION,
      payload,
      digest(payload),
      digest(matchSecret)
    );
  }
  private restore(row: Row, secret: string | null): State {
    if (
      row.edition !== PRACTICE_EDITION ||
      !secret ||
      digest(secret) !== row.seed_digest ||
      row.payload.length > 100_000 ||
      digest(row.payload) !== row.digest
    )
      throw new Error(
        'Practice recovery failed; saved progress was preserved.'
      );
    return restoreSnapshot(row.payload, secret);
  }

  private async transact(change?: Operation): Promise<Projection> {
    const db = await this.context();
    db.execSync('BEGIN IMMEDIATE');
    try {
      const row = db.getFirstSync<Row>(
        'SELECT * FROM forensic_practice WHERE id=1'
      );
      // Lock before Keychain initialization, including across two host owners.
      let secret = await this.keys.read();
      if (!row && !secret) {
        secret = this.randomHex();
        await this.keys.write(secret);
      }
      let state = row
        ? this.restore(row, secret)
        : initialState({
            eventId: this.randomHex(),
            teamIds: [TEAM],
            matchSecret: secret ?? '',
          });
      if (change) state = applyOp(state, TEAM, change);
      const projection = projectForTeam(state, TEAM);
      this.save(db, state);
      db.execSync('COMMIT');
      return projection;
    } catch (error) {
      db.execSync('ROLLBACK');
      throw error;
    }
  }
  load() {
    return this.serial(() => this.writeLease(() => this.transact()));
  }
  submit(operation: Operation) {
    return this.serial(() => this.writeLease(() => this.transact(operation)));
  }
  inspect() {
    return this.serial(async () => {
      if (this.files) {
        const usage = await this.files.inspect();
        return {
          count: usage.count + ((await this.keys.read()) ? 1 : 0),
          bytes: usage.bytes,
        };
      }
      const db = await this.context();
      const row = db.getFirstSync<Row>(
        'SELECT * FROM forensic_practice WHERE id=1'
      );
      return {
        count: (row ? 1 : 0) + ((await this.keys.read()) ? 1 : 0),
        bytes: row ? new TextEncoder().encode(row.payload).byteLength : 0,
      };
    });
  }
  remove() {
    return this.serial(async () => {
      if (this.files) await this.files.erase();
      else {
        const db = await this.context();
        db.runSync('DELETE FROM forensic_practice');
      }
      await this.keys.remove();
    });
  }
}
