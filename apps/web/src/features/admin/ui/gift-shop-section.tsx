import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { uploadFile } from "@/shared/api";
import type { CustomScene } from "@/shared/lib/anim";
import { errorText } from "@/shared/lib/error-text";
import { AnimatorDialog, askConfirm, Icon, SettingsPage, SettingsSection, TextField, Toggle } from "@/shared/ui";

import { adminQueries, type CatalogGift, createGift, deleteGift, type GiftCatalog, restoreGift, setGiftScene, setGiftSupply } from "../api/admin";
import { fmtNumber } from "../lib/format";

import styles from "./admin.module.css";
import { GiftArt } from "./gift-art";

// «Настройки → Каталог подарков» — renderGiftShop в public/js/views/settings/index.js:
// тиражи эксклюзивов, выпуск новых подарков и рисунки к ним.

type Draft = { emoji: string; name: string; priceStars: string; supply: string; exclusive: boolean; forever: boolean; gifFile: File | null; scene: CustomScene | null };
const EMPTY: Draft = { emoji: "", name: "", priceStars: "", supply: "", exclusive: true, forever: true, gifFile: null, scene: null };

/** Встроенный подарок или свой; свой без выпущенных копий удаляется насовсем, остальные скрываются. */
const canHardDelete = (g: CatalogGift) => !!g.custom && !g.ownerId && (g.issued ?? 0) === 0;

type Animating = { kind: "draft" } | { kind: "gift"; gift: CatalogGift };

export function GiftShopSection() {
  const query = useQuery(adminQueries.giftCatalog());
  if (!query.data) {
    return (
      <SettingsPage>
        {query.isError ? <p className={styles.error}>{errorText(query.error, "Не удалось загрузить каталог")}</p> : <p className={styles.hint}>Загружаем…</p>}
      </SettingsPage>
    );
  }
  return <GiftShop data={query.data} />;
}

