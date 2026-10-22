import { useMemo, useState } from "react";
import {
    Search,
    RefreshCw,
    Monitor,
    Image as ImageIcon,
    X,
    CircleX,
    PackageCheck,
    Boxes,
    UserRound,
    MonitorOff,
    MonitorPc,
    Image,
    Computer,
    Mouse,
    Keyboard,
    Tablet,
} from "lucide-react";
import { useGoogleSheet } from "../hooks/useGoogleSheet";
import { cx } from "../utils/cx";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const imageFields = [
    { key: "computerImage", label: "Computer" },
    { key: "monitor1Image", label: "Monitor 1" },
    { key: "monitor2Image", label: "Monitor 2" },
    { key: "mouseImage", label: "Mouse" },
    { key: "keyboardImage", label: "Keyboard" },
    { key: "wacomImage", label: "Wacom" },
];
const equipmentFields = [
    { key: "computerImage", label: "Computer", Icon: Computer },
    { key: "monitor1Image", label: "Monitor 1", Icon: Monitor },
    { key: "monitor2Image", label: "Monitor 2", Icon: Monitor },
    { key: "mouseImage", label: "Mouse", Icon: Mouse },
    { key: "keyboardImage", label: "Keyboard", Icon: Keyboard },
    { key: "wacomImage", label: "Wacom", Icon: Tablet },
];
const PAGE_SIZE = 20;

const statusStyles = {
    Active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    Available: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    Damaged: "bg-red-500/10 text-red-700 dark:text-red-400",
    Unknown: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

function Status({ status }) {
    return (
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", statusStyles[status] || "bg-muted text-muted-foreground")}>
            <span className="size-1.5 rounded-full bg-current" />
            {status || "Unknown"}
        </span>
    );
}

function ImageTile({ src, label, imageCount, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!src}
            aria-label={src ? `ดูรูป ${label}` : `${label} ไม่มีรูป`}
            className={cx(
                "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/50",
                "transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                "disabled:cursor-default disabled:hover:border-border cursor-pointer",
            )}
        >
            {src ? (
                <>
                    <img src={src} alt={label} loading="lazy" decoding="async" width={36} height={36} className="size-full object-cover transition duration-200 group-hover:scale-[1.05]" />
                    {imageCount > 1 && <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] leading-4 text-white">+{imageCount - 1}</span>}
                </>
            ) : (
                <ImageIcon className="size-5 text-muted-foreground/45" />
            )}
        </button>
    );
}

function EquipmentList({ asset }) {
    const equipment = equipmentFields.filter((field) => asset[field.key]);

    if (equipment.length === 0) {
        return <span className="text-xs text-muted-foreground">—</span>;
    }

    return (
        <div className="flex max-w-64 flex-wrap gap-x-3 gap-y-2">
            {equipment.map(({ key, label, Icon }) => (
                <span key={key} title={label} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                    <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    {label}
                </span>
            ))}
        </div>
    );
}

