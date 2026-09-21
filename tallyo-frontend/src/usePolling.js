import { useEffect, useRef } from "react";

// 每 intervalMs 毫秒调用一次 callback；页面不可见时自动暂停
export function usePolling(callback, intervalMs = 5000) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    let timer = null;

    function tick() {
      // 只在页面可见时刷新，省请求
      if (document.visibilityState === "visible") {
        savedCallback.current();
      }
    }

    timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
