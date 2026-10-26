import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { chatQueries } from "@/entities/chat";
import {
  type CatalogGift,
  closeGiftShop,
  GIFT_BACKDROPS,
  giftApi,
  GiftArt,
  GiftBackdrop,
  giftBackdropById,
  giftBackgroundValue,
  GiftGrid,
  giftQueries,
  type GiftRecipient,
  type GiftShopRequest,
  GiftTile,
} from "@/entities/gift";
import { useSession } from "@/entities/session";
import { openStarsDialog, starsQueries, usePurchaseWindows } from "@/entities/stars";
import { closeUserProfile, ContactPicker, userQueries } from "@/entities/user";

import { ApiError } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { AnimatorDialog, askConfirm, askText, Avatar, EmojiText, Icon, type IconName, toast } from "@/shared/ui";

import styles from "./gift-shop.module.css";

// Окно «Отправить подарок» как popups/sendGift.tsx в tweb (openGiftShopDialog в giftShopDialog.js):
// первая страница — получатель и сетка подарков с чипами-категориями, вторая — превью подарка
// в чате, подпись, «Скрыть моё имя» и кнопка «Отправить подарок за ⭐ N».

const CATEGORIES = [
  { id: "all", label: "Все" },
  { id: "rare", label: "Редкие" },
  { id: "available", label: "В наличии" },
  { id: "mine", label: "Мои" },
] as const;
type Category = (typeof CATEGORIES)[number]["id"];
const PRICE_CHIPS = [10, 20, 30, 50];
const NOTE_MAX = 128;

