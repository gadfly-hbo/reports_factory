/* Toast:右下角轻提示;失败消息自动停留更久。 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ToastMsg { id: number; text: string; kind: 'info' | 'ok' | 'fail' }

interface ToastCtx {
  show(text: string, kind?: ToastMsg['kind']): void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msgs, setMsgs] = useState<ToastMsg[]>([]);
  const seq = useRef(0);

  const show = useCallback((text: string, kind: ToastMsg['kind'] = 'info') => {
    const id = ++seq.current;
    // 最多同时 3 条:连续操作时不堆叠遮挡工作区
    setMsgs((m) => [...m, { id, text, kind }].slice(-3));
    window.setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), kind === 'fail' ? 6000 : 3200);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`toast${m.kind === 'fail' ? ' toast-fail' : m.kind === 'ok' ? ' toast-ok' : ''}`}>
            {m.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = (): ToastCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
};
