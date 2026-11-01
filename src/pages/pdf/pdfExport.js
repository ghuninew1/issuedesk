import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { toPdfGeometry } from "./editorCoordinates";

export async function createPdf(pages, sources) {
    const output = await PDFDocument.create();
    const loaded = new Map();
    let font;
    for (const page of pages) {
        const sourceEntry = sources.get(page.sourceId);
        let source = loaded.get(page.sourceId);
        if (!source) {
            source = await PDFDocument.load(await sourceEntry.file.arrayBuffer());
            loaded.set(page.sourceId, source);
        }
        const [copy] = await output.copyPages(source, [page.index]);
        copy.setRotation(degrees((copy.getRotation().angle + page.rotation + 360) % 360));
        output.addPage(copy);
        if (!page.objects?.length) continue;
        const pdfPage = await sourceEntry.document.getPage(page.index + 1);
        for (const item of page.objects) {
            const viewport = pdfPage.getViewport({ scale: 1, rotation: item.rotation });
            const box = toPdfGeometry(item, viewport);
            if (!Number.isFinite(box.x + box.y + box.width + box.height) || box.width <= 0 || box.height <= 0) throw new Error("An editor item has invalid dimensions.");
            const options = { x: box.x, y: box.y, width: box.width, height: box.height, rotate: degrees(box.angle) };
            if (item.type === "whiteout") copy.drawRectangle({ ...options, color: rgb(1, 1, 1) });
            else if (item.type === "image") {
                const bytes = await item.file.arrayBuffer();
                const image = item.file.type === "image/png" ? await output.embedPng(bytes) : await output.embedJpg(bytes);
                copy.drawImage(image, options);
            } else if (item.type === "text") {
                if (!font) font = await output.embedFont(StandardFonts.Helvetica);
                const hex = item.color.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
                if (!hex || !Number.isFinite(item.fontSize)) throw new Error("Invalid text formatting.");
                const color = rgb(...hex.slice(1).map((value) => parseInt(value, 16) / 255));
                if (font.widthOfTextAtSize(item.text, item.fontSize) > box.width || item.fontSize > box.height) throw new Error("Text does not fit the text box.");
                const radians = box.angle * Math.PI / 180;
                const offset = Math.max(0, box.height - item.fontSize * 0.8);
                copy.drawText(item.text, { x: box.x - Math.sin(radians) * offset, y: box.y + Math.cos(radians) * offset, size: item.fontSize, font, color, rotate: degrees(box.angle), maxWidth: box.width });
            } else throw new Error("Unsupported editor item.");
        }
    }
    return output.save();
}