export default function Sheet() {
    const { data = [], loading, error } = useGoogleSheet();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All status");
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedAsset, setSelectedAsset] = useState(null);
    useDocumentTitle("Asset inventory");

    const statuses = useMemo(() => ["All status", ...new Set(data.map((asset) => asset.status).filter(Boolean))], [data]);
    const filteredAssets = useMemo(() => {
        const term = search.trim().toLowerCase();
        return data.filter((asset) => {
            const matchesSearch = !term || [asset.assetId, asset.employeeName, asset.department, asset.computerName]
                .some((value) => String(value || "").toLowerCase().includes(term));
            return matchesSearch && (statusFilter === "All status" || asset.status === statusFilter);
        });
    }, [data, search, statusFilter]);
    const activeCount = data.filter((asset) => asset.status === "Active").length;
    const availableCount = data.filter((asset) => asset.status === "Available").length;
    const damagedCount = data.filter((asset) => asset.status === "Damaged").length;
    const pageCount = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE));
    const displayPage = Math.min(currentPage, pageCount);
    const visibleAssets = filteredAssets.slice((displayPage - 1) * PAGE_SIZE, displayPage * PAGE_SIZE);

    if (loading) {
        return <div className="mx-auto max-w-7xl animate-pulse space-y-5" role="status" aria-label="กำลังโหลดข้อมูล">
            <div className="h-8 w-56 rounded bg-muted" /><div className="h-24 rounded-2xl bg-muted" /><div className="h-80 rounded-2xl bg-muted" />
        </div>;
    }

    if (error) {
        return <div className="mx-auto max-w-7xl rounded-2xl border border-destructive/25 bg-destructive/5 p-6" role="alert">
            <h1 className="text-lg font-semibold">ไม่สามารถโหลดข้อมูลอุปกรณ์ได้</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted"><RefreshCw className="size-4" />ลองอีกครั้ง</button>
        </div>;
    }

    return (
        <div className="mx-auto max-w-7xl animate-fadeInUp overflow-hidden">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">คลังอุปกรณ์</h1>
                    <p className="mt-2 text-sm text-muted-foreground">รายการครุภัณฑ์และอุปกรณ์คอมพิวเตอร์</p>
                </div>
                <div className="text-sm text-muted-foreground">อัปเดตข้อมูลจาก Google Sheets</div>
            </div>

            <section aria-label="ภาพรวมอุปกรณ์" className="mb-6 grid gap-3 sm:grid-cols-4">
                <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Boxes className="size-5" />
                    </span>
                    <div>
                        <p className="text-sm text-muted-foreground">อุปกรณ์ทั้งหมด</p>
                        <p className="mt-0.5 text-2xl font-semibold tabular-nums">{data.length}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                        <PackageCheck className="size-5" />
                    </span>
                    <div>
                        <p className="text-sm text-muted-foreground">กำลังใช้งาน</p>
                        <p className="mt-0.5 text-2xl font-semibold tabular-nums">{activeCount}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                        <Monitor className="size-5" />
                    </span>
                    <div>
                        <p className="text-sm text-muted-foreground">พร้อมใช้งาน</p>
                        <p className="mt-0.5 text-2xl font-semibold tabular-nums">{availableCount}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
                        <MonitorOff className="size-5" />
                    </span>
                    <div>
                        <p className="text-sm text-muted-foreground">ใช้งานไม่ได้</p>
                        <p className="mt-0.5 text-2xl font-semibold tabular-nums">{damagedCount}</p>
                    </div>
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm w-full max-w-7xl">
                <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                        <h2 className="font-semibold">รายการอุปกรณ์</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            แสดง {filteredAssets.length} จาก {data.length} รายการ
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <label className="relative block sm:w-64">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }}
                                placeholder="ค้นหารหัส ชื่อ หรือแผนก"
                                aria-label="ค้นหาอุปกรณ์"
                                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                            />
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }}
                            aria-label="กรองตามสถานะ"
                            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                        >
                            {statuses.map((status) => (
                                <option key={status} value={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {filteredAssets.length === 0 ? (
                    <div className="px-5 py-16 text-center">
                        <Search className="mx-auto size-8 text-muted-foreground/50" />
                        <p className="mt-3 font-medium">ไม่พบอุปกรณ์</p>
                        <p className="mt-1 text-sm text-muted-foreground">ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p>
                    </div>
                ) : (
                    <div className="relative w-full">
                        <table className="w-full min-w-[1100px] text-left text-sm hidden md:table">
                            <thead className="bg-muted/40 text-xs font-medium text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-5 py-3">
                                        อุปกรณ์ / รหัส
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        ผู้ใช้งาน
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        รายละเอียด
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        สถานะ
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        อุปกรณ์
                                    </th>
                                    <th scope="col" className="px-4 py-3">
                                        รูปอุปกรณ์
                                    </th>
                                    <th scope="col" className="px-5 py-3">
                                        หมายเหตุ
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {visibleAssets.map((asset) => (
                                    <tr
                                        key={asset.assetId}
                                        className="transition-colors hover:bg-muted/25 flex md:table-row flex-col md:flex-row items-center mx-auto"
                                    >
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                                                    <Monitor className="size-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium">
                                                        {asset.computerName || "ไม่ระบุชื่อเครื่อง"}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {asset.assetId || "—"}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="inline-flex items-center gap-2">
                                                <UserRound className="size-4 text-muted-foreground" />
                                                {asset.employeeName || "—"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                                                <MonitorPc className="size-4" />
                                                {asset.details || "—"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <Status status={asset.status} />
                                        </td>
                                        <td className="px-4 py-4">
                                            <EquipmentList asset={asset} />
                                        </td>
                                        <td className="px-4 py-4">
                                            {(() => {
                                                const fieldsWithImages = imageFields.filter((field) => asset[field.key]);
                                                const coverField = fieldsWithImages[0];
                                                return coverField ? (
                                                    <div className="w-9 shrink-0">
                                                        <ImageTile
                                                            src={asset[coverField.key]}
                                                            label={coverField.label}
                                                            imageCount={fieldsWithImages.length}
                                                            onClick={() => setSelectedAsset({ asset, field: coverField })}
                                                        />
                                                    </div>
                                                ) : <span className="text-xs text-muted-foreground">ไม่มีรูป</span>;
                                            })()}
                                            <span className="sr-only">
                                                มีรูปทั้งหมด {imageFields.filter((field) => asset[field.key]).length} รายการ แตะภาพเพื่อเปิดดู
                                            </span>
                                        </td>
                                        <td className="max-w-52 px-5 py-4 text-muted-foreground">
                                            <span className="line-clamp-2">{asset.notes || "—"}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {filteredAssets.length > PAGE_SIZE && (
                    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <p className="text-xs text-muted-foreground">แสดง {(displayPage - 1) * PAGE_SIZE + 1}–{Math.min(displayPage * PAGE_SIZE, filteredAssets.length)} จาก {filteredAssets.length} รายการ</p>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={displayPage === 1} className="rounded-lg border border-input px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">ก่อนหน้า</button>
                            <span className="min-w-16 text-center text-sm tabular-nums">{displayPage} / {pageCount}</span>
                            <button type="button" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={displayPage === pageCount} className="rounded-lg border border-input px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">ถัดไป</button>
                        </div>
                    </div>
                )}
            </section>

            {selectedAsset && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setSelectedAsset(null);
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="asset-image-title"
                        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-border p-4 sm:p-5">
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">
                                    {selectedAsset.asset.assetId} · {selectedAsset.field.label}
                                </p>
                                <h2 id="asset-image-title" className="mt-1 truncate text-lg font-semibold">
                                    {selectedAsset.asset.computerName || selectedAsset.asset.employeeName || "อุปกรณ์"}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedAsset(null)}
                                aria-label="ปิดภาพ"
                                className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
                            >
                                <X className="size-5" />
                            </button>
                        </div>
                        <div className="flex max-h-[72vh] min-h-64 items-center justify-center bg-muted/35 p-3 sm:p-6">
                            <img
                                src={selectedAsset.asset[selectedAsset.field.key]}
                                alt={`${selectedAsset.field.label} — ${selectedAsset.asset.computerName || selectedAsset.asset.assetId}`}
                                loading="lazy"
                                decoding="async"
                                className="max-h-[65vh] max-w-full rounded-lg object-contain"
                            />
                        </div>
                        <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 sm:px-5">
                            {imageFields.filter((field) => selectedAsset.asset[field.key]).map((field) => (
                                <button
                                    key={field.key}
                                    type="button"
                                    onClick={() => setSelectedAsset((selected) => ({ ...selected, field }))}
                                    aria-pressed={selectedAsset.field.key === field.key}
                                    className={cx(
                                        "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                                        selectedAsset.field.key === field.key ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted",
                                    )}
                                >
                                    {field.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
                            <p className="truncate text-sm text-muted-foreground">
                                {selectedAsset.asset.employeeName} · {selectedAsset.asset.details}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    window.open(selectedAsset.asset[selectedAsset.field.key], "_blank");
                                }}
                                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted cursor-pointer"
                            >
                                view
                                <Image className="size-4 rotate-180" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedAsset(null)}
                                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted cursor-pointer"
                            >
                                ปิด
                                <CircleX className="size-4 rotate-180" />
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
