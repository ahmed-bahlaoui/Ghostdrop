import minio from "./storage.ts";

async function testConnection() {
    const BUCKET = "ghostdrop-transfers";

    // list existing buckets
    const buckets = await minio.listBuckets();
    console.log("Existing buckets:", buckets.map(b => b.name));

    // create bucket if it doesn't exist
    const exists = await minio.bucketExists(BUCKET);
    if (!exists) {
        await minio.makeBucket(BUCKET);
        console.log(`Bucket "${BUCKET}" created`);
    }

    // upload an object
    await minio.putObject(BUCKET, "hello.txt", "Hello from MinIO!");
    console.log("Object uploaded");

    // download it back
    const stream = await minio.getObject(BUCKET, "hello.txt");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    console.log("Got:", Buffer.concat(chunks).toString());
}

testConnection();
