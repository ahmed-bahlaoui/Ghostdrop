import { send } from "./send.js";
import { receive } from "./receive.js";
import { select } from "@inquirer/prompts";

export async function menu(): Promise<void> {
	console.log(`
   ======= GhostDrop CLI =======
  Anonymous, temporary, encrypted file sharing
  Built with ❤️  and a lot of ☕ by https://ghostdrop.app
`);

	while (true) {
		const action = await select({
			message: "What would you like to do?",
			choices: [
				{
					name: "Send a file",
					value: "send" as const,
					description: "Upload a file and get a transfer code",
				},
				{
					name: "Receive a file",
					value: "receive" as const,
					description: "Download a file using a transfer code",
				},
				{
					name: "Quit",
					value: "quit" as const,
				},
			],
		});

		if (action === "send") {
			await send();
			console.log();
		} else if (action === "receive") {
			await receive();
			console.log();
		} else {
			console.log("Goodbye!");
			break;
		}
	}
}
