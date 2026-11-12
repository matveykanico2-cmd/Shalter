/** С какой длины (символов или строк) текст в пузыре сворачивается под «Показать полностью». */
const LONG_CHARS = 1_500;
const LONG_LINES = 25;

export const isLongText = (text: string) => text.length > LONG_CHARS || text.split("\n").length > LONG_LINES;
