'use client';

import { useState, useCallback, useRef, useEffect, ReactNode } from 'react';

interface ResizablePanelProps {
  children: [ReactNode, ReactNode];
  direction: 'horizontal' | 'vertical';
  defaultSplit?: number;
  minSize?: number;
  maxSize?: number;
  onSizeChange?: (split: number) => void;
  className?: string;
}

export default function ResizablePanel({
  children,
  direction,
  defaultSplit = 50,
  minSize = 100,
  maxSize = Infinity,
  onSizeChange,
  className = '',
}: ResizablePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState(defaultSplit);
  const isDragging = useRef(false);
  const startPos = useRef(0);
  const startSplit = useRef(0);

  const isHorizontal = direction === 'horizontal';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startPos.current = isHorizontal ? e.clientX : e.clientY;
    startSplit.current = splitPercent;
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [isHorizontal, splitPercent]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const totalSize = isHorizontal
        ? containerRef.current.offsetWidth
        : containerRef.current.offsetHeight;
      if (totalSize === 0) return;

      const delta = (isHorizontal ? e.clientX : e.clientY) - startPos.current;
      const deltaPercent = (delta / totalSize) * 100;
      let newSplit = startSplit.current + deltaPercent;

      const minPercent = (minSize / totalSize) * 100;
      const maxPercent = maxSize === Infinity ? 100 - minPercent : (maxSize / totalSize) * 100;

      newSplit = Math.max(minPercent, Math.min(maxPercent, newSplit));

      setSplitPercent(newSplit);
      onSizeChange?.(newSplit);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isHorizontal, minSize, maxSize, onSizeChange]);

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} ${className}`}
      style={{ height: '100%', width: '100%' }}
    >
      <div
        className="overflow-hidden"
        style={{
          [isHorizontal ? 'width' : 'height']: `${splitPercent}%`,
          flexShrink: 0,
          minWidth: isHorizontal ? minSize : undefined,
          minHeight: !isHorizontal ? minSize : undefined,
        }}
      >
        {children[0]}
      </div>

      <div
        className="group relative flex items-center justify-center shrink-0"
        style={{
          width: isHorizontal ? '4px' : '100%',
          height: isHorizontal ? '100%' : '4px',
          cursor: isHorizontal ? 'col-resize' : 'row-resize',
          background: 'var(--border-primary)',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent-blue)';
        }}
        onMouseLeave={(e) => {
          if (!isDragging.current) {
            e.currentTarget.style.background = 'var(--border-primary)';
          }
        }}
      >
        <div
          className="absolute rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background: 'var(--accent-blue)',
            ...(isHorizontal
              ? { width: '2px', height: '24px' }
              : { width: '24px', height: '2px' }),
          }}
        />
      </div>

      <div
        className="overflow-hidden"
        style={{
          [isHorizontal ? 'width' : 'height']: `${100 - splitPercent}%`,
          flexShrink: 0,
          minWidth: isHorizontal ? minSize : undefined,
          minHeight: !isHorizontal ? minSize : undefined,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
}
