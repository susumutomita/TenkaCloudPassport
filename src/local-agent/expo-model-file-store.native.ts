import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import {
  type ClosableSha256Source,
  type LocalModelFileStore,
  type ModelImportCandidate,
  ModelLifecycleError,
  type StoredModelFileInfo,
} from './model-lifecycle';

const MODEL_DIRECTORY_NAME = 'local-models';
const MANIFEST_FILE_NAME = 'manifest.v1.json';
const MANIFEST_TEMP_FILE_NAME = '.manifest.v1.tmp';
const INCOMING_FILE_NAME = '.incoming.gguf';
const MODEL_FILE_PATTERN = /^([a-f0-9]{64})\.gguf$/;
const STAGED_FILE_PATTERN = /^([a-f0-9]{64})\.deleting\.gguf$/;

function modelDirectory(): Directory {
  const directory = new Directory(Paths.document, MODEL_DIRECTORY_NAME);
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function fileInfo(file: File): StoredModelFileInfo {
  if (!file.exists) return { exists: false, sizeBytes: null, uri: file.uri };
  const info = file.info();
  return {
    exists: info.exists,
    sizeBytes:
      typeof info.size === 'number' && Number.isSafeInteger(info.size)
        ? info.size
        : null,
    uri: file.uri,
  };
}

function deleteIfPresent(file: File): void {
  if (file.exists) file.delete();
}

function exactManagedFile(privateUri: string, pattern: RegExp): File {
  const candidate = new File(privateUri);
  if (!pattern.test(candidate.name)) {
    throw new Error('Managed model file name is invalid.');
  }
  const expected = new File(modelDirectory(), candidate.name);
  if (candidate.uri !== expected.uri) {
    throw new Error('Managed model file is outside app-private storage.');
  }
  return expected;
}

function readableManagedFile(privateUri: string): File {
  const candidate = new File(privateUri);
  const incoming = new File(modelDirectory(), INCOMING_FILE_NAME);
  if (candidate.uri === incoming.uri) return incoming;
  return exactManagedFile(privateUri, MODEL_FILE_PATTERN);
}

function matchingDeletionFiles(
  stagedUri: string,
  privateUri: string
): { readonly staged: File; readonly finalFile: File } {
  const staged = exactManagedFile(stagedUri, STAGED_FILE_PATTERN);
  const finalFile = exactManagedFile(privateUri, MODEL_FILE_PATTERN);
  const stagedDigest = STAGED_FILE_PATTERN.exec(staged.name)?.[1];
  const finalDigest = MODEL_FILE_PATTERN.exec(finalFile.name)?.[1];
  if (!stagedDigest || stagedDigest !== finalDigest) {
    throw new Error('Staged and final model digests do not match.');
  }
  return { staged, finalFile };
}

function reconcileStagedFile(
  directory: Directory,
  file: File,
  digest: string,
  referenced: ReadonlySet<string>
): void {
  const finalFile = new File(directory, `${digest}.gguf`);
  if (referenced.has(digest) && !finalFile.exists) {
    file.moveSync(finalFile);
    return;
  }
  deleteIfPresent(file);
}

function reconcileListedFile(
  directory: Directory,
  entry: File,
  referenced: ReadonlySet<string>
): void {
  if (
    entry.name === INCOMING_FILE_NAME ||
    entry.name === MANIFEST_TEMP_FILE_NAME
  ) {
    deleteIfPresent(entry);
    return;
  }
  const staged = STAGED_FILE_PATTERN.exec(entry.name);
  if (staged?.[1]) {
    reconcileStagedFile(directory, entry, staged[1], referenced);
    return;
  }
  const model = MODEL_FILE_PATTERN.exec(entry.name);
  if (model?.[1] && !referenced.has(model[1])) deleteIfPresent(entry);
}

/** Picker は参照だけを返し、Owner 確定前の cache copy を行わない。 */
export async function pickGgufImportCandidate(): Promise<ModelImportCandidate> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled) {
    throw new ModelLifecycleError(
      'IMPORT_CANCELLED',
      'Local Model の選択を中止しました。'
    );
  }
  const asset = result.assets[0];
  if (!asset || asset.size === undefined) {
    throw new ModelLifecycleError(
      'INVALID_FILE',
      '選択した Local Model の File Size を確認できません。'
    );
  }
  return { name: asset.name, uri: asset.uri, sizeBytes: asset.size };
}

