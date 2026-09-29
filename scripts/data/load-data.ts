import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseDocument } from "yaml";

import type { CollectionName } from "@/data-schema/records/collections";
import { isCollectionName } from "@/data-schema/records/collections";

export type LoadedFile = {
  file: string;
  collection: CollectionName;
  id: string;
  raw: unknown;
};
export type Issue = { file: string; path: string; message: string };
export type LoadResult = { files: LoadedFile[]; errors: Issue[] };

export const DEFAULT_DATA_DIR = "data";
const IGNORED_NAMES = new Set(["README.md"]);

type Walked = { files: string[]; nonFiles: string[] };

function walk(dir: string, prefix: string): Walked {
  const walked: Walked = { files: [], nonFiles: [] };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED_NAMES.has(entry.name)) continue;
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      const inner = walk(path.join(dir, entry.name), relative);
      walked.files.push(...inner.files);
      walked.nonFiles.push(...inner.nonFiles);
    } else if (entry.isFile()) {
      walked.files.push(relative);
    } else {
      walked.nonFiles.push(relative);
    }
  }
  return walked;
}

function parseYaml(text: string): { raw: unknown } | { errors: string[] } {
  const doc = parseDocument(text, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    prettyErrors: true,
  });
  const problems = [...doc.errors, ...doc.warnings];
  if (problems.length > 0) {
    return { errors: problems.map((e) => `yaml: ${(e.message.split("\n")[0] ?? "").trim()}`) };
  }
  return { raw: doc.toJS() };
}

export function loadData(dataDir: string): LoadResult {
  if (!existsSync(dataDir)) {
    const errors =
      dataDir === DEFAULT_DATA_DIR
        ? []
        : [{ file: dataDir, path: "", message: "data dir not found" }];
    return { files: [], errors };
  }

  const files: LoadedFile[] = [];
  const errors: Issue[] = [];
  const fail = (file: string, message: string) => errors.push({ file, path: "", message });

  const walked = walk(dataDir, "");
  for (const entry of walked.nonFiles.sort()) fail(entry, "unexpected non-file entry");

  for (const file of walked.files.sort()) {
    if (file.endsWith(".yml")) {
      fail(file, "use the .yaml extension");
      continue;
    }
    if (!file.endsWith(".yaml")) {
      fail(file, "unexpected file");
      continue;
    }
    const segments = file.split("/");
    const [collection] = segments;
    if (segments.length === 1 || collection === undefined) {
      fail(file, "records must live in a collection folder");
      continue;
    }
    if (!isCollectionName(collection)) {
      fail(file, `unknown collection "${collection}"`);
      continue;
    }
    const parsed = parseYaml(readFileSync(path.join(dataDir, file), "utf8"));
    if ("errors" in parsed) {
      for (const message of parsed.errors) fail(file, message);
      continue;
    }
    files.push({
      file,
      collection,
      id: path.posix.basename(file, ".yaml"),
      raw: parsed.raw,
    });
  }
  return { files, errors };
}
