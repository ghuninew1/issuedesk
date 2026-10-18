import { useEffect, useRef, useState } from "react";

export const useDisclosure = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg || !isOpen) return;

    const onDialogClose = () => {
      setIsOpen(false);
    };

    dlg.addEventListener("close", onDialogClose);
    return () => dlg.removeEventListener("close", onDialogClose);
  }, [dialogRef, isOpen]);

  return {
    dialogRef,
    isOpen,
    data,
    onOpen: (data=null) => {
      setIsOpen(true);
      setData(data);
    },
    onClose: () => {
      setIsOpen(false);
    },
  };
};
