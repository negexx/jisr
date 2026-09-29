export type MessageTree = { [key: string]: string | MessageTree };

function isTree(value: string | MessageTree | undefined): value is MessageTree {
  return typeof value === "object";
}

function cloneTree(tree: MessageTree): MessageTree {
  const copy: MessageTree = {};
  for (const [key, value] of Object.entries(tree)) {
    copy[key] = isTree(value) ? cloneTree(value) : value;
  }
  return copy;
}

function mergeInto(target: MessageTree, source: MessageTree): void {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (isTree(value) && isTree(existing)) mergeInto(existing, value);
    else target[key] = isTree(value) ? cloneTree(value) : value;
  }
}

function resolveNamespace(messages: MessageTree, namespace: string): MessageTree {
  if (namespace === "") throw new Error("pickMessages: empty namespace");
  const parts = namespace.split(".");
  let node: string | MessageTree | undefined = messages;
  for (const part of parts) {
    if (!isTree(node) || !Object.hasOwn(node, part)) {
      throw new Error(`pickMessages: unknown message namespace "${namespace}"`);
    }
    node = node[part];
  }
  if (!isTree(node)) {
    throw new Error(`pickMessages: "${namespace}" is a single message, not a namespace`);
  }

  let nested: MessageTree = cloneTree(node);
  for (const part of [...parts].reverse()) nested = { [part]: nested };
  return nested;
}

/** Returns a new tree with only the given dotted namespaces; throws if one does not exist. */
export function pickMessages(messages: MessageTree, namespaces: readonly string[]): MessageTree {
  const picked: MessageTree = {};
  for (const namespace of namespaces) mergeInto(picked, resolveNamespace(messages, namespace));
  return picked;
}
