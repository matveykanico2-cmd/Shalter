import { useState } from "react";

import { Button, Dialog, Icon } from "@/shared/ui";

import styles from "./create-dialogs.module.css";

const MAX_OPTIONS = 8;
const MAX_STEPS = 8;

export type PollStepDraft = { question: string; options: string[]; correctIndex: number | null };
export type PollDraft = { steps: PollStepDraft[]; multiple: boolean; votersVisible: boolean; closesAt: string | null };

/** «Новый опрос» / «Новая викторина» — как public/js/components/pollDialog.js. */
export function PollDialog({ onCreate, onClose }: { onCreate: (poll: PollDraft) => void; onClose: () => void }) {
  const [quiz, setQuiz] = useState(false);
  const [steps, setSteps] = useState<PollStepDraft[]>([{ question: "", options: ["", ""], correctIndex: 0 }]);
  const [stepIndex, setStepIndex] = useState(0);
  const [multiple, setMultiple] = useState(false);
  const [votersVisible, setVotersVisible] = useState(true);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const step = steps[stepIndex]!;
  const updateStep = (patch: Partial<PollStepDraft>) => setSteps((list) => list.map((item, i) => (i === stepIndex ? { ...item, ...patch } : item)));
  const removeStep = () => {
    if (steps.length === 1) return;
    setSteps((list) => list.filter((_, i) => i !== stepIndex));
    setStepIndex((i) => Math.min(i, steps.length - 2));
    setError(null);
  };
  const removeOption = (optionIndex: number) => {
    if (step.options.length <= 2) return;
    const options = step.options.filter((_, i) => i !== optionIndex);
    const correctIndex = step.correctIndex === null ? null : step.correctIndex === optionIndex ? Math.min(optionIndex, options.length - 1) : step.correctIndex > optionIndex ? step.correctIndex - 1 : step.correctIndex;
    updateStep({ options, correctIndex });
  };

  const create = () => {
    const prepared = steps.map((item) => {
      const raw = item.options.map((o) => o.trim());
      return { question: item.question.trim(), options: raw, filled: raw.filter(Boolean), correctIndex: item.correctIndex };
    });
    const invalid = prepared.findIndex((item) => !item.question || item.filled.length < 2 || (quiz && !item.filled[item.correctIndex ?? 0]));
    if (invalid >= 0) {
      setStepIndex(invalid);
      return setError(!prepared[invalid]!.question ? "Введите вопрос" : prepared[invalid]!.filled.length < 2 ? "Нужно хотя бы 2 варианта ответа" : "Отметьте правильный ответ");
    }
    onClose();
    onCreate({
      steps: prepared.map((item) => ({
        question: item.question,
        options: item.filled,
        correctIndex: quiz ? item.filled.indexOf(item.filled[item.correctIndex ?? 0]!) : null,
      })),
      multiple: !quiz && multiple,
      votersVisible,
      closesAt: duration ? new Date(Date.now() + duration).toISOString() : null,
    });
  };

  return (
    <Dialog title={quiz ? "Новая викторина" : "Новый опрос"} onClose={onClose} className={styles.pollDialog}>
      <div className={styles.pollIntro}>
        <span className={styles.pollIntroIcon}>{quiz ? "✓" : "?"}</span>
        <div>
          <strong>{quiz ? "Проверьте знания" : "Соберите мнение"}</strong>
          <p>{quiz ? "Один правильный вариант ответа" : "Участники выберут подходящий вариант"}</p>
        </div>
      </div>
      <div className={styles.modes} role="group" aria-label="Тип опроса">
        <button type="button" aria-pressed={!quiz} className={quiz ? styles.mode : `${styles.mode} ${styles.active}`} onClick={() => setQuiz(false)}>
          Опрос
        </button>
        <button type="button" aria-pressed={quiz} className={quiz ? `${styles.mode} ${styles.active}` : styles.mode} onClick={() => setQuiz(true)}>
          Викторина
        </button>
      </div>
      <div className={styles.steps} aria-label="Этапы опроса">
        {steps.map((_, i) => (
          <button key={i} type="button" className={i === stepIndex ? `${styles.step} ${styles.stepActive}` : styles.step} onClick={() => { setStepIndex(i); setError(null); }}>
            {i + 1}
          </button>
        ))}
        {steps.length < MAX_STEPS ? (
          <button
            type="button"
            className={styles.addStep}
            onClick={() => {
              setSteps((list) => [...list, { question: "", options: ["", ""], correctIndex: 0 }]);
              setStepIndex(steps.length);
              setError(null);
            }}
          >
            + Вопрос
          </button>
        ) : null}
        {steps.length > 1 ? (
          <button type="button" className={styles.removeStep} onClick={removeStep}>
            <Icon name="Trash" size={14} /> Удалить вопрос
          </button>
        ) : null}
      </div>
      <p className={styles.stepCaption}>Вопрос {stepIndex + 1} из {steps.length}</p>
      <p className={styles.hint}>
        {quiz ? "Отметьте галочкой правильный ответ. Ответивший сразу увидит, угадал он или нет." : "Обычный опрос: правильного ответа нет, видно только кто как проголосовал."}
      </p>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Вопрос</span>
        <input className={`${styles.input} ${styles.questionInput}`} placeholder="Вопрос" aria-label="Вопрос" autoFocus value={step.question} onChange={(e) => { updateStep({ question: e.target.value }); setError(null); }} />
      </label>
      <div className={styles.optionsHeader}>
        <span>Варианты ответа</span>
        <span>{step.options.filter((option) => option.trim()).length}/{MAX_OPTIONS}</span>
      </div>
      <div className={styles.list}>
        {step.options.map((value, i) => (
          <div key={i} className={styles.optionRow}>
            <span className={styles.optionNumber}>{i + 1}</span>
            {quiz ? (
              <button type="button" className={step.correctIndex === i ? `${styles.correct} ${styles.active}` : styles.correct} title={step.correctIndex === i ? "Это правильный вариант" : "Правильный ответ"} aria-label={`Правильный ответ: вариант ${i + 1}`} aria-pressed={step.correctIndex === i} onClick={() => updateStep({ correctIndex: i })}>
                {step.correctIndex === i ? "✓" : ""}
              </button>
            ) : null}
            <input
              className={styles.input}
              placeholder={`Вариант ${i + 1}`}
              aria-label={`Вариант ${i + 1}`}
              value={value}
              onChange={(e) => updateStep({ options: step.options.map((o, j) => (j === i ? e.target.value : o)) })}
            />
            {step.options.length > 2 ? (
              <button type="button" className={styles.removeOption} title="Удалить вариант" aria-label={`Удалить вариант ${i + 1}`} onClick={() => removeOption(i)}>
                <Icon name="X" size={15} />
              </button>
            ) : null}
          </div>
        ))}
        {step.options.length < MAX_OPTIONS ? (
          <button type="button" className={styles.add} onClick={() => updateStep({ options: [...step.options, ""] })}>
            + Добавить вариант
          </button>
        ) : null}
      </div>
      {!quiz ? (
        <label className={`${styles.check} ${styles.setting}`}>
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
          <span>Несколько вариантов ответа</span>
        </label>
      ) : null}
      <label className={`${styles.check} ${styles.setting}`}>
        <input type="checkbox" checked={votersVisible} onChange={(e) => setVotersVisible(e.target.checked)} />
        <span>Показывать, кто как проголосовал</span>
      </label>
      <label className={`${styles.fieldRow} ${styles.setting}`}>
        <span>Завершить автоматически</span>
        <select className={styles.select} aria-label="Время до завершения" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
          <option value={0}>Без ограничения</option>
          <option value={5 * 60_000}>Через 5 минут</option>
          <option value={60 * 60_000}>Через час</option>
          <option value={24 * 60 * 60_000}>Через сутки</option>
          <option value={7 * 24 * 60 * 60_000}>Через неделю</option>
        </select>
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        {stepIndex > 0 ? <Button variant="secondary" onClick={() => { setStepIndex((i) => i - 1); setError(null); }}>Назад</Button> : null}
        {stepIndex < steps.length - 1 ? <Button variant="secondary" onClick={() => { setStepIndex((i) => i + 1); setError(null); }}>Дальше</Button> : <Button onClick={create}>Создать</Button>}
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
      </div>
    </Dialog>
  );
}
