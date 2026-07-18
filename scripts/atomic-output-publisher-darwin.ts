import {
  createNativeEntryFunctions,
  type NativeEntryPlatformConfig,
} from './atomic-output-publisher-native';

const DARWIN_CONFIG: NativeEntryPlatformConfig = {
  libraryPath: '/usr/lib/libSystem.B.dylib',
  openCloseOnExec: 0x0100_0000,
  openDirectory: 0x0010_0000,
  openNoFollow: 0x0000_0100,
  renameFlag: 0x0000_0004,
  renameSymbol: 'renameatx_np',
};

export const { openEntryNoFollowNative, renameEntryNoReplaceNative } =
  createNativeEntryFunctions(DARWIN_CONFIG);
