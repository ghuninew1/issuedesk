import { encode } from "@jsquash/avif";

self.onmessage = async (event) => {
    const { type, id, imageData, quality } = event.data;

    try {
        // Handle AVIF encoding
        if (type === "encode-avif") {
            const buffer = await encode(imageData, {
                quality: quality ?? 85,
            });

            self.postMessage(
                {
                    type: "encode-complete",
                    id,
                    buffer,
                },
                [buffer],
            );

            return;
        }

        // Handle WebP encoding
        if (type === "encode-webp") {
            const canvas = new OffscreenCanvas(imageData.width, imageData.height);

            const context = canvas.getContext("2d");

            if (!context) {
                throw new Error("Canvas 2D context is not available");
            }

            context.putImageData(imageData, 0, 0);

            const blob = await canvas.convertToBlob({
                type: "image/webp",
                quality: (quality ?? 85) / 100,
            });

            const buffer = await blob.arrayBuffer();

            self.postMessage(
                {
                    type: "encode-complete",
                    id,
                    buffer,
                },
                [buffer],
            );
        }
        // Handle JPEG encoding
        if (type === "encode-jpeg") {
            const canvas = new OffscreenCanvas(imageData.width, imageData.height);

            const context = canvas.getContext("2d");

            if (!context) {
                throw new Error("Canvas 2D context is not available");
            }

            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, imageData.width, imageData.height);

            context.putImageData(imageData, 0, 0);

            const blob = await canvas.convertToBlob({
                type: "image/jpeg",
                quality: (quality ?? 85) / 100,
            });

            const buffer = await blob.arrayBuffer();

            self.postMessage(
                {
                    type: "encode-complete",
                    id,
                    buffer,
                },
                [buffer],
            );

            return;
        }

        // Handle PNG encoding
        if (type === "encode-png") {
            const canvas = new OffscreenCanvas(imageData.width, imageData.height);

            const context = canvas.getContext("2d");

            if (!context) {
                throw new Error("Canvas 2D context is not available");
            }

            context.putImageData(imageData, 0, 0);

            const blob = await canvas.convertToBlob({
                type: "image/png",
            });

            const buffer = await blob.arrayBuffer();

            self.postMessage(
                {
                    type: "encode-complete",
                    id,
                    buffer,
                },
                [buffer],
            );

            return;
        }
    } catch (error) {
        self.postMessage({
            type: "encode-error",
            id,
            error: error.message || "Image encoding failed",
        });
    }
};
