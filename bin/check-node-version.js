// Keep this dependency-free so unsupported runtimes fail before loading the app.
{
  const minimum = [24, 22, 1];
  const current = process.versions.node;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  const parts = match ? match.slice(1).map(Number) : [];
  let supported = parts.length === minimum.length;

  if (supported) {
    for (let index = 0; index < minimum.length; index += 1) {
      if (parts[index] !== minimum[index]) {
        supported = parts[index] > minimum[index];
        break;
      }
    }
  }

  if (!supported) {
    console.error(`MoarTube requires Node.js 24.22.1 or newer. Current: ${current}`);
    process.exit(1);
  }
}
