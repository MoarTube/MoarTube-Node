import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';
export default defineConfig({ ...base, test: { ...base.test, globalSetup: [], coverage: { enabled: false }, include: ['tests/unit/config/paths.test.ts', 'tests/unit/clean-startup.test.ts'] } });
