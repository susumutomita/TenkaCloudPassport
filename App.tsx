import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import packageManifest from './package.json';
import { createDefaultBackupSharePort } from './src/app/default-backup-share';
import { createDefaultInitialLocalePort } from './src/app/default-initial-locale-port';
import { createDefaultIntroCardStorage } from './src/app/default-intro-card-storage';
import { createDefaultLegacyModelStorage } from './src/app/default-legacy-model-storage';
import { createDefaultLocalDeletionJournal } from './src/app/default-local-deletion-journal';
import { createDefaultLocalProfileStorage } from './src/app/default-local-profile-storage';
import { createDefaultLocalePreferenceStorage } from './src/app/default-locale-preference-storage';
import { DeletionCoordinatedIntroCardStorage } from './src/app/deletion-coordinated-intro-card-storage';
import { createForensicHost } from './src/app/forensic/default-host';
import type { Locale } from './src/app/i18n/locale';
import { learningFiles } from './src/app/learning/default-files';
import { createLearningStorage } from './src/app/learning/default-storage';
import { LearningNavigation } from './src/app/learning/navigation';
import { combineOwnedLearningData } from './src/app/learning/owned-learning-data';
import {
  createLocalDataControl,
  DeletionCoordinatedLocalProfileStorageAdapter,
  LocalModelContextLeaseRegistry,
} from './src/app/local-data-control';
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
const forensicHost = createForensicHost(localDataLeases, localDeletionJournal);
const ownedLearningData = combineOwnedLearningData(
  learningStorage,
  forensicHost
);
const introCardStorage = new DeletionCoordinatedIntroCardStorage(
  createDefaultIntroCardStorage(),
  localDataLeases,
  localDeletionJournal
);
const backupSharePort = createDefaultBackupSharePort();
const initialLocalePort = createDefaultInitialLocalePort();
const localePreferenceStorage = createDefaultLocalePreferenceStorage();
// Retired model files remain until the user explicitly requests erasure.
const legacyModelStorage = createDefaultLegacyModelStorage();
const localDataControl = createLocalDataControl({
  introCardStorage,
  learningStorage: ownedLearningData,
  profileStorage: localProfileStorage,
  modelStorage: legacyModelStorage,
  modelContexts: localDataLeases,
  deletionJournal: localDeletionJournal,
});

export default function App() {
  const [learningLocale, setLearningLocale] = useState<Locale | null>(null);
  const openLearning = useCallback((locale: Locale) => {
    Keyboard.dismiss();
    setLearningLocale(locale);
  }, []);
  return (
    <SafeAreaProvider>
      <LearningNavigation.Provider value={openLearning}>
        <StatusBar style="dark" />

        <View style={{ flex: 1, display: learningLocale ? 'none' : 'flex' }}>
          <PassportApp
            appVersion={packageManifest.version}
            backupSharePort={backupSharePort}
            localDataControl={localDataControl}
            localProfileStorage={localProfileStorage}
            introCardStorage={introCardStorage}
            initialLocalePort={initialLocalePort}
            localePreferenceStorage={localePreferenceStorage}
          />
        </View>
        {learningLocale ? (
          <LearningScreen
            {...(forensicHost.available ? { forensicHost } : {})}
            storage={learningStorage}
            files={learningFiles}
            locale={learningLocale}
            onClose={() => setLearningLocale(null)}
          />
        ) : null}
      </LearningNavigation.Provider>
    </SafeAreaProvider>
  );
}
