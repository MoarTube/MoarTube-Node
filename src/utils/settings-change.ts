import Database from 'better-sqlite3';

/** OS-backed writer lock: released automatically on process death; no PID-file reclamation. */
export async function withSettingsChange<T>(
  settingsPath: string,
  operation: () => Promise<T>
): Promise<T> {
  const lock = new Database(settingsPath + '.change-lock.sqlite', { timeout: 0 });
  try {
    try {
      lock.exec('BEGIN IMMEDIATE');
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_BUSY') {
        throw new Error('Another settings change or job admission is in progress.');
      }
      throw error;
    }
    return await operation();
  } finally {
    // Closing rolls back the empty transaction and releases its OS lock, even after failure.
    lock.close();
  }
}
