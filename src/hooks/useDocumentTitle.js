import { useEffect } from "react";


export const useDocumentTitle = (title) => {
    const APP_NAME = "IssueDesk";
    useEffect(() => {
        document.title = title ? `IssueDesk - ${title}` : APP_NAME;
    }, [title]);
};

export default useDocumentTitle;
