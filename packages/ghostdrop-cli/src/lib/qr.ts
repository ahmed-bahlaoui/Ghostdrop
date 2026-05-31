import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const qrcode = nodeRequire("qrcode-terminal") as {
	generate: (
		url: string,
		opts?: { small: boolean },
		cb?: (output: string) => void,
	) => void;
};

export function printQrCode(url: string): void {
	qrcode.generate(url, { small: true }, (output: string) => {
		process.stdout.write(`\n${output}\n`);
	});
}
