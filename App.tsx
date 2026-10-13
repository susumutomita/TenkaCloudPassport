import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Keyboard, View } from 'react-native';
import packageManifest from './package.json';
import { createDefaultAgentModelProvider } from './src/app/default-agent-model-provider';
import { createDefaultBackupSharePort } from './src/app/default-backup-share';
import { createDefaultInitialLocalePort } from './src/app/default-initial-locale-port';
import { createDefaultIntroCardStorage } from './src/app/default-intro-card-storage';
import { createDefaultLocalDeletionJournal } from './src/app/default-local-deletion-journal';
import { createDefaultLocalModelManagement } from './src/app/default-local-model-management';
import { createDefaultLocalProfileStorage } from './src/app/default-local-profile-storage';
import { createDefaultLocalePreferenceStorage } from './src/app/default-locale-preference-storage';
import { DeletionCoordinatedIntroCardStorage } from './src/app/deletion-coordinated-intro-card-storage';
import type { Locale } from './src/app/i18n/locale';
import { learningFiles } from './src/app/learning/default-files';
import { createLearningStorage } from './src/app/learning/default-storage';
import { LearningNavigation } from './src/app/learning/navigation';
import {
  createLocalDataControl,
  DeletionCoordinatedLocalProfileStorageAdapter,
  LocalModelContextLeaseRegistry,
  NoLocalModelStorageAdapter,
} from './src/app/local-data-control';
import {
  type AgentModelProviderStartupResult,
  rulesOnlyAgentModelProviderStartupResult,
} from './src/app/native-agent-model-provider-composition';
import PassportApp from './src/app/PassportApp';
import LearningScreen from './src/screens/learning/LearningScreen';

const localDataLeases = new LocalModelContextLeaseRegistry();
const localDeletionJournal = createDefaultLocalDeletionJournal();
const localProfileStorage = new DeletionCoordinatedLocalProfileStorageAdapter(
  createDefaultLocalProfileStorage(),
  localDataLeases,
  localDeletionJournal
);
const learningStorage = createLearningStorage(
  localDataLeases,
  localDeletionJournal
);
const introCardStorage = new DeletionCoordinatedIntroCardStorage(
  createDefaultIntroCardStorage(),
  localDataLeases,
  localDeletionJournal
);
const backupSharePort = createDefaultBackupSharePort();
const initialLocalePort = createDefaultInitialLocalePort();
const localePreferenceStorage = createDefaultLocalePreferenceStorage();
/**
 * Follow-up F-983000: Apple Intelligence の Availability 判定が非同期になった
 * ため、Provider の確定自体も Promise になる。この Promise は module scope で
 * 1 回だけ作り、`App` component は解決を待ってから `PassportApp` をマウントする
 * （`useLocalModelManagement` の `provider` state はマウント時の引数だけを
 * 初期値として持ち、mount 後の prop 変化を購読しないため、確定前に
 * `PassportApp` をマウントして後から Provider を差し替える設計は「対応端末で
 * Apple Intelligence が primary になる」を保証できない。advisor 指摘、
 * `Plan.md` 設計判断節を参照）。
 */
const agentModelProviderStartupPromise =
  createDefaultAgentModelProvider(localDataLeases);
const localModelComposition =
  createDefaultLocalModelManagement(localDataLeases);
const localDataControl = createLocalDataControl({
  introCardStorage,
  learningStorage,
  profileStorage: localProfileStorage,
  modelStorage:
    localModelComposition?.modelStorage ?? new NoLocalModelStorageAdapter(),
  modelContexts: localDataLeases,
  deletionJournal: localDeletionJournal,
});

export default function App() {
  const [learningLocale, setLearningLocale] = useState<Locale | null>(null);
  const openLearning = useCallback((locale: Locale) => {
    Keyboard.dismiss();
    setLearningLocale(locale);
  }, []);
  const [agentModelProviderStartup, setAgentModelProviderStartup] =
    useState<AgentModelProviderStartupResult | null>(null);

  useEffect(() => {
    let active = true;
    agentModelProviderStartupPromise
      .then((result) => {
        if (active) setAgentModelProviderStartup(result);
      })
      .catch(() => {
        // advisor 指摘: reject を放置すると `PassportApp` が永久に
        // マウントされず白画面になる。白画面より Rules-only の方が安全
        // なので fail-open する（ADR-0058 Decision 1 参照）。
        if (active) {
          setAgentModelProviderStartup(
            rulesOnlyAgentModelProviderStartupResult()
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <LearningNavigation.Provider value={openLearning}>
      <StatusBar style="dark" />
      {agentModelProviderStartup ? (
        <View style={{ flex: 1, display: learningLocale ? 'none' : 'flex' }}>
          <PassportApp
            appVersion={packageManifest.version}
            agentModelProvider={agentModelProviderStartup.provider}
            appleIntelligenceUnavailable={
              agentModelProviderStartup.appleIntelligenceUnavailable
            }
            backupSharePort={backupSharePort}
            localModelManagement={localModelComposition?.management ?? null}
            localModelMutationLeases={
              localModelComposition?.mutationLeases ?? null
            }
            localDataControl={localDataControl}
            localProfileStorage={localProfileStorage}
            introCardStorage={introCardStorage}
            initialLocalePort={initialLocalePort}
            localePreferenceStorage={localePreferenceStorage}
          />
        </View>
      ) : null}
      {learningLocale ? (
        <LearningScreen
          storage={learningStorage}
          files={learningFiles}
          locale={learningLocale}
          onClose={() => setLearningLocale(null)}
        />
      ) : null}
    </LearningNavigation.Provider>
  );
}
