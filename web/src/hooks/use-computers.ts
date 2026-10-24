import { useCallback, useEffect, useState } from "react";
import { api, type Computer, type Recording } from "@/lib/api";

/** The saved computers and recordings, refreshed on demand and every 10 s (a computer may change from elsewhere). */
export function useComputers() {
  const [computers, setComputers] = useState<Computer[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);

  const refresh = useCallback(async () => {
    const [list, recs] = await Promise.all([api.list().catch(() => null), api.recordings().catch(() => null)]);
    if (list) setComputers(list);
    if (recs) setRecordings(recs);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { computers, recordings, refresh };
}
