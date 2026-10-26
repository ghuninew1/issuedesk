let worker = null;
let workerRequestId = 0;
const pendingRequests = new Map();

export function calculateResize({ originalWidth, originalHeight, targetWidth, targetHeight, keepAspectRatio = true }) {
    const width = Number(targetWidth) || null;
    const height = Number(targetHeight) || null;

    if (!width && !height) {
        return {
            width: originalWidth,
            height: originalHeight,
        };
    }

    if (!keepAspectRatio) {
        return {
            width: width || originalWidth,
            height: height || originalHeight,
        };
    }

    const aspectRatio = originalWidth / originalHeight;

    if (width && !height) {
        return {
            width,
            height: Math.round(width / aspectRatio),
        };
    }

    if (!width && height) {
        return {
            width: Math.round(height * aspectRatio),
            height,
        };
    }

    const widthRatio = width / originalWidth;
    const heightRatio = height / originalHeight;
    const ratio = Math.min(widthRatio, heightRatio);

    return {
        width: Math.round(originalWidth * ratio),
        height: Math.round(originalHeight * ratio),
    };
}


function getWorker() {
    if (worker) {
        return worker;
    }

    worker = new Worker(new URL("../workers/image.worker.js", import.meta.url), {
        type: "module",
    });

    worker.onmessage = (event) => {
        const { type, id, buffer, error } = event.data;

        const request = pendingRequests.get(id);

        if (!request) {
            return;
        }

        pendingRequests.delete(id);

        if (type === "encode-complete") {
            request.resolve(
                new Blob([buffer], {
                    type: request.mimeType,
                }),
            );

            return;
        }

        if (type === "encode-error") {
            request.reject(new Error(error));
        }
    };

    worker.onerror = (error) => {
        for (const request of pendingRequests.values()) {
            request.reject(error);
        }

        pendingRequests.clear();
        worker.terminate();
        worker = null;
    };

    return worker;
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Failed to load image: ${file.name}`));
        };

        image.src = url;
    });
}

function imageToImageData(image, width, height) {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
        throw new Error("Canvas 2D context is not available");
    }

    context.drawImage(image, 0, 0, width, height);

    return context.getImageData(0, 0, width, height);
}

function encodeImage(type, imageData, quality, mimeType) {
    const id = ++workerRequestId;

    return new Promise((resolve, reject) => {
        pendingRequests.set(id, {
            resolve,
            reject,
            mimeType,
        });

        getWorker().postMessage({
            type,
            id,
            imageData,
            quality,
        });
    });
}

export async function convertToAvif(file, options = {}) {
    return convertImage(file, {
        ...options,
        format: "avif",
    });
}

export async function convertToWebp(file, options = {}) {
    return convertImage(file, {
        ...options,
        format: "webp",
    });
}

export async function convertToJpeg(file, options = {}) {
    return convertImage(file, {
        ...options,
        format: "jpeg",
    });
}

export async function convertToPng(file, options = {}) {
    return convertImage(file, {
        ...options,
        format: "png",
    });
}

async function convertImage(file, options) {
    const image = await loadImage(file);

    const size = calculateResize({
        originalWidth: image.naturalWidth,
        originalHeight: image.naturalHeight,
        targetWidth: options.width,
        targetHeight: options.height,
        keepAspectRatio: options.keepAspectRatio,
    });

    const imageData = imageToImageData(image, size.width, size.height);

    if (options.format === "avif") {
        const blob = await encodeImage(
            "encode-avif",
            imageData,
            options.quality ?? 85,
            "image/avif",
        );

        return {
            blob,
            width: size.width,
            height: size.height,
        }
    }

    if (options.format === "webp") {
        const blob = await encodeImage(
            "encode-webp",
            imageData,
            options.quality ?? 85,
            "image/webp",
        );

        return {
            blob,
            width: size.width,
            height: size.height,
        }
    }

    if (options.format === "jpeg") {
        const blob = await encodeImage(
            "encode-jpeg",
            imageData,
            options.quality ?? 85,
            "image/jpeg",
        );

        return {
            blob,
            width: size.width,
            height: size.height,
        }
    }

    if (options.format === "png") {
        const blob = await encodeImage(
            "encode-png",
            imageData,
            null,
            "image/png",
        );

        return {
            blob,
            width: size.width,
            height: size.height,
        }
    }
    // if (options.format === "avif") {
    //     return encodeImage("encode-avif", imageData, options.quality ?? 85, "image/avif");
    // }

    // if (options.format === "webp") {
    //     return encodeImage("encode-webp", imageData, options.quality ?? 85, "image/webp");
    // }

    // if (options.format === "jpeg") {
    //     return encodeImage("encode-jpeg", imageData, options.quality ?? 85, "image/jpeg");
    // }

    // if (options.format === "png") {
    //     return encodeImage("encode-png", imageData, null, "image/png");
    // }



    throw new Error(`Unsupported output format: ${options.format}`);
}

export function cancelImageConversion() {
    if (!worker) {
        return;
    }

    worker.terminate();
    worker = null;

    for (const request of pendingRequests.values()) {
        request.reject(new Error("Image conversion cancelled"));
    }

    pendingRequests.clear();
}