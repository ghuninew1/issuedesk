import { PDFDocument, degrees } from "pdf-lib";

export async function createPdf(pages, sources) {
    const output = await PDFDocument.create();
    const loaded = new Map();
    for (const page of pages) {
        let source = loaded.get(page.sourceId);
        if (!source) {
            source = await PDFDocument.load(await sources.get(page.sourceId).file.arrayBuffer());
            loaded.set(page.sourceId, source);
        }
        const [copy] = await output.copyPages(source, [page.index]);
        copy.setRotation(degrees((copy.getRotation().angle + page.rotation + 360) % 360));
        output.addPage(copy);
    }
    return output.save();
}
