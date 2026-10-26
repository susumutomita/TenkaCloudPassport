import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ForensicPort } from '../../src/app/forensic/host';
import { emptyLearningState } from '../../src/app/learning/bundled';
import { LearningStorage } from '../../src/app/learning/storage';
import { LocalModelContextLeaseRegistry } from '../../src/app/local-data-control';
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
let raw = JSON.stringify(emptyLearningState());
const storage = new LearningStorage(
  {
    read: async () => raw,
    write: async (value) => {
      raw = value;
    },
    remove: async () => {
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
      {open ? (
        <LearningScreen
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
