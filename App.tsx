import { StatusBar } from 'expo-status-bar';
import { createDefaultBackupSharePort } from './src/app/default-backup-share';
import { createDefaultLocalProfileStorage } from './src/app/default-local-profile-storage';
import PassportApp from './src/app/PassportApp';

const localProfileStorage = createDefaultLocalProfileStorage();
const backupSharePort = createDefaultBackupSharePort();

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <PassportApp
        backupSharePort={backupSharePort}
        localProfileStorage={localProfileStorage}
      />
    </>
  );
}
