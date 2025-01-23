const {
    S3Client, ListObjectsV2Command
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

module.exports = {
    s3_listObjectsWithPrefix
}