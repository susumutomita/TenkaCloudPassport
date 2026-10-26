import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ForensicPort } from '../../src/app/forensic/host';
import { emptyLearningState } from '../../src/app/learning/bundled';
import { LearningStorage } from '../../src/app/learning/storage';
import { LocalModelContextLeaseRegistry } from '../../src/app/local-data-control';
import { generationProvider } from '../../src/app/practice-generation/provider';
import ActionButton from '../../src/components/ActionButton';
import LearningScreen from '../../src/screens/learning/LearningScreen';

const id = new URLSearchParams(location.search).get('id') ?? 'test';
async function call(action: string, operation?: unknown) {
  const response = await fetch(`/api/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operation ?? {}),
  });
  if (!response.ok) throw new Error('Synthetic host operation failed');
  return response.json();
}
const host: ForensicPort = {
  load: () => call('load'),
  submit: (op) => call('submit', op),
};
let modelMode = 'unavailable';
let failLearningSave = false;
let finishGeneration: (() => void) | undefined;
const syntheticGenerator = generationProvider({
  prepare: async () => undefined,
  cancel: async () => {
    finishGeneration?.();
  },
  availability: async () =>
    modelMode === 'unavailable'
      ? 'apple-intelligence-not-enabled'
      : 'available',
  generate: async () => {
    if (modelMode === 'delayed')
      await new Promise<void>((resolve) => {
        finishGeneration = resolve;
      });
    return modelMode === 'malformed'
      ? { kind: 'field', first: 999, second: 0 }
      : { kind: 'field', first: 90, second: 10 };
  },
});
const learningKey = `synthetic-learning-${id}`;
let raw =
  localStorage.getItem(learningKey) ?? JSON.stringify(emptyLearningState());
const storage = new LearningStorage(
  {
    read: async () => raw,
    write: async (value) => {
      if (failLearningSave) {
        failLearningSave = false;
        throw new Error('Synthetic learning write failure');
      }
      localStorage.setItem(learningKey, value);
      raw = value;
    },
    remove: async () => {
      localStorage.removeItem(learningKey);
      raw = JSON.stringify(emptyLearningState());
    },
  },
  new LocalModelContextLeaseRegistry(false),
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
function Example() {
  const [open, setOpen] = useState(true);
  return (
    <View style={{ flex: 1 }}>
      {new URLSearchParams(location.search).get('generation') === '1' && (
        <View>
          {['available', 'unavailable', 'malformed', 'delayed'].map((mode) => (
            <ActionButton
              key={mode}
              label={`Synthetic model ${mode}`}
              onPress={() => {
                modelMode = mode;
              }}
            />
          ))}
          <ActionButton
            label="Finish synthetic generation"
            onPress={() => finishGeneration?.()}
          />
          <ActionButton
            label="Fail synthetic learning save"
            onPress={() => {
              failLearningSave = true;
            }}
          />
        </View>
      )}
      {open ? (
        <LearningScreen
          {...(new URLSearchParams(location.search).get('generation') === '1'
            ? { generationProvider: syntheticGenerator }
            : {})}
          forensicHost={host}
          storage={storage}
          files={files}
          locale="en"
          onClose={() => setOpen(false)}
        />
      ) : (
        <ActionButton label="Open learning" onPress={() => setOpen(true)} />
      )}
    </View>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing browser test root');
createRoot(root).render(
  <SafeAreaProvider>
    <Example />
  </SafeAreaProvider>
);
