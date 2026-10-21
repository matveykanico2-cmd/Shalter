// Самопроверка тестового TOTP по векторам RFC 6238 (SHA1): если помощник
// посчитает неверно, все тесты 2FA упадут с непонятной причиной.
import { describe, expect, test } from "vitest";
import { hotp, totp } from "./totp";

// "12345678901234567890" в base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("помощник TOTP", () => {
  test("совпадает с векторами RFC 6238 / RFC 4226 (последние 6 цифр)", () => {
    expect(totp(RFC_SECRET, 59_000)).toBe("287082");
    expect(totp(RFC_SECRET, 1111111109_000)).toBe("081804");
    expect(totp(RFC_SECRET, 1234567890_000)).toBe("005924");
    expect(totp(RFC_SECRET, 20000000000_000)).toBe("353130");
    expect(hotp(RFC_SECRET, 0)).toBe("755224");
    expect(hotp(RFC_SECRET, 9)).toBe("520489");
  });
});
