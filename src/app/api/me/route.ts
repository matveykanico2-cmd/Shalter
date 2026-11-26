import { route, HttpError } from "@/lib/server/http";
import { get, run } from "@/lib/server/db";
import { currentUser, requireUser, USERNAME_RE, type UserRow } from "@/lib/server/auth";
import { saveUpload, deleteUpload } from "@/lib/server/media";
import type { Me } from "@/lib/types";

const toMe = (u: UserRow): Me => ({
  id: u.id,
  username: u.username,
  name: u.name,
  lastName: u.last_name,
  avatar: u.avatar,
  verified: !!u.verified,
  email: u.email,
  phone: u.phone,
  bio: u.bio,
  website: u.website,
  privateAccount: !!u.private_account,
  showActivity: !!u.show_activity,
  allowMessages: !!u.allow_messages,
});

export const GET = route(async () => {
  const user = await currentUser();
  return { user: user ? toMe(user) : null };
});

// Edit profile. Multipart form: name, username, bio, website, email, avatar (file), removeAvatar.
export const PATCH = route(async (req) => {
  const me = await requireUser();
  const form = await req.formData();
  const field = (k: string, fallback: string) => (form.has(k) ? String(form.get(k)).trim() : fallback);

  const username = field("username", me.username).toLowerCase();
  const name = field("name", me.name).slice(0, 30);
  const lastName = field("lastName", me.last_name).slice(0, 40);
  const bio = field("bio", me.bio).slice(0, 150);
  const website = field("website", me.website).slice(0, 200);
  const email = field("email", me.email);
  const phone = field("phone", me.phone ?? "");
  const privateAccount = form.has("privateAccount") ? form.get("privateAccount") === "1" : !!me.private_account;
  const showActivity = form.has("showActivity") ? form.get("showActivity") === "1" : !!me.show_activity;
  const allowMessages = form.has("allowMessages") ? form.get("allowMessages") === "1" : !!me.allow_messages;

  if (!USERNAME_RE.test(username))
    throw new HttpError(400, "Usernames can only use letters, numbers, underscores and periods.");
  if (username !== me.username.toLowerCase() && get("SELECT 1 FROM users WHERE username = ? AND id != ?", username, me.id))
    throw new HttpError(409, "This username isn't available. Please try another.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (get("SELECT 1 FROM users WHERE email = ? AND id != ?", email, me.id))
    throw new HttpError(409, "Another account is using the same email.");
  if (phone && get("SELECT 1 FROM users WHERE phone = ? AND id != ?", phone, me.id))
    throw new HttpError(409, "Another account is using the same phone number.");

  let avatar = me.avatar;
  const file = form.get("avatar");
  if (file instanceof File && file.size > 0) {
    avatar = (await saveUpload(file, "image")).url;
    await deleteUpload(me.avatar);
  } else if (form.get("removeAvatar") === "1") {
    await deleteUpload(me.avatar);
    avatar = null;
  }

  run(
    "UPDATE users SET username = ?, name = ?, last_name = ?, bio = ?, website = ?, email = ?, phone = ?, avatar = ?, private_account = ?, show_activity = ?, allow_messages = ? WHERE id = ?",
    username,
    name,
    lastName,
    bio,
    website,
    email,
    phone || null,
    avatar,
    privateAccount ? 1 : 0,
    showActivity ? 1 : 0,
    allowMessages ? 1 : 0,
    me.id,
  );
  return { user: toMe((await currentUser())!) };
});
