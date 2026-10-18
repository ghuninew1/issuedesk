import { useState } from "react";
import { createIssue, uploadIssueAttachment } from "../../services/issues";
import { cx } from "../../utils/cx";
import ImageUploader from "./ImageUploader";

const INITIAL_FORM = {
    reporter: "",
    title: "",
    category: "",
    priority: "Medium",
    description: "",
};

const categories = [
    { value: "Hardware", label: "Hardware — อุปกรณ์คอมพิวเตอร์" },
    { value: "Software", label: "Software — โปรแกรมและแอปพลิเคชัน" },
    { value: "Network", label: "Network — อินเทอร์เน็ตและเครือข่าย" },
    { value: "Printer", label: "Printer — เครื่องพิมพ์" },
    { value: "Other", label: "Other — อื่น ๆ" },
];

const priorities = [
    { value: "Low", label: "Low — ต่ำ" },
    { value: "Medium", label: "Medium — ปานกลาง" },
    { value: "High", label: "High — สูง" },
];

const fieldClassName = cx(
    "w-full rounded-lg border border-input bg-background px-3 py-2.5",
    "text-sm text-foreground",
    "placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const Label = ({ htmlFor, children, required = false }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium">
        {children}

        {required && (
            <span className="ml-1 text-destructive" aria-hidden="true">
                *
            </span>
        )}
    </label>
);

