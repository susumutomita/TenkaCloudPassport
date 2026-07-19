import { CAPABILITY_MAX_REQUIRED } from '../domain/capability';
import {
  createLoungeInvite,
  isHostDiscoveryHint,
  isTransportFingerprint,
  type LoungeInvite,
} from '../domain/lounge-invite';
import {
  isParticipantId,
  type ParticipantId,
} from '../domain/session-identifiers';
import type { AuthenticatedTransportIdentity } from '../protocol/peer-envelope';
import { boundedUtf8ByteLength } from '../protocol/validation';
import {
  createNearbyJoinDescriptor,
  NEARBY_TRANSPORT_MAX_PARTICIPANTS,
  NEARBY_TRANSPORT_MAX_PAYLOAD_BYTES,
  type NearbyEnvelopeDelivery,
  type NearbyHostAuthorization,
  type NearbyHostBinding,
  type NearbyHostInvitePolicy,
  type NearbyJoinDescriptor,
  type NearbyJoinInput,
  type NearbyOutboundEnvelope,
  NearbyTransportError,
  type NearbyTransportEvent,
} from './nearby-transport';

const JOIN_REQUEST_MAX_BYTES = 1_024;
const LOUNGE_INVITE_KEYS = [
  'schemaVersion',
  'loungeId',
  'joinSecret',
  'hostDiscoveryHint',
  'transportFingerprint',
  'issuedAtEpochMs',
  'expiresAtEpochMs',
  'capacity',
  'requiredCapabilities',
] as const;
const JOIN_DESCRIPTOR_KEYS = [
  'schemaVersion',
  'loungeId',
  'hostDiscoveryHint',
  'transportFingerprint',
  'issuedAtEpochMs',
  'expiresAtEpochMs',
  'capacity',
  'requiredCapabilities',
] as const;
const JOIN_INPUT_KEYS = [
  'invite',
  'participantId',
  'rawJoinRequest',
  'waitUntilReady',
] as const;
const HOST_AUTHORIZATION_KEYS = [
  'invite',
  'authorizeJoin',
  'waitUntilReady',
  'dispose',
] as const;
const HOST_BINDING_KEYS = [
  'hostDiscoveryHint',
  'transportFingerprint',
] as const;
const HOST_POLICY_KEYS = ['hostParticipantId', 'issueInvite'] as const;
const OUTBOUND_ENVELOPE_KEYS = ['delivery', 'payload'] as const;
const BROADCAST_DELIVERY_KEYS = ['kind'] as const;
const TARGET_DELIVERY_KEYS = ['kind', 'participantId'] as const;
const AUTHENTICATED_IDENTITY_KEYS = [
  'kind',
  'loungeId',
  'participantId',
] as const;

export interface ValidatedNearbyJoinInput {
  readonly invite: NearbyJoinDescriptor;
  readonly participantId: ParticipantId;
  readonly rawJoinRequest: string;
  readonly waitUntilReady: () => Promise<void>;
}

export interface ValidatedNearbyEnvelope {
  readonly envelope: NearbyOutboundEnvelope;
  readonly bytes: number;
}

export interface ValidatedNearbyHostAuthorization {
  readonly invite: LoungeInvite;
  readonly authorizeJoin: NearbyHostAuthorization['authorizeJoin'];
  readonly waitUntilReady: NearbyHostAuthorization['waitUntilReady'];
  readonly dispose: NearbyHostAuthorization['dispose'];
}

function fixedError(code: 'INVALID_CONFIGURATION' | 'INVALID_ENVELOPE') {
  return new NearbyTransportError(code);
}

function exactPropertyDescriptors(
  value: object,
  expectedKeys: readonly string[]
): PropertyDescriptorMap | null {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(descriptors);
  if (
    actualKeys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => actualKeys.includes(key))
  ) {
    return null;
  }
  return descriptors;
}

