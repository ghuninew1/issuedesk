import { optimizeLosslessly } from "./losslessOptimize";

self.onmessage = async ({ data }) => {
    try {
        const result = await optimizeLosslessly(data.file);
        self.postMessage({ type: "result", ...result }, [result.bytes.buffer]);
    } catch (error) {
        self.postMessage({ type: "error", message: error.message || "Lossless optimization failed." });
    }
};
