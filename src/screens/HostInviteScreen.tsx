import { StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import QrCodeView from '../components/QrCodeView';
import { type LoungeRoomState, ROOM_CAPACITY } from '../domain/lounge-room';
import type { ParticipantId } from '../domain/session-identifiers';
import { colors, spacing } from '../ui/theme';

interface HostInviteScreenProps {
  readonly room: LoungeRoomState;
  readonly hostParticipantId: ParticipantId;
  readonly inviteQrPayload: string;
  readonly remainingMs: number;
  readonly errorMessage: string | null;
  readonly onMarkHostReady: () => void;
  readonly onProceedToGuestScan: () => void;
  readonly onCancel: () => void;
}

function formatRemainingMinutes(remainingMs: number): string {
  return String(Math.max(0, Math.ceil(remainingMs / 60_000)));
}

export default function HostInviteScreen({
  room,
  hostParticipantId,
  inviteQrPayload,
  remainingMs,
  errorMessage,
  onMarkHostReady,
  onProceedToGuestScan,
  onCancel,
}: HostInviteScreenProps) {
  const participants = room.status === 'expired' ? [] : room.participants;
  const hostParticipant = participants.find(
    (participant) => participant.participantId === hostParticipantId
  );
  const hostIsReady = hostParticipant?.ready ?? false;
  const isExpired = room.status === 'expired';

  return (
    <AppScreen
      description="Invite QR を対面の相手に見せてください。参加者 2 名がそれぞれ Ready になるまで、判定は開始しません。"
      eyebrow="Step 4 / Host Invite"
      title="Lounge への Invite QR を表示する。"
    >
      {isExpired ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorTitle}>
            この Lounge の招待は期限切れです。
          </Text>
          <Text style={styles.errorText}>
            もう一度、最初から Lounge を作り直してください。
          </Text>
        </View>
      ) : (
        <>
          <QrCodeView
            accessibilityLabel={`Invite QR。残り ${formatRemainingMinutes(remainingMs)} 分で期限切れになります。`}
            payload={inviteQrPayload}
          />
          <View accessibilityRole="summary" style={styles.notice}>
            <Text style={styles.noticeTitle}>
              残り {formatRemainingMinutes(remainingMs)}{' '}
              分で期限切れになります。
            </Text>
            <Text style={styles.noticeText}>
              Screenshot や画面共有で、この QR
              が対面以外の相手に見られるリスクが
              あります。期限内に、対面の相手にだけ見せてください。
            </Text>
          </View>
          <View accessibilityRole="summary" style={styles.participants}>
            <Text style={styles.participantsTitle}>
              参加者 {participants.length} / {ROOM_CAPACITY}
            </Text>
            {participants.map((participant) => (
              <Text
                key={participant.participantId}
                style={styles.participantRow}
              >
                {participant.participantId === hostParticipantId
                  ? 'あなた（Host）'
                  : 'ゲスト'}
                ：{participant.ready ? 'Ready' : '未 Ready'}
              </Text>
            ))}
            {participants.length < ROOM_CAPACITY ? (
              <Text style={styles.participantRow}>
                ゲストの参加を待っています。
              </Text>
            ) : null}
          </View>
          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}
          <ActionButton
            accessibilityHint="あなた自身の Public Passport 共有を確定し、Ready にします。"
            disabled={hostIsReady}
            label={hostIsReady ? 'あなたは Ready 済み' : '自分も Ready にする'}
            onPress={onMarkHostReady}
          />
          <ActionButton
            accessibilityHint="単一端末デモ用に、この QR をゲストとして読み取る画面へ切り替えます。"
            label="同じ端末でゲストとして QR を読み取る"
            onPress={onProceedToGuestScan}
            variant="secondary"
          />
        </>
      )}
      <ActionButton
        label="Lounge をキャンセルする"
        onPress={onCancel}
        variant="danger"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  noticeTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  participants: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  participantsTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  participantRow: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  errorBox: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
