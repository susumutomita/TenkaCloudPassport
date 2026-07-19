import {
  createNativeEntryFunctions,
  type NativeEntryPlatformConfig,
} from './atomic-output-publisher-native';

const LINUX_CONFIG: NativeEntryPlatformConfig = {
  libraryPath: 'libc.so.6',
  openCloseOnExec: 0x0008_0000,
  openCreate: 0x0000_0040,
  openDirectory: 0x0001_0000,
  openExclusive: 0x0000_0080,
  openNoFollow: 0x0002_0000,
  openWriteOnly: 0x0000_0001,
  renameFlag: 1,
  renameSymbol: 'renameat2',
};

export const {
  openEntryExclusiveNative,
  openEntryNoFollowNative,
  renameEntryNoReplaceNative,
} = createNativeEntryFunctions(LINUX_CONFIG);
