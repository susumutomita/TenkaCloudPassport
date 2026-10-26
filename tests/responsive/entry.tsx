import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LearningStorage } from '../../src/app/learning/storage';
import { LocalModelContextLeaseRegistry } from '../../src/app/local-data-control';
import ActionButton from '../../src/components/ActionButton';
import AppScreen from '../../src/components/AppScreen';
import CameraQrCapturePanel from '../../src/components/CameraQrCapturePanel';
import ClueSelector from '../../src/components/ClueSelector';
import LanguageSelector from '../../src/components/LanguageSelector';
import PetEmojiSelector from '../../src/components/PetEmojiSelector';
import RealQrView from '../../src/components/RealQrView';
import { CLUE_IDS } from '../../src/domain/clue-catalog';
import { encodeQr } from '../../src/qr/encoder';
import IntroCardEditScreen from '../../src/screens/IntroCardEditScreen';
import IntroCardPreview from '../../src/screens/IntroCardPreview';
import IntroCardScreen from '../../src/screens/IntroCardScreen';
import { LearningLesson } from '../../src/screens/learning/LearningLesson';
import LearningScreen from '../../src/screens/learning/LearningScreen';
import {
  BUNDLED_CATALOGS,
  emptyLearningState,
} from '../fixtures/learning/catalogs';

const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const inset = Number(params.get('inset') ?? 0);
const matrix = encodeQr(`https://example.com/${'a'.repeat(900)}`).matrix;
const noop = () => undefined;
let learningRaw = JSON.stringify({
  ...emptyLearningState(),
  catalogs: BUNDLED_CATALOGS.slice(0, 1),
});
const storage = new LearningStorage(
  {
    read: async () => learningRaw,
    write: async (raw) => {
      learningRaw = raw;
    },
    remove: async () => {
      learningRaw = '';
    },
  },
  new LocalModelContextLeaseRegistry(),
  {
    isPending: async () => false,
    markPending: async () => undefined,
    clear: async () => undefined,
  }
);
const files = {
  pick: async () => null,
  exportJSON: async () => 'dismissed' as const,
};

function CameraPanelExample() {
  const [cancelled, setCancelled] = useState(false);
  if (cancelled) return <Text>Cancelled</Text>;
  return (
    <View style={{ flex: 1 }}>
      <View testID="camera-preview-space" style={{ flex: 1, minHeight: 0 }} />
      <CameraQrCapturePanel locale="en" onCancel={() => setCancelled(true)} />
    </View>
  );
}

function EditorExample() {
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    title: '',
    organization: '',
    selfIntro: '',
    email: '',
    phone: '',
    linkX: '',
    linkGithub: '',
    linkLinkedin: '',
    linkPortfolio: '',
  });
  const update = (key: keyof typeof draft) => (value: string) =>
    setDraft((old) => ({ ...old, [key]: value }));
  if (saved)
    return (
      <IntroCardScreen
        card={{ name: draft.name }}
        deleteError={null}
        locale="ja"
        onChangeLocale={noop}
        onEdit={() => setSaved(false)}
        onDelete={noop}
        onOpenSettings={noop}
      />
    );
  return (
    <IntroCardEditScreen
      {...draft}
      otherLinks={[]}
      notice={{ kind: 'empty', message: 'Synthetic editor' }}
      errorFieldKey={undefined}
      saving={false}
      cardUrlByteUsage={100}
      locale="ja"
      onChangeName={update('name')}
      onChangeTitle={update('title')}
      onChangeOrganization={update('organization')}
      onChangeSelfIntro={update('selfIntro')}
      onChangeEmail={update('email')}
      onChangePhone={update('phone')}
      onChangeLinkX={update('linkX')}
      onChangeLinkGithub={update('linkGithub')}
      onChangeLinkLinkedin={update('linkLinkedin')}
      onChangeLinkPortfolio={update('linkPortfolio')}
      onChangeOtherLink={noop}
      onAddOtherLink={noop}
      onRemoveOtherLink={noop}
      onSave={() => setSaved(true)}
      onChangeLocale={noop}
      onOpenSettings={noop}
    />
  );
}
function Example() {
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const catalog = BUNDLED_CATALOGS[0];
  const lesson = catalog?.lessons[0];
  return (
    <AppScreen
      eyebrow="Passport"
      title="さまざまな画面で使う / Different window sizes"
      description="Synthetic layout regression data"
      locale="ja"
      onChangeLocale={() => undefined}
      footer={
        <ActionButton
          label={saved ? 'Saved' : 'Save and continue / 保存して続ける'}
          onPress={() => setSaved(true)}
        />
      }
    >
      {mode === 'lesson' && catalog && lesson ? (
        <LearningLesson
          state={emptyLearningState()}
          catalog={catalog}
          lesson={lesson}
          busy={false}
          onAnswer={() => undefined}
          onNext={() => undefined}
          onRestart={() => undefined}
          onBack={() => undefined}
        />
      ) : (
        <>
          {mode === 'selectors' ? (
            <>
              <PetEmojiSelector selected="🐱" onSelect={noop} />
              <LanguageSelector
                selectedCodes={['en']}
                onToggle={noop}
                locale="en"
              />
              <ClueSelector
                selectedIds={CLUE_IDS.slice(0, 1)}
                maximum={3}
                onToggle={noop}
                locale="en"
              />
            </>
          ) : null}
          <View testID="qr-container" style={{ width: '100%' }}>
            <RealQrView matrix={matrix} />
          </View>
          <IntroCardPreview
            name="Sample Creator"
            title="Engineer"
            organization="Sample"
            selfIntro="Synthetic profile"
            email={`${'a'.repeat(64)}@example.com`}
            phone={undefined}
            links={[`https://example.com/${'long-path'.repeat(12)}`]}
          />
          <TextInput
            accessibilityLabel="Persistent draft"
            value={draft}
            onChangeText={setDraft}
            style={{ minHeight: 48, borderWidth: 1 }}
          />
          <Text>{draft}</Text>
          <ActionButton
            label="DownloadImmutableCatalogAndContinueWithOfflinePracticeWithoutLosingProgress"
            onPress={() => undefined}
          />
        </>
      )}
    </AppScreen>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
createRoot(root).render(
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: innerWidth, height: innerHeight },
      insets: { top: 0, bottom: 0, left: inset, right: inset },
    }}
  >
    {mode === 'camera' ? (
      <CameraPanelExample />
    ) : mode === 'editor' ? (
      <EditorExample />
    ) : mode === 'library' ? (
      <LearningScreen
        storage={storage}
        files={files}
        locale="en"
        onClose={noop}
      />
    ) : (
      <Example />
    )}
  </SafeAreaProvider>
);
