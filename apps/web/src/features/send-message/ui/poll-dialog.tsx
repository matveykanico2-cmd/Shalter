import { useState } from "react";

import { Button, Dialog } from "@/shared/ui";

import styles from "./create-dialogs.module.css";

const MAX_OPTIONS = 8;

export type PollDraft = { question: string; options: string[]; correctIndex: number | null; multiple: boolean };

/** «Новый опрос» / «Новая викторина» — как public/js/components/pollDialog.js. */
export function PollDialog({ onCreate, onClose }: { onCreate: (poll: PollDraft) => void; onClose: () => void }) {
  const [quiz, setQuiz] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correct, setCorrect] = useState(0);
  const [multiple, setMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    const q = question.trim();
    const raw = options.map((o) => o.trim());
    const filled = raw.filter(Boolean);
    if (!q) return setError("Введите вопрос");
    if (filled.length < 2) return setError("Нужно хотя бы 2 варианта ответа");
    if (quiz && !raw[correct]) return setError("Отметьте правильный ответ");
    onClose();
    // Пустые варианты выкидываем — номер правильного считаем среди оставшихся.
    onCreate({ question: q, options: filled, correctIndex: quiz ? raw.slice(0, correct).filter(Boolean).length : null, multiple: !quiz && multiple });
  };

  return (
    <Dialog title={quiz ? "Новая викторина" : "Новый опрос"} onClose={onClose}>
      <div className={styles.modes} role="radiogroup" aria-label="Вид">
        <button type="button" role="radio" aria-checked={!quiz} className={quiz ? styles.mode : `${styles.mode} ${styles.active}`} onClick={() => setQuiz(false)}>
          Опрос
        </button>
        <button type="button" role="radio" aria-checked={quiz} className={quiz ? `${styles.mode} ${styles.active}` : styles.mode} onClick={() => setQuiz(true)}>
          Викторина
        </button>
      </div>
      <p className={styles.hint}>
        {quiz ? "Отметьте галочкой правильный ответ. Ответивший сразу увидит, угадал он или нет." : "Обычный опрос: правильного ответа нет, видно только кто как проголосовал."}
      </p>
      <input className={styles.input} placeholder="Вопрос" aria-label="Вопрос" autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} />
      <div className={styles.list}>
        {options.map((value, i) => (
          <div key={i} className={styles.optionRow}>
            {quiz ? (
              <button type="button" className={correct === i ? `${styles.correct} ${styles.active}` : styles.correct} title="Правильный ответ" aria-pressed={correct === i} onClick={() => setCorrect(i)}>
                {correct === i ? "✓" : ""}
              </button>
            ) : null}
            <input
              className={styles.input}
              placeholder={`Вариант ${i + 1}`}
              aria-label={`Вариант ${i + 1}`}
              value={value}
              onChange={(e) => setOptions((list) => list.map((o, j) => (j === i ? e.target.value : o)))}
            />
          </div>
        ))}
        {options.length < MAX_OPTIONS ? (
          <button type="button" className={styles.add} onClick={() => setOptions((list) => [...list, ""])}>
            + Добавить вариант
          </button>
        ) : null}
      </div>
      {!quiz ? (
        <label className={styles.check}>
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
          <span>Несколько вариантов ответа</span>
        </label>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button onClick={create}>Создать</Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
