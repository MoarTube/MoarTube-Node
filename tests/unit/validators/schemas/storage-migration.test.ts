import { expect, it } from 'vitest';
import { storageMigrationSchema } from '@/validators/storage-migration.js';
const credentials = { accessKeyId: 'access', secretAccessKey: 'secret' };
it.each([
  {},
  { endpoint: '', credentials: { ...credentials, sessionToken: '' } },
  {
    region: 'eu-west-1',
    forcePathStyle: false,
    endpoint: 'https://s3.example.test///',
    credentials: { ...credentials, sessionToken: 'session' },
  },
])(
  'normalizes optional S3 connection settings without losing temporary credentials %j',
  (provider) => {
    const input = { bucketName: ' bucket ', s3ProviderClientConfig: { credentials, ...provider } };
    const result = storageMigrationSchema.parse({
      direction: 'filesystem-to-s3',
      destination: input,
    });
    expect(result.direction).toBe('filesystem-to-s3');
    if (result.direction !== 'filesystem-to-s3') throw new Error('Wrong direction');
    expect(result.destination.bucketName).toBe('bucket');
    expect(result.destination.s3ProviderClientConfig.region).toBe(provider.region ?? 'us-east-1');
    expect(result.destination.s3ProviderClientConfig.forcePathStyle).toBe(
      provider.forcePathStyle ?? true
    );
    expect(result.destination.s3ProviderClientConfig.endpoint).toBe(
      provider.endpoint ? 'https://s3.example.test' : undefined
    );
    expect(result.destination.s3ProviderClientConfig.credentials.sessionToken).toBe(
      provider.credentials?.sessionToken || undefined
    );
  }
);
it('requires complete store configuration and a known direction', () => {
  expect(storageMigrationSchema.safeParse({ direction: 'unknown' }).success).toBe(false);
  expect(storageMigrationSchema.safeParse({ direction: 's3-to-s3', source: {} }).success).toBe(
    false
  );
});
