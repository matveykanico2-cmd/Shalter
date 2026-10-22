// Режим контрактных тестов (packages/contract-tests), как TEST_MODE в server/lib/sweeps.js:
// обходы по таймеру и RTMP выключены. На боевом сервере (NODE_ENV=production) флаг игнорируется.
export const TEST_MODE = process.env.SHALTER_TEST_MODE === "1" && process.env.NODE_ENV !== "production";
