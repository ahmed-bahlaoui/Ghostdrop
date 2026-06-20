import type { SharedFileRecord } from "./state.svelte.js";
import { selectFiles, state } from "./state.svelte.js";

const shareTargetDbName = "ghostdrop-share-target";
const shareTargetStore = "shares";
const shareTargetKey = "latest";

function clearShareTargetParams() {
	const url = new URL(window.location.href);
	url.searchParams.delete("shared");
	url.searchParams.delete("ignored");
	url.searchParams.delete("files");
	window.history.replaceState(
		{},
		document.title,
		`${url.pathname}${url.search}${url.hash}`,
	);
}

function openShareTargetDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(shareTargetDbName, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(shareTargetStore, { keyPath: "id" });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function consumeSharedFileRecord(): Promise<SharedFileRecord | null> {
	const db = await openShareTargetDb();
	try {
		const record = await new Promise<SharedFileRecord | undefined>(
			(resolve, reject) => {
				const transaction = db.transaction(shareTargetStore, "readwrite");
				const store = transaction.objectStore(shareTargetStore);
				const getRequest = store.get(shareTargetKey);

				getRequest.onsuccess = () => {
					const value = getRequest.result as SharedFileRecord | undefined;
					if (value) store.delete(shareTargetKey);
					resolve(value);
				};
				getRequest.onerror = () => reject(getRequest.error);
				transaction.onerror = () => reject(transaction.error);
			},
		);
		return record ?? null;
	} finally {
		db.close();
	}
}

export async function loadSharedFileFromAndroid() {
	try {
		const record = await consumeSharedFileRecord();
		const sharedFiles = record?.files ?? (record?.file ? [record.file] : []);

		if (sharedFiles.length === 0) {
			state.status = {
				type: "error",
				message: "No shared file was received from Android",
			};
			clearShareTargetParams();
			return;
		}

		selectFiles(sharedFiles);
		state.status = {
			type: "success",
			message:
				sharedFiles.length > 1
					? `${sharedFiles.length} shared files loaded. GhostDrop will send them as one ZIP archive.`
					: "Shared file loaded. Review the options, then send.",
		};
	} catch (err: unknown) {
		console.error("Android share target error:", err);
		state.status = {
			type: "error",
			message:
				err instanceof Error ? err.message : "Could not load the shared file",
		};
	} finally {
		clearShareTargetParams();
	}
}
