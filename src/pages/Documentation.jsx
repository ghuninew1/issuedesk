import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, FileText, PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";
import GlassButton from "../components/GlassButton";
import MermaidDiagram from "../components/documentation/MermaidDiagram";
import { assetUrl, resolveDocLink } from "../components/documentation/paths";
import { api } from "../utils/api";
import { cx } from "../utils/cx";
import "./documentation.css";

export default function Documentation() {
    const [params, setParams] = useSearchParams();
    const requested = params.get("path");
    const [libraryExpanded, setLibraryExpanded] = useState(true);
    const [tree, setTree] = useState({ loading: true });
    const [doc, setDoc] = useState({});
    const [treeRetry, setTreeRetry] = useState(0);
    const [docRetry, setDocRetry] = useState(0);
    useEffect(() => {
        let active = true;
        api("/api/docs/tree").then((data) => { if (active) setTree({ data }); }).catch(() => { if (active) setTree({ error: true }); });
        return () => { active = false; };
    }, [treeRetry]);
    const files = useMemo(() => (tree.data?.entries || []).filter((entry) => /\.md$/i.test(entry.path)).sort((a, b) => a.path.localeCompare(b.path)), [tree.data]);
    const path = requested || files.find((entry) => entry.path === "README.md")?.path || files[0]?.path;
    useEffect(() => {
        if (!path || !tree.data) return;
        let active = true;
        api(`/api/docs/content?path=${encodeURIComponent(path)}`).then((data) => { if (active) setDoc({ path, data }); }).catch(() => { if (active) setDoc({ path, error: true }); });
        return () => { active = false; };
    }, [path, tree.data, docRetry]);
    const navigate = (target) => setParams({ path: target });
    const groups = useMemo(() => files.reduce((acc, file) => {
        const group = file.path.includes("/") ? file.path.split("/")[0] : "Overview";
        (acc[group] ||= []).push(file.path); return acc;
    }, {}), [files]);
    const entries = useMemo(() => new Set((tree.data?.entries || []).map((entry) => entry.path)), [tree.data]);
    const loadingDoc = path && (doc.path !== path || (!doc.data && !doc.error));
    const components = {
        a({ href, children }) {
            const resolved = resolveDocLink(path, href);
            if (resolved && entries.has(resolved.path) && /\.md$/i.test(resolved.path)) return <a href={`?path=${encodeURIComponent(resolved.path)}${resolved.fragment ? `#${resolved.fragment}` : ""}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !resolved.fragment) { event.preventDefault(); navigate(resolved.path); } }}>{children}</a>;
            if (resolved && entries.has(resolved.path) && /\.(png|svg)$/i.test(resolved.path)) return <a href={assetUrl(resolved.path)} download>{children}</a>;
            if (/^https?:\/\//i.test(href || "")) return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
            return <span>{children}</span>;
        },
        img({ src, alt }) {
            const resolved = resolveDocLink(path, src);
            if (!resolved || !entries.has(resolved.path)) return <span>Image unavailable: {alt}</span>;
            if (/\.png$/i.test(resolved.path)) return <img src={assetUrl(resolved.path)} alt={alt || ""} loading="lazy" />;
            if (/\.svg$/i.test(resolved.path)) return <a href={assetUrl(resolved.path)} download>Download SVG: {alt || resolved.path.split("/").pop()}</a>;
            return <span>Image unavailable: {alt}</span>;
        },
        pre({ children, node }) {
            const code = node?.children?.[0];
            if (code?.tagName === "code" && code.properties?.className?.includes("language-mermaid")) return <MermaidDiagram source={code.children?.map((child) => child.value || "").join("") || ""} />;
            return <pre>{children}</pre>;
        },
    };
    return <div className={cx("mx-auto max-w-7xl animate-fadeInUp")}>
        <header className={cx("mb-6 flex flex-wrap items-end justify-between gap-4")}><div><p className={cx("mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary")}>Admin workspace</p><h1 className={cx("text-3xl font-semibold tracking-tight")}>Documentation</h1><p className={cx("mt-2 text-sm text-muted-foreground")}>Your team's IT knowledge, in one place.</p></div>{tree.data?.commit && <span className={cx("rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground")}>Repository · {tree.data.commit.slice(0, 12)}</span>}</header>
        {tree.loading ? <p role="status">Loading documentation…</p> : tree.error ? <div role="alert"><p>Unable to load documentation.</p><GlassButton className={cx("mt-3 rounded-xl px-4 py-2")} onClick={() => { setTree({ loading: true }); setTreeRetry((n) => n + 1); }}><RefreshCw className={cx("mr-2 inline size-4")} />Retry</GlassButton></div> : !files.length ? <p>No documentation is available yet.</p> : <div className={cx("documentation-layout grid gap-4", !libraryExpanded && "documentation-layout-collapsed")}>
            <aside className={cx("self-start rounded-3xl border border-border bg-card/70 p-4 shadow-lg backdrop-blur-xl")}><div className={cx("documentation-library-header flex items-center justify-between gap-2", libraryExpanded && "documentation-library-header-expanded")}><div className={cx("flex items-center gap-2 px-2 text-sm font-semibold")}><BookOpen className={cx("size-4 text-primary")} /> <span className={cx(!libraryExpanded && "lg:sr-only")}>Library</span></div><GlassButton type="button" aria-label={libraryExpanded ? "Collapse library" : "Expand library"} aria-expanded={libraryExpanded} aria-controls="documentation-library" onClick={() => setLibraryExpanded((expanded) => !expanded)} className={cx("rounded-xl p-2")} >{libraryExpanded ? <PanelLeftClose className={cx("size-4")} aria-hidden="true" /> : <PanelLeftOpen className={cx("size-4")} aria-hidden="true" />}</GlassButton></div><div className={cx("documentation-library-content", libraryExpanded && "documentation-library-content-expanded")}><div className={cx("min-h-0 overflow-hidden")}><nav id="documentation-library" aria-label="Documentation library" inert={!libraryExpanded} className={cx("documentation-library-nav max-h-72 space-y-4 overflow-auto lg:max-h-[70vh]")}>{Object.entries(groups).map(([group, paths]) => <section key={group}><h2 className={cx("mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground")}>{group.replace(/^\d+-/, "").replaceAll("-", " ")}</h2>{paths.map((item) => <GlassButton key={item} onClick={() => navigate(item)} aria-current={item === path ? "page" : undefined} className={cx("flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-sm", item === path ? "bg-primary/15 text-primary" : "text-muted-foreground")}><FileText className={cx("mt-0.5 size-4 shrink-0")} /><span className={cx("min-w-0 wrap-anywhere")}>{item.split("/").slice(item.includes("/") ? 1 : 0).join(" / ").replace(/\.md$/i, "")}</span></GlassButton>)}</section>)}</nav></div></div></aside>
            <article className={cx("documentation-reader min-w-0 rounded-3xl border border-border bg-card/70 p-4 shadow-lg backdrop-blur-xl sm:p-8")}><nav aria-label="Breadcrumb" className={cx("mb-6 wrap-anywhere text-xs text-muted-foreground")}>Library / {path?.split("/").join(" / ")}</nav>{loadingDoc ? <p role="status">Loading document…</p> : doc.error ? <div role="alert"><p>Unable to load this document.</p><GlassButton className={cx("mt-3 rounded-xl px-4 py-2")} onClick={() => { setDoc({}); setDocRetry((n) => n + 1); }}>Retry</GlassButton></div> : doc.data ? <><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{doc.data.content}</ReactMarkdown>{doc.data.commit && <p className={cx("mt-10 border-t border-border pt-4 text-xs text-muted-foreground")}>Document version · {doc.data.commit.slice(0, 12)}{tree.data.commit !== doc.data.commit && " · Library may have changed; refresh to update."}</p>}</> : null}</article>
        </div>}
    </div>;
}
