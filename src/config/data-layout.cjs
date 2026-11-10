const fs = process.getBuiltinModule('node:fs');
const os = process.getBuiltinModule('node:os');
const path = process.getBuiltinModule('node:path');
const { randomUUID } = process.getBuiltinModule('node:crypto');

function dataRoot(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? (platform === 'win32' ? os.homedir() : env.HOME);
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (env.MOARTUBE_DATA_ROOT) {
    if (!paths.isAbsolute(env.MOARTUBE_DATA_ROOT))
      throw new Error('MOARTUBE_DATA_ROOT must be absolute');
    return paths.basename(env.MOARTUBE_DATA_ROOT) === 'MoarTube'
      ? env.MOARTUBE_DATA_ROOT
      : paths.join(env.MOARTUBE_DATA_ROOT, 'MoarTube');
  }
  if (env.IS_DOCKER_ENVIRONMENT === 'true') return '/data/MoarTube';
  if (platform === 'win32' && !env.APPDATA)
    throw new Error('APPDATA environment variable is not set. Set MOARTUBE_DATA_ROOT explicitly.');
  if (platform !== 'win32' && !home)
    throw new Error('HOME environment variable is not set. Set MOARTUBE_DATA_ROOT explicitly.');
  const base =
    platform === 'win32'
      ? env.APPDATA
      : platform === 'darwin'
        ? paths.join(home, 'Library', 'Application Support')
        : env.XDG_DATA_HOME || paths.join(home, '.local', 'share');
  if (!paths.isAbsolute(base)) throw new Error('Application data directory must be absolute');
  return paths.join(base, 'MoarTube');
}

function componentDirectory(component, options = {}) {
  if (!['client', 'node'].includes(component)) throw new Error('Unknown MoarTube component');
  const env = options.env ?? process.env;
  // Preserve explicit component-directory overrides used by existing deployments
  // and isolated tests.
  if (env.MOARTUBE_DATA_DIR) {
    if (!path.isAbsolute(env.MOARTUBE_DATA_DIR))
      throw new Error('MOARTUBE_DATA_DIR must be an absolute writable directory');
    return env.MOARTUBE_DATA_DIR;
  }
  // Source and locally built CLI runs use the checkout, independent of cwd.
  if (
    component === 'node' &&
    options.projectRoot &&
    !env.MOARTUBE_DATA_ROOT &&
    env.IS_DOCKER_ENVIRONMENT !== 'true' &&
    fs.existsSync(path.join(options.projectRoot, 'src', 'moartube-node.ts'))
  ) {
    return path.resolve(options.projectRoot, 'data');
  }
  const paths =
    env.IS_DOCKER_ENVIRONMENT === 'true' && !env.MOARTUBE_DATA_ROOT
      ? path.posix
      : (options.platform ?? process.platform) === 'win32'
        ? path.win32
        : path.posix;
  return paths.join(dataRoot(options), component);
}

function desktopLayout(bundled, options = {}) {
  const path =
    (options.platform ?? process.platform) === 'win32'
      ? process.getBuiltinModule('node:path').win32
      : process.getBuiltinModule('node:path').posix;
  const root = dataRoot(options);
  const base = bundled ? path.join(root, 'client_node') : root;
  const client = path.join(base, 'client');
  return {
    root,
    base,
    client,
    node: path.join(base, 'node'),
    userData: path.join(client, 'desktop'),
  };
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

function acquireDataLock(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, '.moartube-process.lock');
  const token = randomUUID();
  let descriptor;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      descriptor = fs.openSync(file, 'wx');
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        throw new Error(
          `Data directory is locked: ${directory}. Close other MoarTube processes before retrying.`
        );
      }
      if (alive(owner.pid))
        throw new Error(`MoarTube is already using ${directory} (process ${owner.pid}).`);
      fs.unlinkSync(file);
    }
  }
  if (descriptor === undefined) throw new Error(`Could not lock ${directory}`);
  try {
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token }));
  } finally {
    fs.closeSync(descriptor);
  }
  return () => {
    try {
      if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.unlinkSync(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
}

// Startup uses only the selected data directory. Legacy folders and migration
// environment variables are deliberately ignored.
async function prepareData(component, options = {}) {
  return acquireDataLock(path.resolve(options.target ?? componentDirectory(component, options)));
}

function cleanData(component, options = {}) {
  const directory = path.resolve(componentDirectory(component, options));
  const canonical = (value) => {
    const resolved = fs.existsSync(value) ? fs.realpathSync(value) : path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  let sharedRoot;
  let defaultDirectory;
  try {
    defaultDirectory = path.resolve(
      componentDirectory(component, {
        ...options,
        env: { ...(options.env ?? process.env), MOARTUBE_DATA_DIR: undefined },
      })
    );
    sharedRoot = path.dirname(defaultDirectory);
  } catch {
    /* Explicit component paths need no default root. */
  }
  if (
    [path.parse(directory).root, os.homedir(), ...(sharedRoot ? [sharedRoot] : [])]
      .map(canonical)
      .includes(canonical(directory))
  )
    throw new Error('Refusing to clean a shared or system data root');
  const existed = fs.existsSync(directory);
  if (
    existed &&
    !fs.existsSync(path.join(directory, `_${component}_settings.json`)) &&
    (!defaultDirectory || canonical(directory) !== canonical(defaultDirectory)) &&
    fs.readdirSync(directory).length > 0
  ) {
    throw new Error(`Refusing to clean an unrecognized data directory: ${directory}`);
  }
  const release = acquireDataLock(directory);
  try {
    for (const name of fs.readdirSync(directory)) {
      if (name === '.moartube-process.lock') continue;
      const target = path.resolve(directory, name);
      if (!target.startsWith(directory + path.sep)) throw new Error('Invalid cleanup path');
      fs.rmSync(target, { recursive: true, force: true });
    }
  } finally {
    release();
  }
}

module.exports = {
  dataRoot,
  componentDirectory,
  desktopLayout,
  acquireDataLock,
  prepareData,
  cleanData,
};
