import { StyleSheet, Text, View } from 'react-native';
import { expiryNotice } from '../app/expiry-notice';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import Card from '../components/Card';
import ExpiryWarningBanner from '../components/ExpiryWarningBanner';
import QrCodeView from '../components/QrCodeView';
import StatusDot from '../components/StatusDot';
import { type LoungeRoomState, ROOM_CAPACITY } from '../domain/lounge-room';
import type { ParticipantId } from '../domain/session-identifiers';
import { colors, spacing } from '../ui/theme';
import { monoFontFamily } from '../ui/typography';

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
          <Card style={styles.qrCard}>
            <QrCodeView
              accessibilityLabel={t.qrAccessibilityLabel(remainingMinutes)}
              payload={inviteQrPayload}
            />
          </Card>
          <View accessibilityRole="summary" style={styles.notice}>
            <StatusDot style={styles.dotOffset} tone="warning" />
            <View style={styles.noticeBody}>
              <Text style={styles.noticeTitle}>
                {t.remainingMinutesTitle(remainingMinutes)}
              </Text>
              <Text style={styles.noticeText}>{t.screenshotRiskNotice}</Text>
            </View>
          </View>
          {notice.level === 'warning' ? (
            <ExpiryWarningBanner message={notice.message} />
          ) : null}
          <Card accessibilityRole="summary">
            <Text style={styles.participantsTitle}>
              {t.participantsTitle(participants.length, ROOM_CAPACITY)}
            </Text>
            {participants.map((participant) => (
              <View
                key={participant.participantId}
                style={styles.participantRow}
              >
                <StatusDot
                  style={styles.dotOffset}
                  tone={participant.ready ? 'success' : 'idle'}
                />
                <Text
                  style={[
                    styles.participantText,
                    participant.ready ? styles.participantReadyText : undefined,
                  ]}
                >
                  {t.participantRow(
                    participant.participantId === hostParticipantId
                      ? t.participantYou
                      : t.participantGuest,
                    participant.ready
                      ? t.participantReady
                      : t.participantNotReady
                  )}
                </Text>
              </View>
            ))}
            {participants.length < ROOM_CAPACITY ? (
              <Text style={styles.waitingText}>{t.waitingForGuest}</Text>
            ) : null}
          </Card>
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
  qrCard: {
    alignItems: 'center',
    borderRadius: 16,
  },
  dotOffset: {
    marginTop: 7,
  },
  notice: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeBody: {
    flex: 1,
    gap: spacing.xs,
  },
  noticeTitle: {
    color: colors.warningText,
    fontFamily: monoFontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  noticeText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  participantsTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  participantRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  participantText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  participantReadyText: {
    color: colors.successText,
    fontWeight: '600',
  },
  waitingText: {
    color: colors.muted,
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
