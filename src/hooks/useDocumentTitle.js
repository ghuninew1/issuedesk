import { useEffect } from "react";

const APP_NAME = "IssueDesk";

export const useDocumentTitle = (title) => {
    useEffect(() => {
        document.title = title ? `IssueDesk - ${title}` : APP_NAME;
    }, [title]);
};

export default useDocumentTitle;
