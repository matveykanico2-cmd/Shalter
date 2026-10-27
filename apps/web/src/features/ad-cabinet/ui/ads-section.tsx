import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { handlePurchaseResponse } from "@/entities/stars";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { Button, Icon, SettingsPage } from "@/shared/ui";

import { type AdAttachment, adsQueries, requestAds, setAdContent } from "../api/ads";

import { AdCabinet } from "./ad-cabinet";
import styles from "./ads.module.css";

const MAX_AD_ATTACHMENTS = 6;

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read"));
    reader.readAsDataURL(file);
  });

/**
 * «Настройки → Реклама» (renderAds): кабинет кампаний и объявление на своей странице
 * (купить кабинет рекламы — заявка админу или оплата донатом; текст, ссылка и вложения).
 */
export function AdsSection() {
  return (
    <SettingsPage subtitle="Кабинет для бизнеса: кампании с бюджетом в звёздах, показы в каталоге каналов и объявление на своей странице">
      <AdCabinet />
      <p className={styles.sectionTitle}>Объявление на своей странице</p>
      <ProfileAd />
    </SettingsPage>
  );
}

function ProfileAd() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const info = useQuery(adsQueries.me()).data;
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AdAttachment[] | null>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!saveStatus) return;
    const t = setTimeout(() => setSaveStatus(null), 2000);
    return () => clearTimeout(t);
  }, [saveStatus]);

  if (!info) return null;
  const atts = attachments ?? info.adAttachments;

  const buy = async () => {
    setBuying(true);
    setBuyError(null);
    try {
      handlePurchaseResponse(await requestAds(), (chatId) => void navigate(`/chat/${chatId}`));
    } catch (err) {
      setBuyError(errorText(err, "Не удалось оформить покупку"));
    }
    setBuying(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { user } = await setAdContent((text ?? info.adText ?? "").trim(), (url ?? info.adUrl ?? "").trim(), atts);
      client.setQueryData(adsQueries.me().queryKey, (d) =>
        d ? { ...d, adText: user.adText ?? undefined, adUrl: user.adUrl ?? undefined, adAttachments: (user.adAttachments as AdAttachment[] | undefined) ?? [] } : d
      );
      setAttachments(null);
      setSaveStatus("Сохранено ✓");
    } catch (err) {
      setSaveStatus(errorText(err, "Не удалось сохранить"));
    }
    setSaving(false);
  };

  const add = async (file: File | undefined, any: boolean) => {
    if (!file || atts.length >= MAX_AD_ATTACHMENTS) return;
    let next: AdAttachment | null = null;
    if (any) next = { kind: "file", name: file.name, size: file.size, url: await fileToDataUrl(file) };
    else if (file.type.startsWith("image/")) next = { kind: "image", name: file.name, url: await fileToImageDataUrl(file, 1600) };
    else if (file.type.startsWith("video/")) next = { kind: "video", name: file.name, size: file.size, url: await fileToDataUrl(file) };
    if (next) setAttachments([...atts, next]);
  };

  const status = info.isAdsActive && info.adsForever ? "Активен навсегда" : info.isAdsActive && info.adsUntil ? `Активен до ${new Date(info.adsUntil).toLocaleDateString("ru-RU")}` : "Объявление увидят все, кто откроет ваш профиль";

  return (
    <>
      <div className={info.isAdsActive ? `${styles.statusCard} ${styles.statusActive}` : styles.statusCard}>
        <span className={styles.statusIcon}>
          <Icon name="Zap" size={26} />
        </span>
        <div>
          <p className={styles.statusTitle}>{info.isAdsActive ? "Кабинет рекламы активен" : "Кабинет рекламы не активен"}</p>
          <p className={styles.hint}>{status}</p>
        </div>
      </div>
      {!info.isAdsActive ? (
        <div className={styles.notes}>
          <p className={styles.notesTitle}>
            Купить кабинет рекламы на {info.days ?? 30} дней — {info.priceRub}₽
          </p>
          <p className={styles.hint}>Оплата переводом администрации Shalter. Нажмите «Купить» — откроется чат, переведите сумму и дождитесь подтверждения.</p>
          <Button disabled={buying} onClick={() => void buy()}>
            {buying ? "Открываем чат…" : "Купить кабинет рекламы"}
          </Button>
          {buyError ? <p className={styles.error}>{buyError}</p> : null}
        </div>
      ) : (
        <div className={styles.notes}>
          <p className={styles.label}>Ваше объявление</p>
          <textarea className={styles.input} rows={3} maxLength={200} placeholder="Текст объявления (до 200 символов)" value={text ?? info.adText ?? ""} onChange={(e) => setText(e.target.value)} />
          <input className={styles.input} placeholder="Ссылка (необязательно) — https://…" value={url ?? info.adUrl ?? ""} onChange={(e) => setUrl(e.target.value)} />
          {atts.length ? (
            <div className={styles.attachments}>
              {atts.map((a, i) => (
                <div key={`${a.url.slice(-24)}:${i}`} className={styles.attachment}>
                  {a.kind === "image" ? <img src={a.url} alt={a.name ?? ""} /> : a.kind === "video" ? <video src={a.url} muted /> : <span className={styles.fileName}>{a.name}</span>}
                  <button type="button" className={styles.remove} title="Удалить вложение" aria-label="Удалить вложение" onClick={() => setAttachments(atts.filter((_, j) => j !== i))}>
                    <Icon name="X" size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className={styles.actions}>
            <Button variant="secondary" disabled={atts.length >= MAX_AD_ATTACHMENTS} onClick={() => mediaInput.current?.click()}>
              Фото/видео
            </Button>
            <Button variant="secondary" disabled={atts.length >= MAX_AD_ATTACHMENTS} onClick={() => fileInput.current?.click()}>
              Файл
            </Button>
            <input
              ref={mediaInput}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void add(file, false);
              }}
            />
            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void add(file, true);
              }}
            />
          </div>
          {atts.length >= MAX_AD_ATTACHMENTS ? <p className={styles.hint}>Максимум {MAX_AD_ATTACHMENTS} вложений</p> : null}
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Сохраняем…" : "Сохранить объявление"}
          </Button>
          {saveStatus ? <p className={styles.hint}>{saveStatus}</p> : null}
        </div>
      )}
    </>
  );
}
