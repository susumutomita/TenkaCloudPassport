import type { PublicPassport } from '../domain/passport';
import type { LoungeId, ParticipantId } from '../domain/session-identifiers';

export const PROTOCOL_VERSION = { major: 1, minor: 0 } as const;

export interface ProtocolVersion {
  readonly major: 1;
  readonly minor: 0;
}

export type MessageNonce = `msg_${string}`;

export type PeerPayload =
  | {
      readonly kind: 'public-passport';
      readonly publicPassport: PublicPassport;
    }
  | {
      readonly kind: 'owner-answer';
      readonly questionId: 'confirm-shared-clue';
      readonly answer: 'yes' | 'no';
    }
  | {
      readonly kind: 'retired';
      readonly outcome: 'bridge' | 'no-signal';
    };

export interface PeerEnvelope {
  readonly protocolVersion: ProtocolVersion;
  readonly loungeId: LoungeId;
  readonly senderParticipantId: ParticipantId;
  readonly sequence: number;
  readonly messageNonce: MessageNonce;
  readonly payload: PeerPayload;
}
