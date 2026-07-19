import { StatusBar } from 'expo-status-bar';
import packageManifest from './package.json';
import { createDefaultAgentModelProvider } from './src/app/default-agent-model-provider';
import { createDefaultBackupSharePort } from './src/app/default-backup-share';
import { DEFAULT_DISTRIBUTION_CAPABILITY } from './src/app/default-distribution-capability';
import { createDefaultLocalDeletionJournal } from './src/app/default-local-deletion-journal';
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
const backupSharePort = createDefaultBackupSharePort();
const agentModelProvider = createDefaultAgentModelProvider(localDataLeases);
const localDataControl = createLocalDataControl({
  profileStorage: localProfileStorage,
  modelStorage: new NoLocalModelStorageAdapter(),
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
        distributionCapability={DEFAULT_DISTRIBUTION_CAPABILITY}
        localDataControl={localDataControl}
        localProfileStorage={localProfileStorage}
      />
    </>
  );
}
