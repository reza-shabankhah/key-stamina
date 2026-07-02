import ZxcvbnWorker from "./zxcvbn.worker?worker&inline";

export type HardwareTier = "laptop" | "pc" | "server" | "supercomputer";
export type Algorithm = "md5" | "sha256" | "pbkdf2" | "bcrypt" | "argon2id";

export type TimeUnit =
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "years"
  | "centuries";

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 30.4375; // Gregorian average (365.25 / 12)
const YEAR = DAY * 365.25;
const CENTURY = YEAR * 100;

export const TIME_UNIT_SECONDS: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: MINUTE,
  hours: HOUR,
  days: DAY,
  years: YEAR,
  centuries: CENTURY,
};

/*
 * Offline worst-case H/s per hardware tier (2024/2025 Hashcat benchmarks).
 *
 * Laptop     — Low-end laptop with integrated GPU (Intel UHD / AMD Vega iGPU)
 * PC         — Single RTX 4090 with optimized Hashcat kernels (-O flag)
 * Server     — Dedicated 8x RTX 4090 cracking server (~8x PC values)
 * Supercomp  — Nation-state GPU cluster (~1,000x RTX 4090 equivalent)
 *
 * Slow-hash parameters assumed (worst-case for attacker):
 *   PBKDF2   — 600,000 iterations (OWASP 2023 minimum for SHA-256)
 *   bcrypt   — cost factor 10 (current industry default)
 *   Argon2id — 64 MiB memory, 3 iterations (OWASP recommended minimum)
 *
 * Sources: hashcat.net official benchmarks, Bitwarden security white-papers,
 *          Tom's Hardware RTX 4090 review, security.stackexchange.com.
 */

export const HASH_RATES: Record<HardwareTier, Record<Algorithm, number>> = {
  // ~2 GH/s MD5 / ~200 MH/s SHA-256 (Intel UHD 770 / AMD Vega 8)
  laptop: { md5: 2e9, sha256: 2e8, pbkdf2: 200, bcrypt: 50, argon2id: 20 },
  // RTX 4090 single-card hashcat benchmarks (hashcat.net, 2024)
  pc: {
    md5: 1.64e11,
    sha256: 2.2e10,
    pbkdf2: 2200,
    bcrypt: 6000,
    argon2id: 1800,
  },
  // 8x RTX 4090 dedicated cracking server (linear scaling)
  server: {
    md5: 1.31e12,
    sha256: 1.76e11,
    pbkdf2: 17600,
    bcrypt: 48000,
    argon2id: 14400,
  },
  // Nation-state GPU cluster (~1,000x RTX 4090 equivalent nodes)
  supercomputer: {
    md5: 1.64e14,
    sha256: 2.2e13,
    pbkdf2: 2.2e6,
    bcrypt: 6e6,
    argon2id: 1.8e6,
  },
};

export interface ZxcvbnResult {
  guesses: number;
  score: number;
  sequence: any[];
  hashValue?: string;
  feedback?: {
    warning: string;
    suggestions: string[];
  };
}

const worker = new ZxcvbnWorker();
let currentJobId = 0;
const pendingJobs = new Map<number, (result: ZxcvbnResult | null) => void>();

worker.onmessage = (e: MessageEvent) => {
  const { jobId, result, hashValue } = e.data;
  if (pendingJobs.has(jobId)) {
    if (result) result.hashValue = hashValue;
    pendingJobs.get(jobId)!(result);
    pendingJobs.delete(jobId);
  }
};

export function evaluatePassword(
  password: string,
  algo: Algorithm,
): Promise<ZxcvbnResult | null> {
  return new Promise((resolve) => {
    pendingJobs.forEach((resolveStale) => resolveStale(null));
    pendingJobs.clear();

    const jobId = ++currentJobId;
    pendingJobs.set(jobId, resolve);
    worker.postMessage({ jobId, password, algo });
  });
}

export function calculateCrackTime(
  guesses: number,
  hardware: HardwareTier,
  algo: Algorithm,
): number {
  return guesses / HASH_RATES[hardware][algo];
}

export function formatTime(seconds: number): { value: string; unit: string } {
  if (seconds <= 0) return { value: "  0", unit: "Seconds" };

  let rawVal: number;
  let unit: string;

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

  let valueStr: string;
  if (unit === "Centuries" && rawVal > 999.5) {
    valueStr = "+999";
  } else if (rawVal < 9.95) {
    const formatted = rawVal.toFixed(1);
    valueStr = formatted === "0.0" ? "0.1" : formatted;
  } else {
    valueStr = String(Math.round(rawVal)).padStart(3, " ");
  }

  // Singularize for exactly 1
  const displayNum = parseFloat(valueStr);
  if (displayNum === 1) {
    if (unit === "Centuries") unit = "Century";
    else if (unit === "Months") unit = "Month";
    else if (unit.endsWith("s")) unit = unit.slice(0, -1);
  }

  return { value: valueStr, unit };
}

export function calculateRequiredGuesses(
  timeValue: number,
  unit: TimeUnit,
  hardware: HardwareTier,
  algo: Algorithm,
): number {
  return timeValue * TIME_UNIT_SECONDS[unit] * HASH_RATES[hardware][algo];
}

const CHARSETS: Record<"ascii" | "numeric", string> = {
  numeric: "0123456789",
  ascii:
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
};

export function generateTargetedPassphrase(
  format: "ascii" | "numeric",
  guesses: number,
): string {
  const charset = CHARSETS[format];
  const c = charset.length;
  const length = Math.min(
    Math.max(guesses > 1 ? Math.ceil(Math.log2(guesses) / Math.log2(c)) : 1, 1),
    128,
  );

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[array[i] % c];
  }
  return result;
}