function GiftShop({ data }: { data: GiftCatalog }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [animating, setAnimating] = useState<Animating | null>(null);
  const gifRef = useRef<HTMLInputElement>(null);
  const gifPreview = useObjectUrl(draft.gifFile);

  const reload = () => client.invalidateQueries({ queryKey: adminQueries.giftCatalog().queryKey });

  /** Действие с каталогом: текст об успехе, ошибка — красной строкой; потом свежий каталог. */
  const act = async (fn: () => Promise<string>, fallback: string) => {
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await reload();
    } catch (err) {
      setError(errorText(err, fallback));
    }
  };

  const saveSupply = (gift: CatalogGift, value: string) => {
    setBusyId(gift.id);
    void act(async () => {
      await setGiftSupply(gift.id, Number(value));
      return `Тираж «${gift.name}» — теперь ${fmtNumber(Number(value))} шт.`;
    }, "Не удалось изменить тираж").finally(() => setBusyId(null));
  };

  const create = () =>
    act(async () => {
      try {
        let gifUrl: string | undefined;
        if (draft.gifFile) {
          setUploading(true);
          gifUrl = (await uploadFile(draft.gifFile, "gift")).url;
        }
        const { gift } = await createGift({
          emoji: draft.emoji,
          name: draft.name,
          priceStars: Number(draft.priceStars),
          premiumDays: draft.forever ? null : 0,
          supply: draft.exclusive ? Number(draft.supply) : null,
          exclusive: draft.exclusive,
          gifUrl,
          scene: draft.scene || undefined,
        });
        setDraft(EMPTY);
        return `Выпущен подарок ${gift.emoji} «${gift.name}»`;
      } finally {
        setUploading(false);
      }
    }, "Не удалось создать подарок");

  const remove = async (gift: CatalogGift) => {
    if (!canHardDelete(gift) && !(await askConfirm(`Скрыть «${gift.name}» из витрины? Уже подаренные экземпляры останутся у людей. Подарок можно вернуть.`))) return;
    await act(async () => {
      const res = await deleteGift(gift.id);
      return res.hidden ? `Подарок «${gift.name}» скрыт из витрины` : `Подарок «${gift.name}» удалён`;
    }, "Не удалось удалить");
  };

  const limited = data.gifts.filter((g) => g.supply);

  return (
    <SettingsPage subtitle="Тиражи эксклюзивов и выпуск новых подарков">
      {notice ? <p className={styles.notice}>{`✅ ${notice}`}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <SettingsSection title="Выпустить новый подарок">
        <div className={styles.body}>
          <div className={styles.createGrid}>
            <TextField placeholder="🎁" aria-label="Эмодзи" value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
            <TextField placeholder="Название" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <TextField className={styles.mono} type="number" min="1" placeholder="Цена, ⭐" value={draft.priceStars} onChange={(e) => setDraft({ ...draft, priceStars: e.target.value })} />
          <TextField
            className={styles.mono}
            type="number"
            min={String(data.supplyMin)}
            max={String(data.supplyMax)}
            placeholder={`Тираж ${fmtNumber(data.supplyMin)}–${fmtNumber(data.supplyMax)}`}
            value={draft.supply}
            onChange={(e) => setDraft({ ...draft, supply: e.target.value })}
          />
          {draft.scene ? (
            <span className={styles.preview}>
              <GiftArt gift={{ emoji: draft.emoji, scene: draft.scene }} size={72} />
            </span>
          ) : gifPreview ? (
            <span className={styles.preview}>
              <img src={gifPreview} alt="" />
            </span>
          ) : draft.emoji ? (
            <span className={styles.preview}>
              <GiftArt gift={{ emoji: draft.emoji }} size={72} />
            </span>
          ) : null}
          <button type="button" className={styles.pill} onClick={() => setAnimating({ kind: "draft" })}>
            {draft.scene ? "Изменить рисунок" : "✏️ Нарисовать анимацию"}
          </button>
          {draft.scene ? (
            <button type="button" className={styles.dangerLink} onClick={() => setDraft({ ...draft, scene: null })}>
              Убрать рисунок
            </button>
          ) : null}
          <button type="button" className={styles.pill} disabled={uploading} onClick={() => gifRef.current?.click()}>
            {draft.gifFile ? "Заменить гифку" : "Загрузить гифку (необязательно)"}
          </button>
          {draft.gifFile ? (
            <button type="button" className={styles.dangerLink} onClick={() => setDraft({ ...draft, gifFile: null })}>
              Убрать гифку — встроенная анимация
            </button>
          ) : (
            <p className={styles.hint}>Без гифки и рисунка подарок анимируется встроенной анимацией по эмодзи.</p>
          )}
          <input
            ref={gifRef}
            type="file"
            accept="image/gif,video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setDraft((d) => ({ ...d, gifFile: file }));
            }}
          />
          <button type="button" className={styles.toggleRow} aria-pressed={draft.exclusive} onClick={() => setDraft({ ...draft, exclusive: !draft.exclusive })}>
            <span>
              <span className={styles.toggleTitle}>Эксклюзив с тиражом</span>
              <span className={styles.rowMeta}>{`Каждая копия получает свой номер. Тираж — от ${fmtNumber(data.supplyMin)} до ${fmtNumber(data.supplyMax)}.`}</span>
            </span>
            <Toggle checked={draft.exclusive} />
          </button>
          <button type="button" className={styles.toggleRow} aria-pressed={draft.forever} onClick={() => setDraft({ ...draft, forever: !draft.forever })}>
            <span>
              <span className={styles.toggleTitle}>Даёт Premium навсегда</span>
              <span className={styles.rowMeta}>Иначе подарок чисто декоративный</span>
            </span>
            <Toggle checked={draft.forever} />
          </button>
          <button type="button" className={styles.accent} disabled={uploading} onClick={() => void create()}>
            {uploading ? "Загружаем гифку…" : "Выпустить"}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title={`Все подарки (${data.gifts.length})`}>
        {data.gifts.map((gift) => (
          <div key={gift.id} className={gift.hidden ? `${styles.giftRow} ${styles.hidden}` : styles.giftRow}>
            <GiftArt gift={gift} />
            <div className={styles.giftBody}>
              <p className={styles.giftName}>
                {gift.name}
                <span className={styles.tag}>{gift.custom && !gift.ownerId ? "свой" : "встроенный"}</span>
                {gift.scene ? <span className={styles.tag}>рисунок</span> : null}
                {gift.hidden ? <span className={styles.tag}>скрыт</span> : null}
              </p>
              <p className={styles.giftSub}>{`⭐ ${fmtNumber(gift.priceStars)}${gift.supply ? ` · тираж ${fmtNumber(gift.supply)}` : " · без тиража"}`}</p>
            </div>
            <button type="button" className={styles.iconBtn} title={gift.scene ? "Изменить рисунок" : "Нарисовать"} aria-label={gift.scene ? "Изменить рисунок" : "Нарисовать"} onClick={() => setAnimating({ kind: "gift", gift })}>
              <Icon name="Edit" size={15} />
            </button>
            {gift.scene ? (
              <button
                type="button"
                className={styles.iconBtn}
                title="Убрать рисунок"
                aria-label="Убрать рисунок"
                onClick={() =>
                  void act(async () => {
                    await setGiftScene(gift.id, null);
                    return `Рисунок «${gift.name}» убран`;
                  }, "Не удалось убрать рисунок")
                }
              >
                ↺
              </button>
            ) : null}
            {gift.hidden ? (
              <button
                type="button"
                className={styles.pill}
                title="Вернуть в витрину"
                onClick={() =>
                  void act(async () => {
                    await restoreGift(gift.id);
                    return `Подарок «${gift.name}» возвращён в витрину`;
                  }, "Не удалось восстановить")
                }
              >
                Вернуть
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.danger}`}
                title={canHardDelete(gift) ? "Удалить" : "Скрыть из витрины"}
                aria-label={canHardDelete(gift) ? "Удалить" : "Скрыть из витрины"}
                onClick={() => void remove(gift)}
              >
                <Icon name="Trash" size={15} />
              </button>
            )}
          </div>
        ))}
      </SettingsSection>

      <SettingsSection title={`Тиражи (${limited.length})`}>
        {limited.length ? (
          limited.map((gift) => <SupplyRow key={gift.id} gift={gift} data={data} busy={busyId === gift.id} onSave={saveSupply} onRemove={remove} />)
        ) : (
          <p className={styles.empty}>Ограниченных подарков нет</p>
        )}
      </SettingsSection>

      {animating ? (
        <AnimatorDialog
          title={animating.kind === "draft" ? "Нарисовать подарок" : `Нарисовать «${animating.gift.name}»`}
          saveLabel={animating.kind === "draft" ? "Готово" : "Сохранить рисунок"}
          initial={animating.kind === "draft" ? draft.scene : (animating.gift.scene ?? null)}
          onClose={() => setAnimating(null)}
          onSave={(scene) => {
            if (animating.kind === "draft") {
              setDraft((d) => ({ ...d, scene }));
              return;
            }
            const gift = animating.gift;
            void act(async () => {
              await setGiftScene(gift.id, scene);
              return `Рисунок «${gift.name}» обновлён`;
            }, "Не удалось сохранить рисунок");
          }}
        />
      ) : null}
    </SettingsPage>
  );
}

function SupplyRow({ gift, data, busy, onSave, onRemove }: { gift: CatalogGift; data: GiftCatalog; busy: boolean; onSave: (g: CatalogGift, v: string) => void; onRemove: (g: CatalogGift) => void }) {
  const [value, setValue] = useState(String(gift.supply));
  return (
    <div className={styles.giftRow}>
      <span className={styles.giftArt} aria-hidden>
        {gift.emoji}
      </span>
      <div className={styles.giftBody}>
        <p className={styles.giftName}>
          {gift.name}
          {gift.custom ? <span className={styles.tag}>свой</span> : null}
        </p>
        <p className={styles.giftSub}>{`⭐ ${fmtNumber(gift.priceStars)} · выпущено ${fmtNumber(gift.issued ?? 0)} · осталось ${fmtNumber(gift.remaining ?? 0)}`}</p>
      </div>
      <TextField
        className={`${styles.mono} ${styles.supplyInput}`}
        type="number"
        min={String(data.supplyMin)}
        max={String(data.supplyMax)}
        step="1"
        aria-label={`Тираж «${gift.name}»`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" className={styles.pill} disabled={busy} onClick={() => onSave(gift, value)}>
        {busy ? "…" : "Сохранить"}
      </button>
      {gift.custom && (gift.issued ?? 0) === 0 ? (
        <button type="button" className={styles.iconBtn} title="Удалить" aria-label="Удалить" onClick={() => onRemove(gift)}>
          <Icon name="Trash" size={15} />
        </button>
      ) : null}
    </div>
  );
}

/** Адрес превью выбранного файла; освобождается, когда файл сменили или убрали. */
function useObjectUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );
  return url;
}
