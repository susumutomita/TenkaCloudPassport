import { StatusBar } from 'expo-status-bar';
import { DEFAULT_AGENT_MODEL_PROVIDER } from './src/app/default-agent-model-provider';
import { createDefaultBackupSharePort } from './src/app/default-backup-share';
import { DEFAULT_LOCAL_MODEL_MANAGEMENT } from './src/app/default-local-model-management';
import { createDefaultLocalProfileStorage } from './src/app/default-local-profile-storage';
import PassportApp from './src/app/PassportApp';

const localProfileStorage = createDefaultLocalProfileStorage();
const backupSharePort = createDefaultBackupSharePort();

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <PassportApp
        agentModelProvider={DEFAULT_AGENT_MODEL_PROVIDER}
        backupSharePort={backupSharePort}
        localModelManagement={DEFAULT_LOCAL_MODEL_MANAGEMENT}
        localProfileStorage={localProfileStorage}
      />
    </>
  );
}