/** Expo SDK 57 File / Directory API による app-private model storage。 */
export function createExpoModelFileStore(): LocalModelFileStore {
  return {
    async readManifestText() {
      const manifest = new File(modelDirectory(), MANIFEST_FILE_NAME);
      return manifest.exists ? manifest.text() : null;
    },
    async atomicWriteManifest(serialized) {
      const directory = modelDirectory();
      const temporary = new File(directory, MANIFEST_TEMP_FILE_NAME);
      deleteIfPresent(temporary);
      temporary.create();
      temporary.write(serialized);
      await temporary.move(new File(directory, MANIFEST_FILE_NAME), {
        overwrite: true,
      });
    },
    async reconcilePrivateFiles(referencedModelDigests) {
      const directory = modelDirectory();
      const referenced = new Set(referencedModelDigests);
      for (const entry of directory.list()) {
        if (entry instanceof File) {
          reconcileListedFile(directory, entry, referenced);
        }
      }
    },
    async availableDiskSpaceBytes() {
      return Paths.availableDiskSpace;
    },
    async copyExternalFileToIncoming(externalUri) {
      const incoming = new File(modelDirectory(), INCOMING_FILE_NAME);
      deleteIfPresent(incoming);
      await new File(externalUri).copy(incoming);
    },
    async incomingFileInfo() {
      return fileInfo(new File(modelDirectory(), INCOMING_FILE_NAME));
    },
    async openSha256Source(privateUri): Promise<ClosableSha256Source> {
      const file = readableManagedFile(privateUri);
      const info = fileInfo(file);
      if (!info.exists || info.sizeBytes === null) {
        throw new Error('Private model file is unavailable.');
      }
      const handle = file.open(FileMode.ReadOnly);
      return {
        sizeBytes: info.sizeBytes,
        async read(offset, length) {
          handle.offset = offset;
          return handle.readBytes(length);
        },
        close() {
          handle.close();
        },
      };
    },
    async moveIncomingToModel(sha256) {
      const incoming = new File(modelDirectory(), INCOMING_FILE_NAME);
      const finalFile = new File(modelDirectory(), `${sha256}.gguf`);
      await incoming.move(finalFile);
      return finalFile.uri;
    },
    async modelFileInfo(privateUri) {
      return fileInfo(exactManagedFile(privateUri, MODEL_FILE_PATTERN));
    },
    async stageModelDeletion(privateUri, sha256) {
      const source = exactManagedFile(privateUri, MODEL_FILE_PATTERN);
      if (source.name !== `${sha256}.gguf`) {
        throw new Error('Model digest does not match its private file.');
      }
      const staged = new File(modelDirectory(), `${sha256}.deleting.gguf`);
      deleteIfPresent(staged);
      await source.move(staged);
      if (source.exists || !staged.exists) {
        throw new Error('Model deletion staging was incomplete.');
      }
      return staged.uri;
    },
    async restoreStagedModel(stagedUri, privateUri) {
      const files = matchingDeletionFiles(stagedUri, privateUri);
      await files.staged.move(files.finalFile);
    },
    async finalizeStagedModelDeletion(stagedUri) {
      deleteIfPresent(exactManagedFile(stagedUri, STAGED_FILE_PATTERN));
    },
    async deleteIncomingFile() {
      deleteIfPresent(new File(modelDirectory(), INCOMING_FILE_NAME));
    },
  };
}