const ReportForm = () => {
    const [form, setForm] = useState(INITIAL_FORM);
    const [files, setFiles] = useState([]);
    const [errors, setErrors] = useState({});
    const [createdIssue, setCreatedIssue] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [copied, setCopied] = useState(false);

    const updateField = (event) => {
        const { name, value } = event.target;

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));

        setErrors((previous) => ({
            ...previous,
            [name]: "",
        }));

        setCreatedIssue(null);
        setSubmitError("");
        setCopied(false);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        const nextErrors = {};

        if (!form.reporter.trim()) {
            nextErrors.reporter = "กรุณากรอกชื่อผู้แจ้ง";
        }

        if (!form.title.trim()) {
            nextErrors.title = "กรุณากรอกหัวข้อปัญหา";
        }

        if (!form.category) {
            nextErrors.category = "กรุณาเลือกประเภทปัญหา";
        }

        if (!form.description.trim()) {
            nextErrors.description = "กรุณากรอกรายละเอียดปัญหา";
        }

        setErrors(nextErrors);
        setSubmitError("");
        setCreatedIssue(null);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        setIsSubmitting(true);

        try {
            const data = await createIssue({
                reporter: form.reporter.trim(),
                title: form.title.trim(),
                category: form.category,
                priority: form.priority,
                description: form.description.trim(),
            });

            if (!data.success || !data.issue) {
                throw new Error(data.message || "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองอีกครั้ง");
            }

            const issue = data.issue;
            const uploadErrors = [];

            for (const file of files) {
                try {
                    const result = await uploadIssueAttachment(issue.ticket_number, file);

                    if (!result.success) {
                        throw new Error(result.message || "ไม่สามารถอัปโหลดไฟล์ได้");
                    }
                } catch (error) {
                    console.error(`Failed to upload attachment "${file.name}":`, error);

                    uploadErrors.push(file.name);
                }
            }

            setCreatedIssue(issue);
            setCopied(false);
            
            // Reset the form
            setForm(INITIAL_FORM);
            setFiles([]);
            setErrors({});
            setSubmitError("");

            if (uploadErrors.length > 0) {
                setSubmitError(
                    `สร้าง Ticket สำเร็จ แต่ไม่สามารถอัปโหลดไฟล์ได้: ${uploadErrors.join(", ")} กรุณาตรวจสอบและแนบไฟล์อีกครั้ง`,
                );
            }
        } catch (error) {
            console.error("Failed to submit issue:", error);

            setSubmitError(error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
        } finally {
            setIsSubmitting(false);
        }
    };

    const copyTicketNumber = async () => {
        if (!createdIssue?.ticket_number) {
            return;
        }

        try {
            await navigator.clipboard.writeText(createdIssue.ticket_number);

            setCopied(true);
        } catch (error) {
            console.error("Failed to copy ticket number:", error);

            setSubmitError("ไม่สามารถคัดลอกหมายเลข Ticket ได้ กรุณาคัดลอกด้วยตนเอง");
        }
    };

    const handleReset = () => {
        if (isSubmitting) {
            return;
        }

        setForm(INITIAL_FORM);
        setFiles([]);
        setErrors({});
        setCreatedIssue(null);
        setSubmitError("");
        setCopied(false);
    };

    return (
        <form onSubmit={handleSubmit} onReset={handleReset} noValidate className="space-y-6">
            {createdIssue && (
                <div role="status" className={cx("rounded-lg border border-emerald-500/30", "bg-emerald-500/10 p-4")}>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">บันทึก Issue สำเร็จ</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span className="text-sm text-muted-foreground">Ticket Number</span>

                        <code className="font-semibold text-foreground">{createdIssue.ticket_number}</code>

                        <button
                            type="button"
                            onClick={copyTicketNumber}
                            className={cx(
                                "rounded-md border border-border px-3 py-1.5",
                                "text-sm font-medium transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                "focus-visible:outline-none",
                                "focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                        >
                            {copied ? "คัดลอกแล้ว" : "คัดลอกหมายเลข"}
                        </button>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                        <p>ผู้แจ้ง: {createdIssue.reporter_name}</p>

                        <p>หัวข้อ: {createdIssue.title}</p>

                        <p>สถานะ: {createdIssue.status}</p>
                    </div>
                </div>
            )}

            {submitError && (
                <div
                    role="alert"
                    className={cx(
                        "rounded-lg border border-destructive/30",
                        "bg-destructive/5 p-4 text-sm text-destructive",
                    )}
                >
                    {submitError}
                </div>
            )}

            <section className="space-y-4">
                <div>
                    <h3 className="text-base font-semibold">Issue Information</h3>

                    <p className="mt-1 text-sm text-muted-foreground">กรอกข้อมูลปัญหาที่ต้องการแจ้งให้T ทราบ</p>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="reporter" required>
                            Reporter Name
                        </Label>

                        <input
                            id="reporter"
                            name="reporter"
                            type="text"
                            autoComplete="name"
                            maxLength={100}
                            value={form.reporter}
                            onChange={updateField}
                            placeholder="ชื่อผู้แจ้งหรือชื่อเครื่อง เช่น brain101"
                            aria-invalid={Boolean(errors.reporter)}
                            aria-describedby={errors.reporter ? "reporter-error" : undefined}
                            className={fieldClassName}
                        />

                        {errors.reporter && (
                            <p id="reporter-error" className="text-sm text-destructive">
                                {errors.reporter}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="category" required>
                            Category
                        </Label>

                        <select
                            id="category"
                            name="category"
                            value={form.category}
                            onChange={updateField}
                            aria-invalid={Boolean(errors.category)}
                            aria-describedby={errors.category ? "category-error" : undefined}
                            className={fieldClassName}
                        >
                            <option value="">เลือกประเภทปัญหา</option>

                            {categories.map((category) => (
                                <option key={category.value} value={category.value}>
                                    {category.label}
                                </option>
                            ))}
                        </select>

                        {errors.category && (
                            <p id="category-error" className="text-sm text-destructive">
                                {errors.category}
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="title" required>
                        Issue Title
                    </Label>

                    <input
                        id="title"
                        name="title"
                        type="text"
                        maxLength={200}
                        value={form.title}
                        onChange={updateField}
                        placeholder="เช่น คอมพิวเตอร์เปิดไม่ติด"
                        aria-invalid={Boolean(errors.title)}
                        aria-describedby={errors.title ? "title-error" : undefined}
                        className={fieldClassName}
                    />

                    {errors.title && (
                        <p id="title-error" className="text-sm text-destructive">
                            {errors.title}
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>

                    <select
                        id="priority"
                        name="priority"
                        value={form.priority}
                        onChange={updateField}
                        className={fieldClassName}
                    >
                        {priorities.map((priority) => (
                            <option key={priority.value} value={priority.value}>
                                {priority.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description" required>
                        Description
                    </Label>

                    <textarea
                        id="description"
                        name="description"
                        rows={5}
                        maxLength={5000}
                        value={form.description}
                        onChange={updateField}
                        placeholder="อธิบายอาการที่พบ ข้อความ Error หรือสิ่งที่ทำก่อนเกิดปัญหา"
                        aria-invalid={Boolean(errors.description)}
                        aria-describedby={errors.description ? "description-error" : undefined}
                        className={cx(fieldClassName, "resize-y")}
                    />

                    <div className="flex items-start justify-between gap-3">
                        {errors.description ? (
                            <p id="description-error" className="text-sm text-destructive">
                                {errors.description}
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">ให้รายละเอียดมากที่สุดเท่าที่ทำได้</p>
                        )}

                        <span className="shrink-0 text-xs text-muted-foreground">{form.description.length}/5000</span>
                    </div>
                </div>
            </section>

            <section className="space-y-4 border-t border-border pt-6">
                <div>
                    <h3 className="text-base font-semibold">Attachments</h3>

                    <p className="mt-1 text-sm text-muted-foreground">แนบภาพหน้าจอหรือรูปอุปกรณ์ที่พบปัญหา</p>
                </div>

                <ImageUploader files={files} onChange={setFiles} />
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
                <button
                    type="reset"
                    disabled={isSubmitting}
                    title={isSubmitting ? "กําลังล้าง..." : "ล้างฟอร์ม"}
                    className={cx(
                        "rounded-lg border border-border px-4 py-2.5 cursor-pointer",
                        "text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                >
                    Clear Form
                </button>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    title={isSubmitting ? "กําลังบันทึก..." : "Submit Issue ถัดไป"}
                    className={cx(
                        "rounded-lg bg-primary px-5 py-2.5 cursor-pointer",
                        "text-sm font-medium text-primary-foreground",
                        "transition-opacity hover:opacity-90",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                >
                    {isSubmitting ? "กำลังบันทึก..." : "Submit Issue"}
                </button>
            </div>
        </form>
    );
};

export default ReportForm;
