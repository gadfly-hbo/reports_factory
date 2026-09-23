import type { ReactNode } from 'react';

export default function Chip({ kind, children, title }: { kind?: string; children: ReactNode; title?: string }) {
  return (
    <span className={`chip${kind ? ` ${kind}` : ''}`} title={title}>
      {children}
    </span>
  );
}
