import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Модули сервера — CommonJS, грузим их обычным require.
const require = createRequire(import.meta.url);
process.env.PREMIUM_ADMIN_PHONE = "+79990000000";
const { hasAdminSection, isPrimaryAdmin, ADMIN_SECTIONS } = require("../../server/lib/adminAccess");

test("полный админ (телефон ADMIN_PHONE) имеет все разделы", () => {
  const admin = { phone: "+79990000000", adminSections: [] };
  for (const s of ADMIN_SECTIONS) assert.ok(hasAdminSection(admin, s), s);
});

test("частичный админ — только выданные разделы", () => {
  const mod = { phone: "+70000000001", adminSections: ["moderation"] };
  assert.ok(hasAdminSection(mod, "moderation"));
  assert.ok(!hasAdminSection(mod, "server"));
  assert.ok(!hasAdminSection(mod, "legal"));
});

test("обычный пользователь — ничего", () => {
  const user = { phone: "+70000000002", adminSections: [] };
  for (const s of ADMIN_SECTIONS) assert.ok(!hasAdminSection(user, s), s);
  assert.ok(!hasAdminSection(null, "moderation"));
});

test("isPrimaryAdmin — только сам ADMIN_PHONE", () => {
  assert.ok(isPrimaryAdmin("+79990000000"));
  assert.ok(!isPrimaryAdmin("+70000000009"));
  assert.ok(!isPrimaryAdmin(null));
});
