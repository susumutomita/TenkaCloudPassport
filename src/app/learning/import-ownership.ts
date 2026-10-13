/** Only the app's OS import Inbox copies are disposable; never the selected source. */
export function isOwnedImportCopy(uri: string, documentURI: string): boolean {
  const selected = new URL(uri);
  const documents = new URL(documentURI);
  if (
    selected.protocol !== 'file:' ||
    selected.host !== documents.host ||
    selected.search ||
    selected.hash
  )
    return false;
  const path = decodeURIComponent(selected.pathname);
  const documentPath = decodeURIComponent(documents.pathname).replace(
    /\/$/,
    ''
  );
  const root = documentPath.slice(0, documentPath.lastIndexOf('/'));
  if (path.split('/').some((part) => part === '.' || part === '..'))
    return false;
  if (path.startsWith(`${documentPath}/Inbox/`))
    return path.slice(`${documentPath}/Inbox/`.length).split('/').length === 1;
  const relative = path.slice(`${root}/tmp/`.length).split('/');
  return (
    path.startsWith(`${root}/tmp/`) &&
    relative.length === 2 &&
    !!relative[0]?.endsWith('-Inbox') &&
    !!relative[1]
  );
}
