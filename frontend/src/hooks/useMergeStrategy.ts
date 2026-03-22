import { useState, useEffect } from "react";

export type MergeStrategy = "merge" | "squash" | "rebase";

export function useMergeStrategy(defaultStrategy: MergeStrategy = "merge") {
  const [strategy, setStrategy] = useState<MergeStrategy>(() => {
    const saved = localStorage.getItem("hb_merge_strategy");
    if (saved === "merge" || saved === "squash" || saved === "rebase") {
      return saved as MergeStrategy;
    }
    return defaultStrategy;
  });

  useEffect(() => {
    localStorage.setItem("hb_merge_strategy", strategy);
  }, [strategy]);

  return [strategy, setStrategy] as const;
}
