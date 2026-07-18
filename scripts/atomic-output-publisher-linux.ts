import {
  createNativeEntryFunctions,
  type NativeEntryPlatformConfig,
} from './atomic-output-publisher-native';

const LINUX_CONFIG: NativeEntryPlatformConfig = {
  libraryPath: 'libc.so.6',
  openCloseOnExec: 0x0008_0000,
  openDirectory: 0x0001_0000,
  openNoFollow: 0x0002_0000,
  renameFlag: 1,
  renameSymbol: 'renameat2',
};

export const { openEntryNoFollowNative, renameEntryNoReplaceNative } =
  createNativeEntryFunctions(LINUX_CONFIG);