function snapshotExactData<T extends object>(
  value: unknown,
  expectedKeys: readonly string[]
): Readonly<T> | null {
  if (typeof value !== 'object' || value === null) return null;
  try {
    const descriptors = exactPropertyDescriptors(value, expectedKeys);
    if (!descriptors) return null;
    const snapshot: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot as T;
  } catch {
    return null;
  }
}

function snapshotStringArray(
  value: unknown,
  maximumLength: number
): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  try {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length = lengthDescriptor?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximumLength) {
      return null;
    }
    const expectedKeys = [
      ...Array.from({ length }, (_, index) => String(index)),
      'length',
    ];
    const descriptors = exactPropertyDescriptors(value, expectedKeys);
    if (!descriptors) return null;
    const snapshot: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        !descriptor ||
        !('value' in descriptor) ||
        typeof descriptor.value !== 'string'
      ) {
        return null;
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function strictLoungeInvite(value: unknown): LoungeInvite {
  const snapshot = snapshotExactData<LoungeInvite>(value, LOUNGE_INVITE_KEYS);
  const requiredCapabilities = snapshotStringArray(
    snapshot?.requiredCapabilities,
    CAPABILITY_MAX_REQUIRED
  );
  if (snapshot?.schemaVersion !== 2 || !requiredCapabilities) {
    throw fixedError('INVALID_CONFIGURATION');
  }
  return createLoungeInvite({
    loungeId: snapshot.loungeId,
    joinSecret: snapshot.joinSecret,
    hostDiscoveryHint: snapshot.hostDiscoveryHint,
    transportFingerprint: snapshot.transportFingerprint,
    issuedAtEpochMs: snapshot.issuedAtEpochMs,
    expiresAtEpochMs: snapshot.expiresAtEpochMs,
    capacity: snapshot.capacity,
    requiredCapabilities,
  });
}

function strictJoinDescriptor(value: unknown): NearbyJoinDescriptor {
  const snapshot = snapshotExactData<NearbyJoinDescriptor>(
    value,
    JOIN_DESCRIPTOR_KEYS
  );
  const requiredCapabilities = snapshotStringArray(
    snapshot?.requiredCapabilities,
    CAPABILITY_MAX_REQUIRED
  );
  if (snapshot?.schemaVersion !== 2 || !requiredCapabilities) {
    throw fixedError('INVALID_CONFIGURATION');
  }
  return createNearbyJoinDescriptor(
    createLoungeInvite({
      loungeId: snapshot.loungeId,
      joinSecret: `jsc_${'01'.repeat(32)}`,
      hostDiscoveryHint: snapshot.hostDiscoveryHint,
      transportFingerprint: snapshot.transportFingerprint,
      issuedAtEpochMs: snapshot.issuedAtEpochMs,
      expiresAtEpochMs: snapshot.expiresAtEpochMs,
      capacity: snapshot.capacity,
      requiredCapabilities,
    })
  );
}

function disposeAuthorization(
  authorization: Pick<NearbyHostAuthorization, 'dispose'>
): void {
  try {
    authorization.dispose();
  } catch {
    // Invalid or retired authorization cleanup is best effort.
  }
}

function disposeOwnDataAuthorization(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'dispose');
    if (
      descriptor &&
      'value' in descriptor &&
      typeof descriptor.value === 'function'
    ) {
      Reflect.apply(descriptor.value, value, []);
    }
  } catch {
    // Invalid authorization cleanup cannot change the fixed boundary error.
  }
}

export function validateNearbyHostPolicy(
  policy: NearbyHostInvitePolicy
): NearbyHostInvitePolicy {
  const snapshot = snapshotExactData<NearbyHostInvitePolicy>(
    policy,
    HOST_POLICY_KEYS
  );
  if (
    !snapshot ||
    !isParticipantId(snapshot.hostParticipantId) ||
    typeof snapshot.issueInvite !== 'function'
  ) {
    throw fixedError('INVALID_CONFIGURATION');
  }
  return Object.freeze({
    hostParticipantId: snapshot.hostParticipantId,
    issueInvite: snapshot.issueInvite,
  });
}

