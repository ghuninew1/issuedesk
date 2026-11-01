import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from "@tailwindcss/vite";

// Pages limits individual assets to 25 MiB. Split the FFmpeg binary in production;
// the converter joins the chunks locally before starting the worker.
function splitFFmpegWasm() {
    return {
        name: "split-ffmpeg-wasm",
        generateBundle(_, bundle) {
            const entry = Object.entries(bundle).find(([name]) => /ffmpeg-core.*\.wasm$/.test(name));
            if (!entry) return;
            const [name, asset] = entry;
            const data = Buffer.from(asset.source);
            const parts = [data.subarray(0, 16 * 1024 * 1024), data.subarray(16 * 1024 * 1024)];
            const names = parts.map((part, index) => {
                const fileName = `${name}.part${index}`;
                this.emitFile({ type: "asset", fileName, source: part });
                return fileName;
            });
            for (const output of Object.values(bundle)) {
                if (output.type === "chunk" && output.code.includes(name)) {
                    output.code = output.code.replace("`/" + name + "`", JSON.stringify(names.map((part) => `/${part}`)));
                }
            }
            delete bundle[name];
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss(), splitFFmpegWasm()],
    server: {
        open: true,
        host: true,
    },
    build: {
        chunkSizeWarningLimit: 2048,
    },
});
