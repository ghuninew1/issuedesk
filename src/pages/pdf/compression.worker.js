import { PDFDocument, degrees } from "pdf-lib";

let output;
self.onmessage = async ({ data }) => {
    try {
        if (data.type === "baseline") {
            const baseline = await PDFDocument.create();
            const documents = new Map();
            for (const entry of data.pages) {
                let source = documents.get(entry.sourceId);
                if (!source) {
                    source = await PDFDocument.load(await data.files.find((file) => file.id === entry.sourceId).file.arrayBuffer());
                    documents.set(entry.sourceId, source);
                }
                const [page] = await baseline.copyPages(source, [entry.index]);
                page.setRotation(degrees((page.getRotation().angle + entry.rotation + 360) % 360));
                baseline.addPage(page);
            }
            self.postMessage({ type: "baseline", size: (await baseline.save()).byteLength });
        } else if (data.type === "start") {
            output = await PDFDocument.create();
            self.postMessage({ type: "ready" });
        } else if (data.type === "page") {
            const { bitmap, width, height, quality } = data;
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            try {
                const context = canvas.getContext("2d", { alpha: false });
                context.fillStyle = "white";
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(bitmap, 0, 0);
                const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
                const image = await output.embedJpg(await blob.arrayBuffer());
                const page = output.addPage([width, height]);
                page.drawImage(image, { x: 0, y: 0, width, height });
            } finally {
                bitmap.close();
                canvas.width = 0;
                canvas.height = 0;
            }
            self.postMessage({ type: "ready" });
        } else if (data.type === "finish") {
            const bytes = await output.save();
            output = null;
            self.postMessage({ type: "result", bytes }, [bytes.buffer]);
        }
    } catch (error) {
        output = null;
        self.postMessage({ type: "error", message: error.message || "Compression failed." });
    }
};
