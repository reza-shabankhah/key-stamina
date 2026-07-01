import ZxcvbnWorker from "./zxcvbn.worker?worker&inline";

export type HardwareTier = "laptop" | "pc" | "server" | "supercomputer";
export type Algorithm = "md5" | "sha256" | "pbkdf2" | "bcrypt" | "argon2id";

export type TimeUnit = "seconds" | "minutes" | "hours" | "days" | "years" | "centuries";

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 31;
const YEAR = MONTH * 12;
const CENTURY = YEAR * 100;

export const TIME_UNIT_SECONDS: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: MINUTE,
  hours: HOUR,
  days: DAY,
  years: YEAR,
  centuries: CENTURY,
};

// Hashcat 2025/2026 benchmarks (H/s)
export const HASH_RATES: Record<HardwareTier, Record<Algorithm, number>> = {
  laptop: { md5: 1e10, sha256: 1e9, pbkdf2: 1e5, bcrypt: 1500, argon2id: 200 },
  pc: { md5: 1.64e11, sha256: 2.2e10, pbkdf2: 2.5e6, bcrypt: 10000, argon2id: 1500 },
  server: { md5: 1.3e12, sha256: 1.76e11, pbkdf2: 2e7, bcrypt: 80000, argon2id: 12000 },
  supercomputer: { md5: 1.64e15, sha256: 2.2e14, pbkdf2: 2.5e10, bcrypt: 1e8, argon2id: 1.5e7 },
};

export interface ZxcvbnResult {
  guesses: number;
  score: number;
  sequence: any[];
}

const worker = new ZxcvbnWorker();
let currentJobId = 0;
const pendingJobs = new Map<number, (result: ZxcvbnResult | null) => void>();

worker.onmessage = (e: MessageEvent) => {
  const { jobId, result } = e.data;
  if (pendingJobs.has(jobId)) {
    pendingJobs.get(jobId)!(result);
    pendingJobs.delete(jobId);
  }
};

export function evaluatePassword(password: string): Promise<ZxcvbnResult | null> {
  return new Promise((resolve) => {
    // Cancel pending checks
    pendingJobs.forEach((resolveStale) => resolveStale(null));
    pendingJobs.clear();

    const jobId = ++currentJobId;
    pendingJobs.set(jobId, resolve);
    worker.postMessage({ jobId, password });
  });
}



export function calculateCrackTime(
  guesses: number,
  hardware: HardwareTier,
  algo: Algorithm
): number {
  const hashRate = HASH_RATES[hardware][algo];
  return guesses / hashRate;
}

export function formatTime(seconds: number): { value: string; unit: string } {
  if (seconds === 0) return { value: "  0", unit: "Seconds" };

  let rawVal = 0;
  let unit = "";

  if (seconds < MINUTE) {
    rawVal = seconds;
    unit = "Seconds";
  } else if (seconds < HOUR) {
    rawVal = seconds / MINUTE;
    unit = "Minutes";
  } else if (seconds < DAY) {
    rawVal = seconds / HOUR;
    unit = "Hours";
  } else if (seconds < MONTH) {
    rawVal = seconds / DAY;
    unit = "Days";
  } else if (seconds < YEAR) {
    rawVal = seconds / MONTH;
    unit = "Months";
  } else if (seconds < CENTURY) {
    rawVal = seconds / YEAR;
    unit = "Years";
  } else {
    rawVal = seconds / CENTURY;
    unit = "Centuries";
  }

  let valueStr = "";
  if (unit === "Centuries" && rawVal > 999.5) {
    valueStr = "+999";
  } else {
    if (rawVal < 9.95) {
      const formatted = rawVal.toFixed(1);
      valueStr = formatted === "0.0" ? "0.1" : formatted;
    } else {
      const roundedVal = Math.round(rawVal);
      const str = String(roundedVal);
      if (str.length === 1) {
        valueStr = "  " + str;
      } else if (str.length === 2) {
        valueStr = " " + str;
      } else {
        valueStr = str;
      }
    }
  }

  const displayNum = parseFloat(valueStr);
  if (displayNum === 1) {
    if (unit === "Centuries") unit = "Century";
    else if (unit === "Months") unit = "Month";
    else if (unit.endsWith("s")) unit = unit.slice(0, -1);
  } else {
    if (unit === "Century") unit = "Centuries";
    else if (unit === "Month") unit = "Months";
    else if (unit === "Second") unit = "Seconds";
    else if (unit === "Minute") unit = "Minutes";
    else if (unit === "Hour") unit = "Hours";
    else if (unit === "Day") unit = "Days";
    else if (unit === "Year") unit = "Years";
  }

  return { value: valueStr, unit };
}

export function calculateRequiredGuesses(
  timeValue: number,
  unit: TimeUnit,
  hardware: HardwareTier,
  algo: Algorithm
): number {
  const hashRate = HASH_RATES[hardware][algo];
  const targetSeconds = timeValue * TIME_UNIT_SECONDS[unit];
  return targetSeconds * hashRate;
}

export function generateTargetedPassphrase(
  format: "ascii" | "numeric",
  guesses: number
): string {
  const charsets: Record<"ascii" | "numeric", string> = {
    numeric: "0123456789",
    ascii: " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
  };

  const charset = charsets[format];
  const c = charset.length;
  let length = 1;
  if (guesses > 1) {
    length = Math.ceil(Math.log(guesses) / Math.log(c));
  }
  length = Math.min(Math.max(length, 1), 128);

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[array[i] % c];
  }
  return result;
}
