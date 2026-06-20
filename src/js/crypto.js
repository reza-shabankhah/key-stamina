function randomInt(max) {
  if (max <= 0) return 0;
  const arr = new Uint32Array(1);
  window.crypto.getRandomValues(arr);
  // Ignore modulo bias for small max limits
  return arr[0] % max;
}

function genDiceware(wordCount = 6, separator = " ") {
  if (typeof dicewareList === "undefined" || !dicewareList.length) throw new Error("dicewareList missing");
  const words = new Array(wordCount);
  const len = dicewareList.length;
  for (let i = 0; i < wordCount; i++) words[i] = dicewareList[randomInt(len)];
  return words.join(separator);
}

const CHARS_NUM = "0123456789";
const CHARS_ALPHANUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CHARS_ASCII = "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

function genPasscode(length, charset) {
  if (length <= 0) return "";
  let passcode = "";
  const len = charset.length;
  for (let i = 0; i < length; i++) passcode += charset[randomInt(len)];
  return passcode;
}

let compromisedSet = null;

function isCompromised(password) {
  if (!password) return false;
  if (!compromisedSet) {
    if (typeof topPasswords === "undefined") throw new Error("topPasswords missing");
    compromisedSet = new Set(topPasswords);
    topPasswords = null; // Free array to allow GC
  }
  return compromisedSet.has(password);
}
