import { useState } from "react";
import { cx } from "../../utils/cx";
import GlassButton from "../GlassButton";
import { button } from "./styles";
export default function QRDownloadActions({ ready, download, name }) {
    const [error, setError] = useState(""),
        [busy, setBusy] = useState(false);
    async function save(extension) {
        setError("");
        setBusy(true);
        try {
            await download(name, extension);
        } catch {
            setError("Export failed. Please try again.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <div className={cx("flex flex-wrap justify-center gap-2")}>
                {["png", "svg"].map((extension) => (
                    <GlassButton
                        key={extension}
                        className={cx(button)}
                        disabled={!ready || busy}
                        onClick={() => save(extension)}
                    >
                        Download {extension.toUpperCase()}
                    </GlassButton>
                ))}
            </div>
            {error && (
                <p role="alert" className={cx("text-sm text-red-500")}>
                    {error}
                </p>
            )}
        </>
    );
}
