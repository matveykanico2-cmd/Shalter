import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { type AnimatorEditor, createAnimatorEditor } from "../lib/anim/animator-editor";
import type { CustomScene } from "../lib/anim/custom-scene";

type Props = {
  title?: string;
  saveLabel?: string;
  initial?: unknown;
  onSave: (scene: CustomScene) => void;
  onClose: () => void;
};

/**
 * Аниматор во весь экран — openAnimatorEditor (public/js/components/animatorEditor.js):
 * рисуют свои эмодзи и подарки. Сам редактор — DOM из shared/lib/anim.
 */
export function AnimatorDialog({ title = "Аниматор", saveLabel = "Сохранить", initial = null, onSave, onClose }: Props) {
  const titleId = useId();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<AnimatorEditor | null>(null);
  const start = useRef(initial);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ed = createAnimatorEditor(start.current);
    editor.current = ed;
    el.replaceChildren(ed.node);
    return () => {
      ed.destroy();
      el.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="anim-overlay">
      <div className="anim-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="anim-title">
          {title}
        </h2>
        <div ref={host} className="anim-editor" />
        <div className="anim-actions">
          <button type="button" className="anim-cancel-btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="anim-save-btn"
            onClick={() => {
              const scene = editor.current?.result();
              if (!scene) return;
              onSave(scene);
              onClose();
            }}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
