import { createContext, useContext, useRef, useState } from "react";
export function useFileTask() {
  const [message, setMessage] = useState(""),
    [working, setWorking] = useState(false);
  const fileGuard = useRef(false);
  async function task(work: () => Promise<void>) {
    if (fileGuard.current) return;
    fileGuard.current = true;
    setWorking(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      fileGuard.current = false;
      setWorking(false);
    }
  }

  return { message, setMessage, working, task };
}
export const FileTaskContext = createContext<ReturnType<
  typeof useFileTask
> | null>(null);
export function useSettingsTask() {
  const value = useContext(FileTaskContext);
  if (!value) throw new Error("Missing settings task context");
  return value;
}
