const ENCRYPTION_ALGORITHM = "AES-GCM-256" as const;
const AES_GCM = "AES-GCM";
const IV_LENGTH_BYTES = 12;

export interface EncryptedFileResult {
    file: File;
    key: CryptoKey;
    keyBase64Url: string;
    ivBase64Url: string;
    algorithm: typeof ENCRYPTION_ALGORITHM;
    originalSize: number;
    encryptedSize: number;
}

export interface DecryptFileInput {
    encryptedBlob: Blob;
    keyBase64Url: string;
    ivBase64Url: string;
    filename: string;
    mimeType: string;
}

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
    const binary = String.fromCharCode(...bytes);
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
    const base64 = value
        .replaceAll("-", "+")
        .replaceAll("_", "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");

    const binary = atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(new ArrayBuffer(length));
    crypto.getRandomValues(bytes);
    return bytes;
}

export async function generateEncryptionKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        {
            name: AES_GCM,
            length: 256,
        },
        true,
        ["encrypt", "decrypt"],
    );
}

export async function exportKeyToBase64Url(key: CryptoKey): Promise<string> {
    const rawKey = await crypto.subtle.exportKey("raw", key);
    return bytesToBase64Url(new Uint8Array(rawKey));
}

export async function importKeyFromBase64Url(
    keyBase64Url: string,
): Promise<CryptoKey> {
    const rawKey = base64UrlToBytes(keyBase64Url);

    return crypto.subtle.importKey(
        "raw",
        rawKey,
        {
            name: AES_GCM,
            length: 256,
        },
        true,
        ["decrypt"],
    );
}

export async function encryptFile(file: File): Promise<EncryptedFileResult> {
    const key = await generateEncryptionKey();
    const keyBase64Url = await exportKeyToBase64Url(key);

    const iv = randomBytes(IV_LENGTH_BYTES);

    const plaintext = await file.arrayBuffer();

    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: AES_GCM,
            iv,
        },
        key,
        plaintext,
    );

    const encryptedFile = new File([encryptedBuffer], file.name, {
        type: "application/octet-stream",
    });

    return {
        file: encryptedFile,
        key,
        keyBase64Url,
        ivBase64Url: bytesToBase64Url(iv),
        algorithm: ENCRYPTION_ALGORITHM,
        originalSize: file.size,
        encryptedSize: encryptedFile.size,
    };
}

export async function decryptFile({
    encryptedBlob,
    keyBase64Url,
    ivBase64Url,
    filename,
    mimeType,
}: DecryptFileInput): Promise<File> {
    const key = await importKeyFromBase64Url(keyBase64Url);
    const iv = base64UrlToBytes(ivBase64Url);
    const encryptedBuffer = await encryptedBlob.arrayBuffer();

    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: AES_GCM,
            iv,
        },
        key,
        encryptedBuffer,
    );

    return new File([decryptedBuffer], filename, {
        type: mimeType || "application/octet-stream",
    });
}
