import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';
import { requireValid } from '../../domain/learning/validation';
import { learningTemporaryDirectory } from './default-storage';
import type { LearningFilePort } from './file-port';
import { isOwnedImportCopy } from './import-ownership';

export const learningFiles: LearningFilePort = {
  async pick(maximumBytes) {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: false,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    requireValid(asset);
    if (Platform.OS === 'web') {
      requireValid(asset.file && asset.file.size <= maximumBytes);
      return asset.file.text();
    }
    const file = new File(asset.uri);
    // iOS asCopy:true can create an OS Inbox even without Expo's additional cache copy.
    const disposable = isOwnedImportCopy(asset.uri, Paths.document.uri);
    try {
      requireValid(file.size <= maximumBytes);
      return await file.text();
    } finally {
      if (disposable && file.exists) file.delete();
    }
  },
  async exportJSON(json) {
    const name = 'tenkacloud-learning-backup.json';
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(
        new Blob([json], { type: 'application/json' })
      );
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      return 'downloaded';
    }
    requireValid(Platform.OS === 'ios');
    const directory = learningTemporaryDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, name);
    try {
      file.write(json);
      const result = await Share.share({ url: file.uri, title: name });
      return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
    } finally {
      if (file.exists) file.delete();
      if (directory.exists) directory.delete();
    }
  },
};
