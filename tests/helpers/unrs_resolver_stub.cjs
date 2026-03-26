const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.node'];
const originalLoad = Module._load;

function ensureArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function directoryExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveWithExtensions(basePath, extensions) {
  if (fileExists(basePath)) {
    return basePath;
  }

  for (const extension of extensions) {
    const filePath = `${basePath}${extension}`;
    if (fileExists(filePath)) {
      return filePath;
    }
  }

  if (directoryExists(basePath)) {
    for (const extension of extensions) {
      const indexPath = path.join(basePath, `index${extension}`);
      if (fileExists(indexPath)) {
        return indexPath;
      }
    }
  }

  return null;
}

function resolveAlias(request, options) {
  const rootDir = options.rootDir || process.cwd();

  if (request.startsWith('@/')) {
    return resolveWithExtensions(path.join(rootDir, 'src', request.slice(2)), ensureArray(options.extensions).concat(DEFAULT_EXTENSIONS));
  }

  if (request.startsWith('@util/')) {
    return resolveWithExtensions(path.join(rootDir, 'util', request.slice('@util/'.length)), ensureArray(options.extensions).concat(DEFAULT_EXTENSIONS));
  }

  return null;
}

function dedupe(values) {
  return [...new Set(values)];
}

function resolveRequest(request, basedir, options) {
  const extensions = dedupe(ensureArray(options.extensions).concat(DEFAULT_EXTENSIONS));
  const aliasMatch = resolveAlias(request, options);
  if (aliasMatch) {
    return aliasMatch;
  }

  if (path.isAbsolute(request)) {
    const resolved = resolveWithExtensions(request, extensions);
    if (resolved) {
      return resolved;
    }
  }

  if (request.startsWith('./') || request.startsWith('../')) {
    const resolved = resolveWithExtensions(path.resolve(basedir, request), extensions);
    if (resolved) {
      return resolved;
    }
  }

  return require.resolve(request, {
    paths: [basedir, ...ensureArray(options.modules), ...ensureArray(options.roots)],
  });
}

class ResolverFactory {
  constructor(options = {}) {
    this.options = options;
  }

  clearCache() {}

  cloneWithOptions(nextOptions) {
    return new ResolverFactory({
      ...this.options,
      ...nextOptions,
    });
  }

  sync(basedir, request) {
    try {
      return { path: resolveRequest(request, basedir, this.options) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  async async(basedir, request) {
    return this.sync(basedir, request);
  }
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'unrs-resolver') {
    return { ResolverFactory };
  }
  return originalLoad.call(this, request, parent, isMain);
};
