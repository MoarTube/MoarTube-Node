import { expect, it } from 'vitest';
import { storageConfigToggleBodySchema } from '@/validators/schemas/settings.js';

it('keeps custom S3 endpoints and temporary credential tokens when switching storage', () => {
  const body = {
    storageConfig: {
      storageMode: 's3provider',
      s3Config: {
        bucketName: 'destination',
        s3ProviderClientConfig: {
          endpoint: 'http://127.0.0.1:9000',
          region: 'us-east-1',
          forcePathStyle: true,
          credentials: {
            accessKeyId: 'test-access',
            secretAccessKey: 'test-secret',
            sessionToken: 'test-session',
          },
        },
      },
    },
  };
  expect(storageConfigToggleBodySchema.parse(body)).toEqual(body);
});
