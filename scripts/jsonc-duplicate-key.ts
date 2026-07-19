import {
  forEachChild,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isStringLiteralLike,
  type Node,
  parseJsonText,
} from 'typescript';

function duplicateKeyInObject(node: Node): string | null {
  if (!isObjectLiteralExpression(node)) return null;
  const keys = new Set<string>();
  for (const property of node.properties) {
    if (
      !isPropertyAssignment(property) ||
      !isStringLiteralLike(property.name)
    ) {
      continue;
    }
    const key = property.name.text;
    if (keys.has(key)) return key;
    keys.add(key);
  }
  return null;
}

export function firstDecodedDuplicateJsoncKey(
  source: string,
  label: string
): string | null {
  const sourceFile = parseJsonText(label, source);
  let duplicate: string | null = null;

  const visit = (node: Node): void => {
    if (duplicate !== null) return;
    const objectDuplicate = duplicateKeyInObject(node);
    if (objectDuplicate !== null) {
      duplicate = objectDuplicate;
      return;
    }
    forEachChild(node, visit);
  };

  visit(sourceFile);
  return duplicate;
}
