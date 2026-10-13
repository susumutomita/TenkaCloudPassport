import { expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

it('retires consumer agent routes and startup inference without deleting user data', async () => {
  const root = await readSourceFile(import.meta.url, '../../App.tsx');
  const app = await readSourceFile(import.meta.url, 'PassportApp.tsx');
  const home = await readSourceFile(
    import.meta.url,
    '../screens/IntroCardScreen.tsx'
  );
  const settings = await readSourceFile(
    import.meta.url,
    '../screens/SettingsScreen.tsx'
  );
  expect(root).not.toContain('createDefaultAgentModelProvider');
  expect(root).not.toContain('agentModelProviderStartup');
  expect(root).toContain('localModelComposition?.modelStorage');
  expect(root).toContain('learningStorage,');
  expect(root).not.toContain('.remove(');
  expect(app).not.toContain('useConversationAgentFlow');
  expect(app).not.toContain('useLocalModelManagement');
  expect(app).not.toContain('<ConversationAgentScreen');
  expect(app).not.toContain("| 'conversation-agent'");
  expect(home).not.toContain('onOpenConversationAgent');
  expect(settings).not.toContain('onOpenConversationAgent');
});
