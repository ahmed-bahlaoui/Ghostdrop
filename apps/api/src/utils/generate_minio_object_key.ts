// this utility function generates a unique object key for storing files in a storage service (like AWS S3 or Google Cloud Storage).

import { randomBytes } from "crypto";
import minio from "../services/storage.ts";
import { v4 as uuidv4 } from 'uuid';


function generateObjectKey(originalFilename: string, folder: string = 'uploads'): string {
    const fileExtension = originalFilename.split('.').pop();
    const uniqueId = uuidv4();
    // Example format: uploads/123e4567-e89b-12d3-a456-426614174000.jpg
    return `${folder}/${uniqueId}.${fileExtension}`;
}

const filename = "user-profile.jpg";
const objectKey = generateObjectKey(filename);
console.log(objectKey); 