export function validateNearbyHostBinding(
  binding: NearbyHostBinding
): NearbyHostBinding {
  const snapshot = snapshotExactData<NearbyHostBinding>(
    binding,
    HOST_BINDING_KEYS
  );
  if (
    !snapshot ||
    typeof snapshot.hostDiscoveryHint !== 'string' ||
    !isHostDiscoveryHint(snapshot.hostDiscoveryHint) ||
    typeof snapshot.transportFingerprint !== 'string' ||
    !isTransportFingerprint(snapshot.transportFingerprint)
  ) {
    throw fixedError('INVALID_CONFIGURATION');
  }
  return Object.freeze({
    hostDiscoveryHint: snapshot.hostDiscoveryHint,
    transportFingerprint: snapshot.transportFingerprint,
  });
}

export function validateNearbyJoinInput(
  input: NearbyJoinInput
): ValidatedNearbyJoinInput {
  try {
    const snapshot = snapshotExactData<NearbyJoinInput>(input, JOIN_INPUT_KEYS);
    if (
      !snapshot ||
      !isParticipantId(snapshot.participantId) ||
      typeof snapshot.rawJoinRequest !== 'string' ||
      boundedUtf8ByteLength(snapshot.rawJoinRequest, JOIN_REQUEST_MAX_BYTES) >
        JOIN_REQUEST_MAX_BYTES ||
      typeof snapshot.waitUntilReady !== 'function'
    ) {
      throw fixedError('INVALID_CONFIGURATION');
    }
    return Object.freeze({
      invite: strictJoinDescriptor(snapshot.invite),
      participantId: snapshot.participantId,
      rawJoinRequest: snapshot.rawJoinRequest,
      waitUntilReady: snapshot.waitUntilReady,
    });
  } catch {
    throw fixedError('INVALID_CONFIGURATION');
  }
}

export function validateNearbyHostAuthorization(
  value: unknown,
  binding: NearbyHostBinding
): ValidatedNearbyHostAuthorization {
  let validatedBinding: NearbyHostBinding;
  try {
    validatedBinding = validateNearbyHostBinding(binding);
  } catch {
    disposeOwnDataAuthorization(value);
    throw fixedError('INVALID_CONFIGURATION');
  }
  const snapshot = snapshotExactData<NearbyHostAuthorization>(
    value,
    HOST_AUTHORIZATION_KEYS
  );
  if (
    !snapshot ||
    typeof snapshot.authorizeJoin !== 'function' ||
    typeof snapshot.waitUntilReady !== 'function' ||
    typeof snapshot.dispose !== 'function'
  ) {
    disposeOwnDataAuthorization(value);
    throw fixedError('INVALID_CONFIGURATION');
  }
  const stored = {
    authorizeJoin: snapshot.authorizeJoin,
    waitUntilReady: snapshot.waitUntilReady,
    dispose: snapshot.dispose,
  };
  let invite: LoungeInvite;
  try {
    invite = strictLoungeInvite(snapshot.invite);
  } catch {
    disposeAuthorization(stored);
    throw fixedError('INVALID_CONFIGURATION');
  }
  if (
    invite.hostDiscoveryHint !== validatedBinding.hostDiscoveryHint ||
    invite.transportFingerprint !== validatedBinding.transportFingerprint ||
    invite.capacity > NEARBY_TRANSPORT_MAX_PARTICIPANTS
  ) {
    disposeAuthorization(stored);
    throw fixedError('INVALID_CONFIGURATION');
  }
  return Object.freeze({ invite, ...stored });
}

