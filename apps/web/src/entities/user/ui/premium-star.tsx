import { type CSSProperties, type PointerEvent, useRef, useState } from "react";

import styles from "./premium-star.module.css";

/** Объёмная Premium-звезда: её можно вращать мышью или пальцем. */
export function PremiumStar({ size = 20 }: { size?: number }) {
  const [rotation, setRotation] = useState({ x: -12, y: 18 });
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start) return;
    setRotation({ x: Math.max(-70, Math.min(70, start.rx - (e.clientY - start.y) * 0.8)), y: start.ry + (e.clientX - start.x) * 0.9 });
  };
  return (
    <button
      type="button"
      className={styles.button}
      style={{ width: size + 8, height: size + 8 }}
      title="Shalter Premium"
      aria-label="Shalter Premium"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, rx: rotation.x, ry: rotation.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={() => setRotation({ x: -12, y: 18 })}
    >
      <span className={styles.scene} style={{ width: size, height: size, transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}>
        <span className={`${styles.star} ${styles.back}`}>★</span>
        {[-2, -1, 0, 1, 2].map((z) => (
          <span key={z} className={`${styles.star} ${styles.middle}`} style={{ "--star-depth": `${z}px` } as CSSProperties}>★</span>
        ))}
        <span className={`${styles.star} ${styles.front}`}>★</span>
      </span>
    </button>
  );
}
