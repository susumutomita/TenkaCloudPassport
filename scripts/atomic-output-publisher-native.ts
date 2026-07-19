import { dlopen, ptr } from 'bun:ffi';

export interface NativeEntryPlatformConfig {
  readonly libraryPath: string;
  readonly openCloseOnExec: number;
  readonly openCreate: number;
  readonly openDirectory: number;
  readonly openExclusive: number;
  readonly openNoFollow: number;
  readonly openWriteOnly: number;
  readonly renameFlag: number;
  readonly renameSymbol: string;
}

function cPath(value: string): Buffer {
  return Buffer.from(`${value}\0`);
}

export function renameEntryNoReplaceWithConfig(
  config: NativeEntryPlatformConfig,
  parentDescriptor: number,
  sourceName: string,
  destinationName: string
): boolean {
  const library = dlopen(config.libraryPath, {
    [config.renameSymbol]: {
      args: ['i32', 'ptr', 'i32', 'ptr', 'u32'],
      returns: 'i32',
    },
  });
  try {
    const renameEntry = Reflect.get(library.symbols, config.renameSymbol);
    if (typeof renameEntry !== 'function') return false;
    const source = cPath(sourceName);
    const destination = cPath(destinationName);
    return (
      Reflect.apply(renameEntry, undefined, [
        parentDescriptor,
        ptr(source),
        parentDescriptor,
        ptr(destination),
        config.renameFlag,
      ]) === 0
    );
  } finally {
    library.close();
  }
}

export function openEntryNoFollowWithConfig(
  config: NativeEntryPlatformConfig,
  parentDescriptor: number,
  entryName: string,
  directoryOnly: boolean
): number {
  const library = dlopen(config.libraryPath, {
    openat: {
      args: ['i32', 'ptr', 'i32'],
      returns: 'i32',
    },
  });
  try {
    const entry = cPath(entryName);
    return library.symbols.openat(
      parentDescriptor,
      ptr(entry),
      config.openCloseOnExec |
        config.openNoFollow |
        (directoryOnly ? config.openDirectory : 0)
    );
  } finally {
    library.close();
  }
}

export function openEntryExclusiveWithConfig(
  config: NativeEntryPlatformConfig,
  parentDescriptor: number,
  entryName: string,
  mode: number
): number {
  const library = dlopen(config.libraryPath, {
    openat: {
      args: ['i32', 'ptr', 'i32', 'i32'],
      returns: 'i32',
    },
  });
  try {
    const entry = cPath(entryName);
    return library.symbols.openat(
      parentDescriptor,
      ptr(entry),
      config.openCloseOnExec |
        config.openCreate |
        config.openExclusive |
        config.openNoFollow |
        config.openWriteOnly,
      mode
    );
  } finally {
    library.close();
  }
}

export function createNativeEntryFunctions(config: NativeEntryPlatformConfig) {
  return {
    openEntryExclusiveNative(
      parentDescriptor: number,
      entryName: string,
      mode: number
    ): number {
      return openEntryExclusiveWithConfig(
        config,
        parentDescriptor,
        entryName,
        mode
      );
    },
    openEntryNoFollowNative(
      parentDescriptor: number,
      entryName: string,
      directoryOnly: boolean
    ): number {
      return openEntryNoFollowWithConfig(
        config,
        parentDescriptor,
        entryName,
        directoryOnly
      );
    },
    renameEntryNoReplaceNative(
      parentDescriptor: number,
      sourceName: string,
      destinationName: string
    ): boolean {
      return renameEntryNoReplaceWithConfig(
        config,
        parentDescriptor,
        sourceName,
        destinationName
      );
    },
  };
}
