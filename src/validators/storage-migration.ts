import { z } from 'zod';

const s3Config = z
  .object({
    bucketName: z.string().trim().min(1),
    s3ProviderClientConfig: z.object({
      region: z.string().optional(),
      endpoint: z.string().optional(),
      forcePathStyle: z.boolean().optional(),
      credentials: z.object({
        accessKeyId: z.string().min(1),
        secretAccessKey: z.string().min(1),
        sessionToken: z.string().optional(),
      }),
    }),
  })
  .transform(({ bucketName, s3ProviderClientConfig: config }) => ({
    bucketName,
    s3ProviderClientConfig: {
      region: config.region ?? 'us-east-1',
      forcePathStyle: config.forcePathStyle ?? true,
      ...(config.endpoint !== undefined && config.endpoint !== ''
        ? { endpoint: config.endpoint.replace(/\/+$/, '') }
        : {}),
      credentials: {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
        ...(config.credentials.sessionToken !== undefined && config.credentials.sessionToken !== ''
          ? { sessionToken: config.credentials.sessionToken }
          : {}),
      },
    },
  }));

export const storageMigrationSchema = z.discriminatedUnion('direction', [
  z.object({ direction: z.literal('filesystem-to-s3'), destination: s3Config }),
  z.object({ direction: z.literal('s3-to-s3'), source: s3Config, destination: s3Config }),
  z.object({ direction: z.literal('s3-to-filesystem'), source: s3Config }),
]);

export type StorageMigration = z.infer<typeof storageMigrationSchema>;
