import { StatusBar } from 'expo-status-bar';
import packageManifest from './package.json';
import { createDefaultAgentModelProvider } from './src/app/default-agent-model-provider';
import { createDefaultBackupSharePort } from './src/app/default-backup-share';
import { createDefaultIntroCardStorage } from './src/app/default-intro-card-storage';
import { createDefaultLocalDeletionJournal } from './src/app/default-local-deletion-journal';
import { createDefaultLocalModelManagement } from './src/app/default-local-model-management';
import { createDefaultLocalProfileStorage } from './src/app/default-local-profile-storage';
import {
  createLocalDataControl,
  DeletionCoordinatedLocalProfileStorageAdapter,
  LocalModelContextLeaseRegistry,
  NoLocalModelStorageAdapter,
} from './src/app/local-data-control';
import PassportApp from './src/app/PassportApp';

const localDataLeases = new LocalModelContextLeaseRegistry();
const localDeletionJournal = createDefaultLocalDeletionJournal();
const localProfileStorage = new DeletionCoordinatedLocalProfileStorageAdapter(
  createDefaultLocalProfileStorage(),
  localDataLeases,
  localDeletionJournal
);
const introCardStorage = createDefaultIntroCardStorage();
const backupSharePort = createDefaultBackupSharePort();
const agentModelProvider = createDefaultAgentModelProvider(localDataLeases);
const localModelComposition =
  createDefaultLocalModelManagement(localDataLeases);
const localDataControl = createLocalDataControl({
  profileStorage: localProfileStorage,
  modelStorage:
    localModelComposition?.modelStorage ?? new NoLocalModelStorageAdapter(),
  modelContexts: localDataLeases,
  deletionJournal: localDeletionJournal,
});

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <PassportApp
        appVersion={packageManifest.version}
        agentModelProvider={agentModelProvider}
        backupSharePort={backupSharePort}
        localModelManagement={localModelComposition?.management ?? null}
        localModelMutationLeases={localModelComposition?.mutationLeases ?? null}
        localDataControl={localDataControl}
        localProfileStorage={localProfileStorage}
        introCardStorage={introCardStorage}
      />
    </>
  );
}
