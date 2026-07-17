import { StyleSheet, Text, View } from 'react-native';
import { expiryNotice } from '../app/expiry-notice';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
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
  readonly locale?: Locale;
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
  locale = DEFAULT_LOCALE,
  onMarkHostReady,
  onProceedToGuestScan,
  onCancel,
}: HostInviteScreenProps) {
  const t = MESSAGES[locale].hostInvite;
  const participants = room.status === 'expired' ? [] : room.participants;
  const hostParticipant = participants.find(
    (participant) => participant.participantId === hostParticipantId
  );
  const hostIsReady = hostParticipant?.ready ?? false;
  const notice = expiryNotice(remainingMs, locale);
  const isExpired = room.status === 'expired';
  const remainingMinutes = formatRemainingMinutes(remainingMs);

  return (
    <AppScreen
      description={t.description}
      eyebrow="Step 4 / Host Invite"
      title={t.title}
    >
      {isExpired ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorTitle}>{t.expiredTitle}</Text>
          <Text style={styles.errorText}>{t.expiredText}</Text>
        </View>
      ) : (
        <>
          <QrCodeView
            accessibilityLabel={t.qrAccessibilityLabel(remainingMinutes)}
            payload={inviteQrPayload}
          />
          <View accessibilityRole="summary" style={styles.notice}>
            <Text style={styles.noticeTitle}>
              {t.remainingMinutesTitle(remainingMinutes)}
            </Text>
            <Text style={styles.noticeText}>{t.screenshotRiskNotice}</Text>
          </View>
          {notice.level === 'warning' ? (
            <View accessibilityRole="alert" style={styles.expiryWarning}>
              <Text style={styles.expiryWarningText}>{notice.message}</Text>
            </View>
          ) : null}
          <View accessibilityRole="summary" style={styles.participants}>
            <Text style={styles.participantsTitle}>
              {t.participantsTitle(participants.length, ROOM_CAPACITY)}
            </Text>
            {participants.map((participant) => (
              <Text
                key={participant.participantId}
                style={styles.participantRow}
              >
                {t.participantRow(
                  participant.participantId === hostParticipantId
                    ? t.participantYou
                    : t.participantGuest,
                  participant.ready ? t.participantReady : t.participantNotReady
                )}
              </Text>
            ))}
            {participants.length < ROOM_CAPACITY ? (
              <Text style={styles.participantRow}>{t.waitingForGuest}</Text>
            ) : null}
          </View>
          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}
          <ActionButton
            accessibilityHint={t.markHostReadyHint}
            disabled={hostIsReady}
            label={t.markHostReadyButton(hostIsReady)}
            onPress={onMarkHostReady}
          />
          <ActionButton
            accessibilityHint={t.proceedToGuestScanHint}
            label={t.proceedToGuestScanButton}
            onPress={onProceedToGuestScan}
            variant="secondary"
          />
        </>
      )}
      <ActionButton
        label={t.cancelButton}
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
  expiryWarning: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  expiryWarningText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
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
