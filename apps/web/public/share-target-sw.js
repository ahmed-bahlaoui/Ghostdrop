const shareTargetDbName = "ghostdrop-share-target";
const shareTargetStore = "shares";
const shareTargetKey = "latest";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  if (request.method !== "POST") {
    return Response.redirect("/", 303);
  }

  try {
    const formData = await request.formData();
    const sharedFiles = formData
      .getAll("file")
      .filter((value) => value instanceof File && value.size > 0);
    const firstFile = sharedFiles[0] ?? null;

    if (firstFile) {
      await saveSharedFile({
        id: shareTargetKey,
        file: firstFile,
        ignoredFileCount: Math.max(sharedFiles.length - 1, 0),
        receivedAt: Date.now(),
      });
    }

    const params = new URLSearchParams({
      shared: firstFile ? "1" : "0",
      ignored: String(Math.max(sharedFiles.length - 1, 0)),
    });

    return Response.redirect(`/?${params.toString()}`, 303);
  } catch (error) {
    console.error("GhostDrop share target failed:", error);
    return Response.redirect("/?shared=0", 303);
  }
}

function openShareTargetDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(shareTargetDbName, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(shareTargetStore, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSharedFile(record) {
  const db = await openShareTargetDb();

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(shareTargetStore, "readwrite");
    transaction.objectStore(shareTargetStore).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}
