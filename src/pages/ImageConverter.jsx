import { useState, useRef, useEffect } from "react";
import { ArrowDownToLine, Image as ImageIcon, Sparkles } from "lucide-react";
import GlassButton from "../components/GlassButton";
import DropZone from "../components/tools/DropZone";
import FileList from "../components/tools/FileList";
import ConverterSettings from "../components/tools/ConverterSettings";
import {
    cancelImageConversion,
    convertToAvif,
    convertToWebp,
    convertToJpeg,
    convertToPng,
} from "../utils/imageConverter";
import { createZip } from "../utils/createZip";
import { getImageDimensions } from "../utils/imageDimensions";
import ConversionLog from "../components/tools/ConversionLog";
import { cx } from "../utils/cx";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

function formatFileSize(bytes) {
    if (bytes === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / 1024 ** index;

    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function calculateSizeReduction(originalSize, outputSize) {
    if (!originalSize || !outputSize) {
        return 0;
    }

    return Math.round(((originalSize - outputSize) / originalSize) * 100);
}

function ImageConverter() {
    useDocumentTitle("Image Converter");
    const [files, setFiles] = useState([]);
    const [logs, setLogs] = useState([]);
    const [settings, setSettings] = useState({
        format: "avif",
        quality: 85,
        width: "",
        height: "",
        keepAspectRatio: true,
    });
    const [isConverting, setIsConverting] = useState(false);
    const [isCreatingZip, setIsCreatingZip] = useState(false);
    const [progress, setProgress] = useState(0);
    const [validationMessage, setValidationMessage] = useState("");
    const cancelRef = useRef(false);
    const filesRef = useRef(files);

    useEffect(() => {
        filesRef.current = files;
    }, [files]);

    useEffect(() => () => {
        filesRef.current.forEach((file) => URL.revokeObjectURL(file.preview));
        cancelImageConversion();
    }, []);

    const updateFileStatus = (id, status) => {
        setFiles((currentFiles) => currentFiles.map((file) => (file.id === id ? { ...file, status } : file)));
    };

    const addLog = (message, type = "info") => {
        setLogs((currentLogs) => [
            ...currentLogs,
            {
                id: crypto.randomUUID(),
                message,
                type,
            },
        ]);
    };

    const handleFiles = async (imageFiles) => {
        const newFiles = await Promise.all(
            imageFiles.map(async (file) => {
                try {
                    const dimensions = await getImageDimensions(file);

                    return {
                        id: crypto.randomUUID(),
                        file,
                        name: file.name,
                        size: file.size,
                        preview: URL.createObjectURL(file),
                        width: dimensions.width,
                        height: dimensions.height,
                        status: "waiting",
                    };
                } catch (error) {
                    console.error(`Failed to read image: ${file.name}`, error);

                    return {
                        id: crypto.randomUUID(),
                        file,
                        name: file.name,
                        size: file.size,
                        preview: URL.createObjectURL(file),
                        width: 0,
                        height: 0,
                        status: "error",
                    };
                }
            }),
        );

        setFiles((currentFiles) => [...currentFiles, ...newFiles]);
    };

    const handleRemove = (id) => {
        setFiles((currentFiles) => {
            const fileToRemove = currentFiles.find((file) => file.id === id);

            if (fileToRemove) {
                URL.revokeObjectURL(fileToRemove.preview);
            }

            return currentFiles.filter((file) => file.id !== id);
        });
    };

    const handleClear = () => {
        if (isConverting) return;
        files.forEach((file) => {
            URL.revokeObjectURL(file.preview);
        });

        setFiles([]);
    };

    const handleSettingsChange = (changes) => {
        setSettings((currentSettings) => ({
            ...currentSettings,
            ...changes,
        }));
    };

    const handleCancel = () => {
        cancelRef.current = true;
        cancelImageConversion();
        addLog("Conversion cancelled.", "warning");
        setIsConverting(false);

        setFiles((currentFiles) =>
            currentFiles.map((file) => {
                if (file.status === "waiting" || file.status === "converting") {
                    return {
                        ...file,
                        status: "cancelled",
                    };
                }

                return file;
            }),
        );
    };

    const handleConvert = async () => {
        if (files.length === 0 || isConverting) {
            return;
        }
        const width = settings.width === "" ? null : Number(settings.width);
        const height = settings.height === "" ? null : Number(settings.height);
        const quality = Number(settings.quality);
        setValidationMessage("");

        if (
            (width !== null && (!Number.isInteger(width) || width < 1)) ||
            (height !== null && (!Number.isInteger(height) || height < 1))
        ) {
            setValidationMessage("Width and height must be whole numbers greater than 0.");
            return;
        }

        if (quality < 1 || quality > 100) {
            setValidationMessage("Quality must be between 1 and 100.");
            return;
        }

        cancelRef.current = false;
        setIsConverting(true);
        setProgress(0);
        const conversionSettings = { ...settings };

        const convertedFiles = [];

        const filesToConvert = files.filter((file) => file.status !== "error");
        if (filesToConvert.length === 0) {
            setValidationMessage("No valid images are available for conversion.");
            setIsConverting(false);
            return;
        }

        let completed = 0;

        for (const file of filesToConvert) {
            if (cancelRef.current) {
                break;
            }

            updateFileStatus(file.id, "converting");
            addLog(`Converting: ${file.name}`, "info");

            try {
                const converters = {
                    avif: convertToAvif,
                    webp: convertToWebp,
                    jpeg: convertToJpeg,
                    png: convertToPng,
                };

                const convert = converters[conversionSettings.format];

                const result = await convert(file.file, {
                    quality: Number(conversionSettings.quality),
                    width: conversionSettings.width,
                    height: conversionSettings.height,
                    keepAspectRatio: conversionSettings.keepAspectRatio,
                });

                const { blob, width, height } = result;
                setFiles((currentFiles) =>
                    currentFiles.map((item) =>
                        item.id === file.id
                            ? {
                                  ...item,
                                  outputBlob: blob,
                                  outputSize: blob.size,
                                  outputWidth: width,
                                  outputHeight: height,
                                  outputFormat: conversionSettings.format,
                              }
                            : item,
                    ),
                );

                convertedFiles.push({
                    name: `${file.name.replace(/\.[^/.]+$/, "")}.${conversionSettings.format}`,
                    blob,
                });

                updateFileStatus(file.id, "done");

                const reduction = calculateSizeReduction(file.size, blob.size);

                addLog(
                    `Converted: ${file.name} → ${conversionSettings.format.toUpperCase()} | ` +
                        `${formatFileSize(file.size)} → ${formatFileSize(blob.size)} ` +
                        `(${reduction >= 0 ? "-" : "+"}${Math.abs(reduction)}%) | ` +
                        `${file.width} × ${file.height} → ${width} × ${height}`,
                    "success",
                );
            } catch (error) {
                if (cancelRef.current) {
                    updateFileStatus(file.id, "cancelled");
                    continue;
                }
                console.error(`Failed to convert: ${file.name}`, error);

                addLog(`Failed: ${file.name}`, "error");

                updateFileStatus(file.id, "error");
            }
            completed += 1;

            setProgress(Math.round((completed / filesToConvert.length) * 100));
        }

        if (!cancelRef.current && convertedFiles.length > 0) {
            setIsCreatingZip(true);

            try {
                const zipBlob = await createZip(convertedFiles);

                const url = URL.createObjectURL(zipBlob);
                const link = document.createElement("a");

                link.href = url;
                link.download = "converted-images.zip";

                document.body.appendChild(link);
                link.click();
                link.remove();

                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (error) {
                console.error("Failed to create converted image archive", error);
                setValidationMessage("Images converted, but the ZIP download could not be created.");
                addLog("Failed to create ZIP download.", "error");
            } finally {
                setIsCreatingZip(false);
            }
        }

        setIsConverting(false);
    };

    return (
        <section className={cx("mx-auto max-w-7xl animate-fadeInUp")}>
            <header className={cx("mb-6 flex flex-col gap-4 rounded-2xl p-5 glass-surface sm:flex-row sm:items-center sm:justify-between md:p-6")}>
                <div className={cx("flex items-start gap-4")}>
                    <span className={cx("flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary")}>
                        <ImageIcon className={cx("size-6")} aria-hidden="true" />
                    </span>
                    <div>
                        <h1 className={cx("text-2xl font-semibold tracking-tight md:text-3xl")}>Image Converter</h1>
                        <p className={cx("mt-1 max-w-2xl text-sm text-muted-foreground")}>
                            Convert and resize images in your browser, then download them together as a ZIP.
                        </p>
                    </div>
                </div>
                <div className={cx("flex items-center gap-2 text-xs text-muted-foreground sm:max-w-48")}>
                    <Sparkles className={cx("size-4 shrink-0 text-primary")} aria-hidden="true" />
                    <span>Your files stay on this device.</span>
                </div>
            </header>

            <DropZone onFiles={handleFiles} />

            <FileList files={files} onRemove={handleRemove} onClear={handleClear} disabled={isConverting} />

            <ConverterSettings settings={settings} onChange={handleSettingsChange} />
            {validationMessage && (
                <p className={cx("mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive")} role="alert">
                    {validationMessage}
                </p>
            )}
            {isConverting && (
                <div className={cx("glass-surface mt-6 rounded-2xl p-5 md:p-6")}>
                    <div className={cx("flex items-center justify-between gap-4")}>
                        <span className={cx("font-medium text-sm")}>
                            {isCreatingZip ? "Creating ZIP..." : "Converting..."}
                        </span>

                        <span className={cx("text-sm tabular-nums text-muted-foreground")}>{progress}%</span>
                    </div>

                    <div
                        className={cx("mt-3 h-2 overflow-hidden rounded-full bg-muted")}
                        role="progressbar"
                        aria-label="Conversion progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                    >
                        <div
                            className={cx("h-full rounded-full bg-primary transition-all")}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {isConverting ? (
                <GlassButton
                    type="button"
                    onClick={handleCancel}
                    disabled={isCreatingZip}
                    className={cx("mt-6 w-full rounded-xl border border-destructive/30 px-5 py-3 font-medium text-destructive hover:bg-destructive/10")}
                >
                    {isCreatingZip ? "Creating ZIP..." : "Cancel Conversion"}
                </GlassButton>
            ) : (
                <GlassButton
                    type="button"
                    onClick={handleConvert}
                    disabled={files.length === 0}
                    className={cx("mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50")}
                >
                    <ArrowDownToLine className={cx("size-4")} aria-hidden="true" />
                    Convert to {settings.format.toUpperCase()} ({files.length} image{files.length > 1 ? "s" : ""})
                </GlassButton>
            )}
            <ConversionLog logs={logs} onClear={() => setLogs([])} />
        </section>
    );
}

export default ImageConverter;
