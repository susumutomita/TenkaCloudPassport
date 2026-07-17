import { StatusBar } from 'expo-status-bar';
import { createDefaultLocalProfileStorage } from './src/app/default-local-profile-storage';
import PassportApp from './src/app/PassportApp';

const localProfileStorage = createDefaultLocalProfileStorage();

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <PassportApp localProfileStorage={localProfileStorage} />
    </>
  );
}
