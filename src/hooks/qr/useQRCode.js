import { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import { downloadName } from "../../../shared/qr";
function logoImage(source, background, opaque) {
    if (!source) return Promise.resolve("");
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext("2d");
            if (opaque) {
                ctx.fillStyle = background;
                ctx.fillRect(0, 0, 512, 512);
            }
            const scale = Math.min(464 / image.width, 464 / image.height);
            ctx.drawImage(
                image,
                (512 - image.width * scale) / 2,
                (512 - image.height * scale) / 2,
                image.width * scale,
                image.height * scale,
            );
            resolve(canvas.toDataURL("image/png"));
        };
        image.onerror = () => reject(new Error("Logo could not be loaded. Remove it or select another image."));
        image.src = source;
    });
}
export function useQRCode(value, design) {
    const containerRef = useRef(null),
        instanceRef = useRef(null);
    const [status, setStatus] = useState({ key: "", error: "", ready: false });
    const key = JSON.stringify([value, design]);
    useEffect(() => {
        let cancelled = false;
        const container = containerRef.current;
        if (!value) {
            container?.replaceChildren();
            return;
        }
        Promise.resolve()
            .then(async () => {
                const image = await logoImage(design.logo, design.background, design.logoBackground);
                if (cancelled) return;
                if (!instanceRef.current)
                    instanceRef.current = new QRCodeStyling({ width: 1024, height: 1024, type: "svg" });
                const instance = instanceRef.current;
                // qrcode-generator's Byte mode expects a byte string, not UTF-16 text.
                const bytes = Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join("");
                instance.update({
                    data: bytes,
                    image,
                    margin: 48,
                    qrOptions: { errorCorrectionLevel: design.errorCorrection, mode: "Byte" },
                    dotsOptions: { color: design.foreground, type: "square" },
                    backgroundOptions: { color: design.background },
                    imageOptions: {
                        imageSize: design.logoSize,
                        margin: 0,
                        hideBackgroundDots: design.logoBackground,
                        saveAsBlob: true,
                    },
                });
                const blob = await instance.getRawData("svg");
                if (cancelled) return;
                const source = await blob.text();
                if (cancelled) return;
                const svg = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
                container?.replaceChildren(document.importNode(svg, true));
                setStatus({ key, error: "", ready: true });
            })
            .catch((error) => {
                if (!cancelled) {
                    container?.replaceChildren();
                    setStatus({
                        key,
                        error:
                            error instanceof Error
                                ? error.message
                                : "Content exceeds QR capacity. Try shorter text or lower error correction.",
                        ready: false,
                    });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [value, design, key]);
    const ready = status.key === key && status.ready && !!value;
    async function download(name, extension) {
        if (!ready) return;
        const blob = await instanceRef.current.getRawData(extension);
        const url = URL.createObjectURL(blob),
            anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${downloadName(name)}.${extension}`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return { containerRef, ready, error: status.key === key ? status.error : "", download };
}
