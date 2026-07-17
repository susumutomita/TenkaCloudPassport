import type { LoungeId, ParticipantId } from './session-identifiers';

export interface Lounge {
  readonly schemaVersion: 1;
  readonly loungeId: LoungeId;
  readonly participantIds: readonly ParticipantId[];
  readonly expiresAtEpochMs: number;
  readonly status: 'active' | 'retired';
}
