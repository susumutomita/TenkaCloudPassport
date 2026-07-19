import {
  createNativeEntryFunctions,
  type NativeEntryPlatformConfig,
} from './atomic-output-publisher-native';

const DARWIN_CONFIG: NativeEntryPlatformConfig = {
  libraryPath: '/usr/lib/libSystem.B.dylib',
  openCloseOnExec: 0x0100_0000,
  openCreate: 0x0000_0200,
  openDirectory: 0x0010_0000,
  openExclusive: 0x0000_0800,
  openNoFollow: 0x0000_0100,
  openWriteOnly: 0x0000_0001,
  renameFlag: 0x0000_0004,
  renameSymbol: 'renameatx_np',
};

export const {
  openEntryExclusiveNative,
  openEntryNoFollowNative,
  renameEntryNoReplaceNative,
} = createNativeEntryFunctions(DARWIN_CONFIG);
