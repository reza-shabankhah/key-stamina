import ZxcvbnWorker from "./zxcvbn.worker?worker&inline";

export type HardwareTier = "laptop" | "pc" | "server" | "supercomputer";
export type Algorithm = "md5" | "sha256" | "pbkdf2" | "bcrypt" | "argon2id";

// Hash rates from 2025/2026 hashcat benchmarks (hashes/sec)
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
    // Invalidate stale pending jobs
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
  if (seconds < 1) return { value: "< 1", unit: "Second" };
  
  const MINUTE = 60;
  const HOUR = MINUTE * 60;
  const DAY = HOUR * 24;
  const MONTH = DAY * 31;
  const YEAR = MONTH * 12;
  const CENTURY = YEAR * 100;

  let rawVal = 0;
  let unit = "";

  if (seconds < MINUTE) {
    rawVal = Math.round(seconds);
    unit = rawVal === 1 ? "Second" : "Seconds";
  } else if (seconds < HOUR) {
    rawVal = Math.round(seconds / MINUTE);
    unit = rawVal === 1 ? "Minute" : "Minutes";
  } else if (seconds < DAY) {
    rawVal = Math.round(seconds / HOUR);
    unit = rawVal === 1 ? "Hour" : "Hours";
  } else if (seconds < MONTH) {
    rawVal = Math.round(seconds / DAY);
    unit = rawVal === 1 ? "Day" : "Days";
  } else if (seconds < YEAR) {
    rawVal = Math.round(seconds / MONTH);
    unit = rawVal === 1 ? "Month" : "Months";
  } else if (seconds < CENTURY) {
    rawVal = Math.round(seconds / YEAR);
    unit = rawVal === 1 ? "Year" : "Years";
  } else {
    rawVal = Math.round(seconds / CENTURY);
    unit = rawVal === 1 ? "Century" : "Centuries";
  }

  let valueStr = "";
  if (unit === "Centuries" && rawVal > 99) {
    valueStr = ">99";
  } else {
    // Pad for layout alignment
    if (rawVal < 10) {
      valueStr = "  " + rawVal;
    } else {
      valueStr = " " + rawVal;
    }
  }

  return { value: valueStr, unit };
}