const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("ru-RU");
// Баланс в шапке — коротко, как в Telegram: «12 345», «1,2 млн», «5 млрд»; огромное — «999+ трлн».
function fmtShort(n: number) {
  if (!Number.isFinite(n) || n >= 1e15) return "999+ трлн";
  if (n < 100000) return fmt(n);
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

const isSoldOut = (g: CatalogGift) => g.supply != null && (g.remaining ?? 0) <= 0;

type Chosen = { gift: CatalogGift; mine: boolean };
type Editor = { gift: CatalogGift | null };

export function GiftShopDialog({ request }: { request: GiftShopRequest }) {
  const me = useSession().data?.user;
  const client = useQueryClient();
  const navigate = useNavigate();
  const shop = useQuery(giftQueries.shop());
  const custom = useQuery(giftQueries.custom());
  const gifts = shop.data?.gifts ?? [];
  const myGifts = custom.data ?? [];
  const balance = shop.data?.balance ?? 0;
  const loaded = !shop.isPending && !custom.isPending;

  const [target, setTarget] = useState<GiftRecipient | null>(request.recipient?.id === me?.id ? null : request.recipient);
  const [category, setCategory] = useState<Category>("all");
  const [priceFilter, setPriceFilter] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [enter, setEnter] = useState<"forward" | "back" | null>(null);
  // Подарок, выбранный заранее, — пока каталог не загрузился; потом null.
  const preset = useRef(request.gift);
  const [backdropId, setBackdropId] = useState(request.backdropId ?? "");
  const [picking, setPicking] = useState<(() => void) | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const listScroll = useRef<HTMLDivElement>(null);

  // Окно звёзд закрылось — баланс мог вырасти (load в старом окне).
  const starsOpen = usePurchaseWindows().stars;
  const wasStarsOpen = useRef(starsOpen);
  useEffect(() => {
    if (wasStarsOpen.current && !starsOpen) void shop.refetch();
    wasStarsOpen.current = starsOpen;
  }, [starsOpen, shop]);

  const pickRecipient = (then?: () => void) => setPicking(() => then ?? (() => {}));

  const choose = (gift: CatalogGift, mine: boolean) => {
    const go = () => {
      setChosen({ gift, mine });
      setEnter("forward");
    };
    if (!target) return pickRecipient(go);
    go();
  };
  const back = () => {
    setChosen(null);
    setEnter("back");
  };

  // Подарок выбран заранее — сразу на страницу отправки, когда каталог загрузится.
  useEffect(() => {
    const wanted = preset.current;
    if (!wanted || !loaded) return;
    preset.current = null;
    const presetId = wanted.giftId ?? wanted.id;
    const fromCatalog = gifts.find((g) => g.id === presetId);
    const fromMine = !fromCatalog ? myGifts.find((g) => g.id === presetId) : undefined;
    const found = fromCatalog ?? fromMine;
    if (!found) return toast(`«${wanted.name ?? "Этот подарок"}» сейчас нельзя купить — выберите другой`);
    if (fromCatalog && isSoldOut(fromCatalog)) return toast(`«${fromCatalog.name}» распродан — выберите другой`);
    choose(found, !!fromMine);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз, когда каталог загрузился
  }, [loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Поверх магазина открыто другое окно (выбор получателя, вопрос) — Escape его.
      if (e.key !== "Escape" || picking || editor || document.querySelector('[role="dialog"][aria-modal="true"]:not([data-gift-shop])')) return;
      if (chosen) back();
      else closeGiftShop();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chosen, picking, editor]);

  const send = async (note: string, anonymous: boolean) => {
    if (!chosen || !target) return false;
    // Последняя проверка перед запросом: подарок себе не отправляем.
    if (target.id === me?.id) {
      toast("Нельзя подарить подарок самому себе");
      setTarget(null);
      back();
      return false;
    }
    const { gift, mine } = chosen;
    try {
      const args = {
        giftId: gift.id,
        recipientId: target.id,
        background: giftBackgroundValue(backdropId ? giftBackdropById(backdropId) : null),
        anonymous,
        note: note.trim() || null,
      };
      const res = mine ? await giftApi.sendCustom(args) : await giftApi.buy(args);
      if (res.balance != null) client.setQueryData(giftQueries.shop().queryKey, (old) => (old ? { ...old, balance: res.balance! } : old));
      void client.invalidateQueries({ queryKey: starsQueries.baseKey });
      // Как в Telegram: после отправки — сразу в чат с получателем, где лежит подарок.
      toast(`«${gift.name}» отправлен — ${target.name}${res.serial ? `, №${res.serial}` : ""}`);
      closeGiftShop();
      if (res.chatId) {
        closeUserProfile();
        void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
        void navigate(`/chat/${res.chatId}`);
      }
      return true;
    } catch (err) {
      const text = errorText(err, "Не удалось отправить подарок");
      if (err instanceof ApiError && /не хватает/i.test(text)) {
        if (await askConfirm(`${text}. Открыть покупку звёзд?`, { okLabel: "OK" })) openStarsDialog();
        return false;
      }
      toast(text, { error: true });
      void shop.refetch();
      void custom.refetch();
      return false;
    }
  };

  const createMine = () => setEditor({ gift: null });
  const saveMine = async (scene: unknown) => {
    const editing = editor?.gift;
    try {
      if (editing) {
        const { gift: updated } = await giftApi.updateCustom(editing.id, { scene });
        client.setQueryData(giftQueries.custom().queryKey, (old) => old?.map((g) => (g.id === updated.id ? updated : g)));
        setEditor(null);
        return;
      }
      setEditor(null);
      const name = ((await askText("Название подарка")) || "").trim();
      if (!name) return;
      const { gift } = await giftApi.createCustom(name, scene);
      client.setQueryData(giftQueries.custom().queryKey, (old) => [gift, ...(old ?? [])]);
      toast(`Подарок «${gift.name}» сохранён`);
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };
  const deleteMine = async (gift: CatalogGift) => {
    if (!(await askConfirm(`Удалить подарок «${gift.name}»?`, { okLabel: "Удалить", danger: true }))) return;
    try {
      await giftApi.deleteCustom(gift.id);
      client.setQueryData(giftQueries.custom().queryKey, (old) => old?.filter((g) => g.id !== gift.id));
    } catch (err) {
      toast(errorText(err, "Не удалось удалить"), { error: true });
    }
  };

  const balancePill = (
    <button type="button" className={styles.balance} title={`Баланс: ${fmt(balance)} ⭐ — купить звёзды`} onClick={() => openStarsDialog()}>
      <span className={styles.balanceLabel}>Баланс</span> <span className={styles.balanceValue}>⭐ {fmtShort(balance)}</span>
    </button>
  );
  const iconButton = (icon: IconName, label: string, onClick: () => void) => (
    <button type="button" className={styles.iconButton} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={22} />
    </button>
  );

  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeGiftShop();
      }}
    >
      <div className={scrolled && !chosen ? `${styles.popup} ${styles.scrolled}` : styles.popup} role="dialog" aria-modal="true" aria-label="Отправить подарок" data-gift-shop>
        {/* Сетка с анимациями при выборе подарка не размонтируется, а прячется: «Назад» не пересоздаёт плееры. */}
        <div className={[styles.page, enter === "back" ? styles.back : ""].filter(Boolean).join(" ")} hidden={!!chosen}>
          <div className={styles.header}>
            {iconButton("X", "Закрыть", closeGiftShop)}
            <div className={styles.headerTitle}>Отправить подарок</div>
            {balancePill}
          </div>
          <div ref={listScroll} className={styles.scroll} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}>
            {request.gift && !loaded ? (
              <p className={styles.empty}>Загружаем…</p>
            ) : (
              <>
                <RecipientHero target={target} onPick={() => pickRecipient()} />
                <div className={styles.chips} role="tablist">
                  {CATEGORIES.map((c) => {
                    const active = category === c.id && !priceFilter;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                        onClick={() => {
                          setCategory(c.id);
                          setPriceFilter(null);
                        }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                  {category === "mine"
                    ? null
                    : PRICE_CHIPS.map((p) => (
                        <button key={p} type="button" className={priceFilter === p ? `${styles.chip} ${styles.chipActive}` : styles.chip} onClick={() => setPriceFilter(priceFilter === p ? null : p)}>
                          ⭐ {p}
                        </button>
                      ))}
                </div>
                <div className={styles.gridWrap}>
                  <GiftList
                    loaded={loaded}
                    error={shop.isError ? errorText(shop.error, "Не удалось загрузить подарки") : null}
                    category={category}
                    priceFilter={priceFilter}
                    gifts={gifts}
                    myGifts={myGifts}
                    onChoose={choose}
                    onCreate={createMine}
                    onEdit={(g) => setEditor({ gift: g })}
                    onDelete={(g) => void deleteMine(g)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        {chosen && target ? (
          <ChosenPage
            key={chosen.gift.id}
            chosen={chosen}
            target={target}
            balance={balance}
            me={me ?? null}
            backdropId={backdropId}
            onBackdrop={setBackdropId}
            onBack={back}
            onSend={send}
            header={
              <div className={`${styles.header} ${styles.solid}`}>
                {iconButton("ChevronLeft", "Назад", back)}
                <div className={styles.headerTitle}>Отправить подарок</div>
                {balancePill}
              </div>
            }
          />
        ) : null}
      </div>
      {picking ? (
        <ContactPicker
          title="Кому подарить"
          exclude={me ? [me.id] : []}
          onPick={(u) => {
            setTarget({ id: u.id, name: u.name });
            const then = picking;
            setPicking(null);
            // Получатель выбран — продолжаем то, ради чего спрашивали (выбор подарка).
            setTimeout(then, 0);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {editor ? (
        <AnimatorDialog
          title={editor.gift ? "Изменить подарок" : "Нарисовать подарок"}
          saveLabel={editor.gift ? "Сохранить" : "Сохранить подарок"}
          initial={editor.gift?.scene ?? null}
          onSave={(scene) => void saveMine(scene)}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>,
    document.body
  );
}

function RecipientHero({ target, onPick }: { target: GiftRecipient | null; onPick: () => void }) {
  const profile = useQuery({ ...userQueries.profile(target?.id ?? ""), enabled: !!target }).data?.user;
  const u = target ? { name: target.name, avatarColor: profile?.avatarColor, avatarImage: profile?.avatarImage } : null;
  return (
    <div className={styles.hero}>
      <div className={styles.glow} />
      {u ? (
        <button type="button" className={styles.heroAvatar} title="Сменить получателя" onClick={onPick}>
          <Avatar size={100} name={u.name} color={u.avatarColor} image={u.avatarImage} />
        </button>
      ) : (
        <button type="button" className={`${styles.heroAvatar} ${styles.heroEmpty}`} title="Выбрать получателя" onClick={onPick}>
          <Icon name="Gift" size={44} />
        </button>
      )}
      <h2 className={styles.title}>Отправить подарок</h2>
      <p className={styles.subtitle}>
        {target ? `${target.name} получит подарок в профиль, а в вашем чате появится сообщение о нём.` : "Выберите, кому подарить, — подарок появится в профиле получателя и в чате."}
      </p>
      <button type="button" className={styles.recipientChip} onClick={onPick}>
        {target ? `Кому: ${target.name} · изменить` : "Выбрать получателя"}
      </button>
    </div>
  );
}

type ListProps = {
  loaded: boolean;
  error: string | null;
  category: Category;
  priceFilter: number | null;
  gifts: CatalogGift[];
  myGifts: CatalogGift[];
  onChoose: (g: CatalogGift, mine: boolean) => void;
  onCreate: () => void;
  onEdit: (g: CatalogGift) => void;
  onDelete: (g: CatalogGift) => void;
};

function GiftList({ loaded, error, category, priceFilter, gifts, myGifts, onChoose, onCreate, onEdit, onDelete }: ListProps) {
  if (!loaded) return <p className={styles.empty}>Загружаем…</p>;
  if (error) return <p className={styles.empty}>{error}</p>;
  if (category === "mine") {
    return (
      <GiftGrid>
        <button type="button" className={styles.create} onClick={onCreate}>
          <span className={styles.createIcon}>
            <Icon name="Plus" size={28} />
          </span>
          <span className={styles.createLabel}>Нарисовать</span>
        </button>
        {myGifts.map((g) => (
          <div key={g.id} className={styles.mineWrap}>
            <GiftTile gift={g} label={g.name} title={`Подарить «${g.name}»`} price="free" onClick={() => onChoose(g, true)} />
            <div className={styles.mineTools}>
              <button type="button" className={styles.mineTool} title="Изменить" aria-label="Изменить" onClick={() => onEdit(g)}>
                <Icon name="Edit" size={14} />
              </button>
              <button type="button" className={`${styles.mineTool} ${styles.mineToolDanger}`} title="Удалить" aria-label="Удалить" onClick={() => onDelete(g)}>
                <Icon name="Trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </GiftGrid>
    );
  }
  let list = gifts;
  if (category === "rare") list = list.filter((g) => g.exclusive || g.supply);
  if (category === "available") list = list.filter((g) => !g.supply || (g.remaining ?? 0) > 0);
  if (priceFilter) list = list.filter((g) => g.priceStars <= priceFilter);
  if (!list.length) return <p className={styles.empty}>Под фильтр ничего не подошло</p>;
  return (
    <GiftGrid>
      {list.map((g) => {
        const soldOut = isSoldOut(g);
        const badge = soldOut ? { text: "распродан", tone: "soldOut" as const } : g.supply ? { text: "лимит" } : g.exclusive ? { text: "редкий", tone: "rare" as const } : null;
        return (
          <GiftTile
            key={g.id}
            gift={g}
            label={g.name}
            title={soldOut ? `${g.name} — распродан` : `${g.name} — ⭐ ${fmt(g.priceStars)}`}
            badge={badge}
            soldOut={soldOut}
            price={g.priceStars}
            onClick={() => (soldOut ? toast(`«${g.name}» распродан`) : onChoose(g, false))}
          />
        );
      })}
    </GiftGrid>
  );
}

type ChosenProps = {
  chosen: Chosen;
  target: GiftRecipient;
  balance: number;
  me: { name: string; isPremium: boolean; avatarColor?: string; avatarImage?: string } | null;
  backdropId: string;
  onBackdrop: (id: string) => void;
  onBack: () => void;
  onSend: (note: string, anonymous: boolean) => Promise<boolean>;
  header: ReactNode;
};

function ChosenPage({ chosen, target, balance, me, backdropId, onBackdrop, onSend, header }: ChosenProps) {
  const { gift, mine } = chosen;
  const price = mine ? 0 : (gift.priceStars ?? 0);
  const canAnon = !!me?.isPremium;
  const short = price > balance;
  const [note, setNote] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) input.current?.focus();
  }, []);

  const send = async () => {
    if (sending) return;
    setSending(true);
    if (!(await onSend(note, anonymous))) setSending(false);
  };

  const left = Math.max(0, gift.remaining ?? 0);
  const sold = (gift.supply ?? 0) - left;
  const pct = gift.supply ? Math.max(4, Math.min(100, (sold / gift.supply) * 100)) : 0;
  const picked = giftBackdropById(backdropId);

  return (
    <div className={`${styles.page} ${styles.forward}`}>
      {header}
      <div className={styles.scroll}>
        <div className={styles.preview}>
          <div className={styles.gift}>
            <div className={styles.service}>{mine ? "Вы отправили подарок" : `Вы отправили подарок за ${fmt(price)} ⭐`}</div>
            <div className={styles.box}>
              {gift.supply ? <span className={styles.ribbon}>1 из {fmt(gift.supply)}</span> : null}
              {/* Фон в превью — тот же, что уедет с подарком. */}
              {picked ? <GiftBackdrop src={picked} /> : null}
              <div className={styles.boxArt}>
                <GiftArt gift={gift} size={120} />
              </div>
              <p className={styles.from}>
                Подарок от{" "}
                <span className={styles.fromUser}>
                  {anonymous ? null : <Avatar size={16} name={me?.name ?? "Вы"} color={me?.avatarColor} image={me?.avatarImage} />}
                  <span>{anonymous ? "Аноним" : (me?.name ?? "Вы")}</span>
                </span>
              </p>
              <p className={styles.name}>{gift.name}</p>
              {note ? <p className={styles.message}>{note}</p> : <p className={styles.note}>{target.name} сможет показать этот подарок в своём профиле.</p>}
            </div>
          </div>
        </div>
        <div className={styles.sheet}>
          {!mine && gift.supply ? (
            <div className={styles.limited}>
              <div className={styles.limitedBar}>
                <div className={styles.limitedFill} style={{ width: `${pct}%` }} />
                <div className={styles.limitedText}>
                  <span>осталось {fmt(left)}</span>
                  <span>продано {fmt(sold)}</span>
                </div>
              </div>
            </div>
          ) : null}
          <label className={styles.inputWrap}>
            <input
              ref={input}
              type="text"
              className={styles.input}
              placeholder="Добавить сообщение"
              maxLength={NOTE_MAX}
              aria-label="Сообщение к подарку"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <span className={styles.counter}>{NOTE_MAX - note.length}</span>
          </label>
          <label className={canAnon ? styles.row : `${styles.row} ${styles.rowDisabled}`}>
            <span className={styles.rowTitle}>Скрыть моё имя</span>
            <span className={styles.switch}>
              <input type="checkbox" className={styles.switchInput} checked={anonymous} disabled={!canAnon} onChange={(e) => setAnonymous(e.target.checked)} />
              <span className={styles.track} />
            </span>
          </label>
        </div>
        <div className={styles.bgPicker}>
          <span className={styles.bgLabel}>Фон подарка · {picked?.name ?? "Без фона"}</span>
          <div className={styles.swatches} role="radiogroup" aria-label="Фон подарка">
            {GIFT_BACKDROPS.map((option) => {
              const selected = option.id === backdropId;
              return (
                <button
                  key={option.id || "none"}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={option.name}
                  title={option.rarity != null ? `${option.name} — ${option.rarity}%` : option.name}
                  className={selected ? `${styles.swatch} ${styles.swatchSelected}` : styles.swatch}
                  onClick={() => onBackdrop(option.id)}
                >
                  {option.id ? <GiftBackdrop src={option} small /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <p className={styles.hint}>{canAnon ? `${target.name} и посетители профиля не увидят, от кого этот подарок.` : "Анонимные подарки доступны с Premium."}</p>
        {short ? (
          <p className={`${styles.hint} ${styles.warn}`}>
            <EmojiText text={`Не хватает ${fmt(price - balance)} ⭐ — при отправке предложим докупить.`} />
          </p>
        ) : null}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.send} disabled={sending} onClick={() => void send()}>
          {sending ? "Отправляем…" : mine ? "Отправить подарок" : `Отправить подарок за ⭐ ${fmt(price)}`}
        </button>
      </div>
    </div>
  );
}
