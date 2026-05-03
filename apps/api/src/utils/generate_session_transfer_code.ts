// Charset: base28 - no ambiguous chars
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes)
        .map(b => CHARSET[b % CHARSET.length])
        .join('')
        .replace(/(.{3})/, '$1-'); // "K7M-X9Q"
}


for (let index = 0; index < 10; index++) {
    console.log(generateCode());
    
}