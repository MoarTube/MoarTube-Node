const {
    S3Client, ListObjectsV2Command, GetObjectCommand
} = require('@aws-sdk/client-s3');

async function s3_listObjectsWithPrefix(s3Config, prefix) {
    const bucketName = s3Config.bucketName;
    const s3ProviderClientConfig = s3Config.s3ProviderClientConfig;

    try {
        const s3Client = new S3Client(s3ProviderClientConfig);

        let isTruncated = true;
        let continuationToken = null;

        let keys = [];
        while (isTruncated) {
            const listResponse = await s3Client.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, ContinuationToken: continuationToken }));

            if (listResponse.Contents != null) {
                keys = keys.concat(listResponse.Contents.map((object) => (object.Key)));
            }

            isTruncated = listResponse.IsTruncated;
            continuationToken = listResponse.NextContinuationToken;
        }

        return keys;
    }
    catch (error) {
        throw error;
    }
}

async function s3_getObjectBuffer(s3Config, key) {
    const bucketName = s3Config.bucketName;
    const s3ProviderClientConfig = s3Config.s3ProviderClientConfig;

    try {
        const s3Client = new S3Client(s3ProviderClientConfig);

        const command = new GetObjectCommand({Bucket: bucketName, Key: key});

        const response = await s3Client.send(command);

        const objectBuffer = await streamToBuffer(response.Body);

        return objectBuffer;
    }
    catch (error) {
        throw error;
    }
}

async function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

module.exports = {
    s3_listObjectsWithPrefix,
    s3_getObjectBuffer
}