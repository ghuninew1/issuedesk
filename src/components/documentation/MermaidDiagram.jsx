import { useEffect, useId, useState } from "react";
import { cx } from "../../utils/cx";

export default function MermaidDiagram({ source }) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const [result, setResult] = useState(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, suppressErrorRendering: true });
                const { svg } = await mermaid.render(`diagram${id}`, source);
                if (!cancelled) setResult({ source, svg });
            } catch { if (!cancelled) setResult({ source, error: true }); }
        })();
        return () => { cancelled = true; };
    }, [id, source]);
    if (!result || result.source !== source) return <p role="status">Rendering diagram…</p>;
    if (result.error) return <div><p>Diagram could not be rendered. Source:</p><pre className={cx("overflow-auto rounded-xl bg-black/10 p-4 dark:bg-black/30")}><code>{source}</code></pre></div>;
    return <iframe title="Mermaid diagram" sandbox="" className={cx("min-h-64 w-full rounded-xl border border-border bg-white")} srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:12px}svg{max-width:100%;height:auto}</style>${result.svg}`} />;
}
