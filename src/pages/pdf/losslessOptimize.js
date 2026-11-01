import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from "pdf-lib";

// Rewriting invalidates signatures, so refuse signed and signature-capable documents.
function hasSignature(document) {
    const seen = new Set();
    const inspect = (object) => {
        if (!object || seen.has(object)) return false;
        seen.add(object);
        if (object instanceof PDFStream) return inspect(object.dict);
        if (object instanceof PDFArray) return object.asArray().some(inspect);
        if (!(object instanceof PDFDict)) return false;
        if (object.get(PDFName.of("ByteRange")) ||
            object.get(PDFName.of("FT")) === PDFName.of("Sig") ||
            object.get(PDFName.of("Type")) === PDFName.of("Sig") ||
            object.get(PDFName.of("DocMDP"))) return true;
        return object.entries().some(([, value]) => inspect(value));
    };
    return document.context.enumerateIndirectObjects().some(([, object]) => inspect(object));
}

export async function optimizeLosslessly(file) {
    const original = new Uint8Array(await file.arrayBuffer());
    const document = await PDFDocument.load(original, { updateMetadata: false });
    if (hasSignature(document)) throw new Error("Lossless optimization cannot rewrite a PDF containing signature fields or signatures. Keep the original file.");
    const optimized = await document.save({ useObjectStreams: true, updateFieldAppearances: false, addDefaultPage: false });
    return {
        bytes: optimized.byteLength < original.byteLength ? optimized : original,
        originalSize: original.byteLength,
        keptOriginal: optimized.byteLength >= original.byteLength,
    };
}
