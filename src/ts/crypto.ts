import { dicewareList } from "./diceware-list";

export function randomInt(max: number): number {
  if (max <= 0) return 0;
  const arr = new Uint32Array(1);
  window.crypto.getRandomValues(arr);
  // Ignore modulo bias for small max limits
  return arr[0] % max;
}

export function genDiceware(
  wordCount: number = 6,
  separator: string = " ",
): string {
  if (typeof dicewareList === "undefined" || !dicewareList.length)
    throw new Error("dicewareList missing");
  const words = new Array(wordCount);
  const len = dicewareList.length;
  for (let i = 0; i < wordCount; i++) words[i] = dicewareList[randomInt(len)];
  return words.join(separator);
}

export const CHARS_NUM = "0123456789";
export const CHARS_ALPHANUM =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const CHARS_ASCII =
  "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

export function genPasscode(length: number, charset: string): string {
  if (length <= 0) return "";
  let passcode = "";
  const len = charset.length;
  for (let i = 0; i < length; i++) passcode += charset[randomInt(len)];
  return passcode;
}