export function validateAuthenticatedTransportIdentity(
  value: unknown,
  loungeId: LoungeInvite['loungeId'],
  participantId: ParticipantId
): AuthenticatedTransportIdentity {
  const snapshot = snapshotExactData<AuthenticatedTransportIdentity>(
    value,
    AUTHENTICATED_IDENTITY_KEYS
  );
  if (
    snapshot?.kind !== 'authenticated' ||
    snapshot.loungeId !== loungeId ||
    snapshot.participantId !== participantId
  ) {
    throw new NearbyTransportError('AUTHENTICATION_MISMATCH');
  }
  return Object.freeze({ kind: 'authenticated', loungeId, participantId });
}

export function validateNearbyEnvelope(
  value: NearbyOutboundEnvelope
): ValidatedNearbyEnvelope {
  const snapshot = snapshotExactData<NearbyOutboundEnvelope>(
    value,
    OUTBOUND_ENVELOPE_KEYS
  );
  if (!snapshot || typeof snapshot.payload !== 'string') {
    throw fixedError('INVALID_ENVELOPE');
  }
  const bytes = boundedUtf8ByteLength(
    snapshot.payload,
    NEARBY_TRANSPORT_MAX_PAYLOAD_BYTES
  );
  if (bytes > NEARBY_TRANSPORT_MAX_PAYLOAD_BYTES) {
    throw new NearbyTransportError('PAYLOAD_LIMIT_EXCEEDED');
  }
  const broadcast = snapshotExactData<NearbyEnvelopeDelivery>(
    snapshot.delivery,
    BROADCAST_DELIVERY_KEYS
  );
  if (broadcast?.kind === 'broadcast') {
    return Object.freeze({
      envelope: Object.freeze({
        delivery: Object.freeze({ kind: 'broadcast' }),
        payload: snapshot.payload,
      }),
      bytes,
    });
  }
  const target = snapshotExactData<NearbyEnvelopeDelivery>(
    snapshot.delivery,
    TARGET_DELIVERY_KEYS
  );
  if (target?.kind !== 'target' || !isParticipantId(target.participantId)) {
    throw fixedError('INVALID_ENVELOPE');
  }
  return Object.freeze({
    envelope: Object.freeze({
      delivery: Object.freeze({
        kind: 'target',
        participantId: target.participantId,
      }),
      payload: snapshot.payload,
    }),
    bytes,
  });
}

export function nearbyJoinDescriptorsMatch(
  first: NearbyJoinDescriptor,
  second: NearbyJoinDescriptor
): boolean {
  return (
    first.schemaVersion === second.schemaVersion &&
    first.loungeId === second.loungeId &&
    first.hostDiscoveryHint === second.hostDiscoveryHint &&
    first.transportFingerprint === second.transportFingerprint &&
    first.issuedAtEpochMs === second.issuedAtEpochMs &&
    first.expiresAtEpochMs === second.expiresAtEpochMs &&
    first.capacity === second.capacity &&
    first.requiredCapabilities.length === second.requiredCapabilities.length &&
    first.requiredCapabilities.every(
      (capability, index) => capability === second.requiredCapabilities[index]
    )
  );
}

export function immutableNearbyTransportEvent(
  event: NearbyTransportEvent
): NearbyTransportEvent {
  switch (event.kind) {
    case 'connection-state-changed':
      return Object.freeze({
        kind: event.kind,
        state: event.state,
        ...(event.reason ? { reason: event.reason } : {}),
      });
    case 'transport-condition':
      return Object.freeze({ kind: event.kind, condition: event.condition });
    case 'membership-changed':
      return Object.freeze({
        kind: event.kind,
        change: event.change,
        identity: Object.freeze({ ...event.identity }),
        participantIds: Object.freeze([...event.participantIds]),
      });
    case 'envelope-received':
      return Object.freeze({
        kind: event.kind,
        envelope: Object.freeze({
          delivery: Object.freeze(
            event.envelope.delivery.kind === 'broadcast'
              ? { kind: 'broadcast' }
              : {
                  kind: 'target',
                  participantId: event.envelope.delivery.participantId,
                }
          ),
          payload: event.envelope.payload,
          transportAuthentication: Object.freeze({
            ...event.envelope.transportAuthentication,
          }),
        }),
      });
  }
}
