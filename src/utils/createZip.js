import JSZip from "jszip";

function getUniqueFilename(filename, usedNames) {
    if (!usedNames.has(filename)) {
        usedNames.add(filename);
        return filename;
    }

    const extensionIndex = filename.lastIndexOf(".");

    const baseName = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;

    const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";

    let counter = 1;
    let uniqueName = `${baseName}-${counter}${extension}`;

    while (usedNames.has(uniqueName)) {
        counter += 1;
        uniqueName = `${baseName}-${counter}${extension}`;
    }

    usedNames.add(uniqueName);

    return uniqueName;
}

export async function createZip(files) {
    const zip = new JSZip();
    const usedNames = new Set();

    files.forEach(({ name, blob }) => {
        const uniqueName = getUniqueFilename(name, usedNames);

        zip.file(uniqueName, blob);
    });

    return zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: {
            level: 6,
        },
    });
}
