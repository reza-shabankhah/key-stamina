import ZxcvbnWorker from "./zxcvbn.worker?worker&inline";
import { dicewareList } from "./diceware-list";
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
 * Hashcat Offline Brute-Force Benchmarks (Base Year: 2026)
 *
 * Hardware Profiles:
 *   Laptop     : Integrated iGPU (Intel UHD / AMD Vega)
 *   PC         : 1x RTX 5090 (Optimized kernels: -O)
 *   Server     : 8x RTX 5090 cluster
 *   Supercomp  : 1,000x RTX 5090 node equivalent
 *
 * Algorithm Cost Assumptions (OWASP 2026 Minimums):
 *   PBKDF2   : 600,000 iter (HMAC-SHA-256)
 *   bcrypt   : Cost 10
 *   Argon2id : m=65536 (64MiB), t=3, p=1
 */

export const HASH_RATES: Record<HardwareTier, Record<Algorithm, number>> = {
  // ~2 GH/s MD5 / ~200 MH/s SHA-256 (Intel UHD 770 / AMD Vega 8)
  laptop: { md5: 2e9, sha256: 2e8, pbkdf2: 200, bcrypt: 50, argon2id: 20 },
  // RTX 5090 single-card hashcat benchmarks
  pc: {
    md5: 2.4e11,      // 240 GH/s
    sha256: 1.0e11,   // 100 GH/s
    pbkdf2: 1.2e6,    // 1.2 MH/s
    bcrypt: 8.8e4,    // 88 kH/s
    argon2id: 1500,   // 1.5 kH/s
  },
  // 8x RTX 5090 dedicated cracking server (linear scaling)
  server: {
    md5: 1.92e12,
    sha256: 8.0e11,
    pbkdf2: 9.6e6,
    bcrypt: 7.04e5,
    argon2id: 12000,
  },
  // Nation-state GPU cluster (~1,000x RTX 5090 equivalent nodes)
  supercomputer: {
    md5: 2.4e14,
    sha256: 1.0e14,
    pbkdf2: 1.2e9,
    bcrypt: 8.8e7,
    argon2id: 1.5e6,
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
  skipHash = false
): Promise<ZxcvbnResult | null> {
  return new Promise((resolve) => {
    pendingJobs.forEach((resolveStale) => resolveStale(null));
    pendingJobs.clear();

    const jobId = ++currentJobId;
    pendingJobs.set(jobId, resolve);
    worker.postMessage({ jobId, password, algo, skipHash });
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



export interface AsciiConfig {
  useUpper: boolean;
  useLower: boolean;
  useNum: boolean;
  useSym: boolean;
  useAmbig: boolean;
}

export function buildAsciiPool(config: AsciiConfig): string {
  let pool = "";

  if (config.useUpper)     pool += "ACDEFHJKMNPQRSTUVWXY";
  if (config.useLower)     pool += "abcdefghjkmnpqrstuvwxyz";
  if (config.useNum)       pool += "3479";
  if (config.useSym)       pool += " !#$%&()*+-/<=>?@[]^_{}";
  if (config.useAmbig)     pool += "0Oo1lLiI|\\'\"`~.,:;B8S5Z2G6";

  if (pool.length === 0) {
    throw new Error("Character pool cannot be empty. Please select at least one character set.");
  }

  return pool;
}

export function generateAscii(length: number, pool: string): string {
  const maxSafe = Math.floor(4294967296 / pool.length) * pool.length;
  let result = "";
  let buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let bufIdx = 0;

  for (let i = 0; i < length; i++) {
    if (bufIdx >= buf.length) {
      buf = new Uint32Array(length);
      crypto.getRandomValues(buf);
      bufIdx = 0;
    }
    let rand = buf[bufIdx++];
    while (rand >= maxSafe) {
      if (bufIdx >= buf.length) {
        buf = new Uint32Array(length);
        crypto.getRandomValues(buf);
        bufIdx = 0;
      }
      rand = buf[bufIdx++];
    }
    result += pool[rand % pool.length];
  }
  return result;
}

export function generateDiceware(length: number, separator: string): string {
  const maxSafe = Math.floor(4294967296 / dicewareList.length) * dicewareList.length;
  const words: string[] = [];
  let buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let bufIdx = 0;

  for (let i = 0; i < length; i++) {
    if (bufIdx >= buf.length) {
      buf = new Uint32Array(length);
      crypto.getRandomValues(buf);
      bufIdx = 0;
    }
    let rand = buf[bufIdx++];
    while (rand >= maxSafe) {
      if (bufIdx >= buf.length) {
        buf = new Uint32Array(length);
        crypto.getRandomValues(buf);
        bufIdx = 0;
      }
      rand = buf[bufIdx++];
    }
    words.push(dicewareList[rand % dicewareList.length]);
  }
  return words.join(separator);
}
