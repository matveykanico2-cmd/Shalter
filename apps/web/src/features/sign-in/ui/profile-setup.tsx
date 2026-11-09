import { type FormEvent, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { AvatarEditor, type AvatarValue, BirthdayField, Button, PhoneField, TextField } from "@/shared/ui";

import { type SignedInUser, updateNewProfile } from "../api/sign-in";

import styles from "./sign-in.module.css";
import { UsernameInput } from "./username-input";

type Props = {
  user: SignedInUser;
  /** Пароль из первого шага: сервер просит его, чтобы привязать номер телефона. */
  password: string;
  onDone: (user: SignedInUser) => void;
};

/**
 * Второй шаг регистрации: аккаунт уже создан по почте и паролю, здесь — фото или смайл, имя,
 * юзернейм, телефон и день рождения. Всё необязательно: «Пропустить» — с именем из почты и
 * придуманным юзернеймом, их можно сменить потом в настройках.
 */
export function ProfileSetup({ user, password, onDone }: Props) {
  const initialName = user.name ?? "";
  const initialUsername = user.username ?? "";
  const [avatar, setAvatar] = useState<AvatarValue>({ image: null, emoji: null });
  const [name, setName] = useState(initialName);
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState(initialUsername);
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState<string | null>(null);
  const [birthdayError, setBirthdayError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const first = name.trim();
    if (!first) return setError("Введите имя");
    if (birthdayError) return setError(birthdayError);
    const patch: Record<string, unknown> = {};
    const fullName = [first, lastName.trim()].filter(Boolean).join(" ");
    if (fullName !== initialName) patch.name = fullName;
    if (lastName.trim()) patch.lastName = lastName.trim();
    if (username && username !== initialUsername) patch.username = username;
    if (phone) Object.assign(patch, { phone, currentPassword: password });
    if (birthday) patch.birthday = birthday;
    if (avatar.image) patch.avatarImage = avatar.image;
    if (avatar.emoji) patch.avatarEmoji = avatar.emoji;
    if (!Object.keys(patch).length) return onDone(user);
    setError(null);
    setPending(true);
    try {
      onDone(await updateNewProfile(user.id, patch));
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)}>
      <p className={styles.instructions}>Аккаунт создан. Расскажите о себе — так друзьям будет проще вас найти. Всё это можно поменять потом в настройках.</p>
      <AvatarEditor name={name} image={avatar.image} emoji={avatar.emoji} size={88} photoSize={256} onChange={setAvatar} />
      <TextField placeholder="Имя" aria-label="Имя" maxLength={64} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <TextField placeholder="Фамилия (необязательно)" aria-label="Фамилия" maxLength={60} value={lastName} onChange={(e) => setLastName(e.target.value)} />
      <UsernameInput value={username} own={initialUsername} onChange={setUsername} />
      <PhoneField initial="" onChange={setPhone} placeholder="Телефон (необязательно)" />
      <BirthdayField
        value={birthday}
        onChange={(iso, err) => {
          setBirthday(iso || null);
          setBirthdayError(err);
        }}
      />
      <p className={styles.hint}>Телефон и день рождения — необязательно: по номеру вас найдут друзья, а в день рождения смогут поздравить.</p>
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : "Готово"}
      </Button>
      <button type="button" className={`${styles.link} ${styles.muted}`} disabled={pending} onClick={() => onDone(user)}>
        Пропустить
      </button>
    </form>
  );
}
