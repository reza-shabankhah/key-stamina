import ZxcvbnWorker from "./zxcvbn.worker?worker&inline";
import { dicewareList } from "./diceware-list";

let dicewareBuckets: Map<number, string[]> | null = null;
function getDicewareBuckets(): Map<number, string[]> {
  if (!dicewareBuckets) {
    dicewareBuckets = new Map();
    for (const word of dicewareList) {
      const len = word.length;
      if (!dicewareBuckets.has(len)) dicewareBuckets.set(len, []);
      dicewareBuckets.get(len)!.push(word);
    }
  }
  return dicewareBuckets;
}
export type HardwareTier = "laptop" | "pc" | "server" | "supercomputer";
export type Algorithm = "md5" | "sha256" | "pbkdf2" | "bcrypt" | "argon2id";

export const KDF_PBKDF2_ITERATIONS = 600000;
export const KDF_BCRYPT_COST = 10;
export const KDF_ARGON2_MEM = 65536;
export const KDF_ARGON2_ITER = 3;
export const KDF_ARGON2_PARALLELISM = 1;

// Algorithm Cost Assumptions (OWASP 2026 Minimums):
export const ALGO_KDF_PARAMS: Record<Algorithm, string> = {
  md5: "raw",
  sha256: "raw",
  pbkdf2: `m=N/A, t=${KDF_PBKDF2_ITERATIONS}, p=1`, // 600,000 iter (HMAC-SHA-256)
  bcrypt: `cost=${KDF_BCRYPT_COST}`,
  argon2id: `m=${KDF_ARGON2_MEM}, t=${KDF_ARGON2_ITER}, p=${KDF_ARGON2_PARALLELISM}`, // m= 64MiB
};

export const HASH_RATES: Record<HardwareTier, Record<Algorithm, number>> = {
  //~2 GH/s MD5 / ~200 MH/s SHA-256 (Intel UHD 770 / AMD Vega 8)
  laptop: {
    md5: 2e9,
    sha256: 2e8,
    pbkdf2: 200,
    bcrypt: 50,
    argon2id: 20,
  },

  // 1x RTX 5090 (Optimized kernels: -O)
  pc: {
    md5: 2.4e11, // 240 GH/s
    sha256: 1.0e11, // 100 GH/s
    pbkdf2: 1.2e6, // 1.2 MH/s
    bcrypt: 8.8e4, // 88 kH/s
    argon2id: 1500, // 1.5 kH/s
  },

  // 8x RTX 5090 cluster
  server: {
    md5: 1.92e12,
    sha256: 8.0e11,
    pbkdf2: 9.6e6,
    bcrypt: 7.04e5,
    argon2id: 12000,
  },

  // 1,000x RTX 5090 node equivalent
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
    warnings?: string[];
    suggestions: string[];
  };
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new ZxcvbnWorker();
    worker.onmessage = (e: MessageEvent) => {
      const { jobId, result, hashValue } = e.data;
      if (pendingJobs.has(jobId)) {
        if (result) result.hashValue = hashValue;
        pendingJobs.get(jobId)!(result);
        pendingJobs.delete(jobId);
      }
      processNextJob();
    };
  }
  return worker;
}
let currentJobId = 0;
const pendingJobs = new Map<number, (result: ZxcvbnResult | null) => void>();

let isWorkerBusy = false;
let pendingEvaluation: {
  password: string;
  algo: Algorithm;
  skipHash: boolean;
  resolve: (val: any) => void;
} | null = null;

export function cancelPendingEvaluations() {
  if (pendingEvaluation) {
    pendingEvaluation.resolve(null);
    pendingEvaluation = null;
  }
}

function processNextJob() {
  if (!pendingEvaluation) {
    isWorkerBusy = false;
    return;
  }

  isWorkerBusy = true;
  const { password, algo, skipHash, resolve } = pendingEvaluation;
  pendingEvaluation = null;

  const jobId = ++currentJobId;
  pendingJobs.set(jobId, (result: ZxcvbnResult | null) => {
    if (result) {
      if (!result.feedback)
        result.feedback = { warning: "", warnings: [], suggestions: [] };
      if (!result.feedback.warnings) result.feedback.warnings = [];
      if (algo === "bcrypt" && new TextEncoder().encode(password).length > 72) {
        result.feedback.warnings.push(
          "Warning: bcrypt silently truncates input at 72 bytes.",
        );
      }
    }
    resolve(result);
  });
  getWorker().postMessage({ jobId, password, algo, skipHash });
}

export function evaluatePassword(
  password: string,
  algo: Algorithm,
  skipHash = false,
): Promise<ZxcvbnResult | null> {
  return new Promise((resolve) => {
    if (isWorkerBusy) {
      if (pendingEvaluation) {
        pendingEvaluation.resolve(null);
      }
      pendingEvaluation = { password, algo, skipHash, resolve };
      return;
    }

    pendingEvaluation = { password, algo, skipHash, resolve };
    processNextJob();
  });
}

export function calculateCrackTime(
  guesses: number,
  hardware: HardwareTier,
  algo: Algorithm,
): number {
  return guesses / HASH_RATES[hardware][algo];
}

export type ResistanceGrade = "Low" | "Medium" | "High";

export function evaluateResistanceGrade(
  guesses: number,
  algo: Algorithm,
): ResistanceGrade {
  const crackTime = calculateCrackTime(guesses, "supercomputer", algo);
  if (crackTime < 31536000) {
    return "Low";
  } else if (crackTime < 3153600000) {
    return "Medium";
  } else {
    return "High";
  }
}

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 30.4375; // Gregorian average (365.25 / 12)
const YEAR = DAY * 365.25;
const CENTURY = YEAR * 100;

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

  const displayNum = parseFloat(valueStr);
  if (displayNum === 1) {
    if (unit === "Centuries") unit = "Century";
    else if (unit === "Months") unit = "Month";
    else if (unit.endsWith("s")) unit = unit.slice(0, -1);
  }

  return { value: valueStr, unit };
}

export function calculateEntropyMetrics(guesses: number): {
  entropyBits: string;
  guessesSci: string;
} {
  const log2Guesses = Math.log2(guesses);
  const entropyBits = log2Guesses.toFixed(2);
  const log10Guesses = log2Guesses / Math.log2(10);
  const guessesSci =
    log10Guesses >= 4 ? `10^${log10Guesses.toFixed(1)}` : guesses.toString();

  return { entropyBits, guessesSci };
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

  if (config.useUpper) pool += "ACDEFHJKMNPQRSTUVWXY";
  if (config.useLower) pool += "abcdefghjkmnpqrstuvwxyz";
  if (config.useNum) pool += "3479";
  if (config.useSym) pool += " !#$%&()*+-/<=>?@[]^_{}";
  if (config.useAmbig) pool += "0Oo1lLiI|\\'\"`~.,:;B8S5Z2G6";

  if (pool.length === 0) {
    throw new Error(
      "Character pool cannot be empty. Please select at least one character set.",
    );
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

export function generateDiceware(
  targetLength: number,
  separator: string,
): string {
  const buckets = getDicewareBuckets();
  const sepLen = separator.length;

  const dp = new Array<boolean>(targetLength + 1).fill(false);

  for (const len of buckets.keys()) {
    if (len <= targetLength) dp[len] = true;
  }

  for (let i = 1; i <= targetLength; i++) {
    if (!dp[i]) {
      for (const len of buckets.keys()) {
        const prev = i - sepLen - len;
        if (prev > 0 && dp[prev]) {
          dp[i] = true;
          break;
        }
      }
    }
  }

  let finalTarget = targetLength;
  if (!dp[finalTarget]) {
    let offset = 1;
    while (finalTarget > 0 && finalTarget <= 128) {
      if (finalTarget + offset <= 128 && dp[finalTarget + offset]) {
        finalTarget = finalTarget + offset;
        break;
      }
      if (finalTarget - offset > 0 && dp[finalTarget - offset]) {
        finalTarget = finalTarget - offset;
        break;
      }
      offset++;
    }
    if (!dp[finalTarget]) finalTarget = targetLength;
  }

  const resultLengths: number[] = [];
  let curr = finalTarget;

  while (curr > 0) {
    const validChoices: number[] = [];
    if (buckets.has(curr)) validChoices.push(curr);
    for (const len of buckets.keys()) {
      const prev = curr - sepLen - len;
      if (prev > 0 && dp[prev]) validChoices.push(len);
    }

    if (validChoices.length === 0) break;

    const choice =
      validChoices[
        crypto.getRandomValues(new Uint32Array(1))[0] % validChoices.length
      ];
    resultLengths.push(choice);

    if (choice === curr) {
      curr = 0;
    } else {
      curr = curr - sepLen - choice;
    }
  }

  resultLengths.reverse();
  const words = resultLengths.map((len) => {
    const list = buckets.get(len)!;
    const maxSafe = Math.floor(4294967296 / list.length) * list.length;
    let rand = crypto.getRandomValues(new Uint32Array(1))[0];
    while (rand >= maxSafe)
      rand = crypto.getRandomValues(new Uint32Array(1))[0];
    return list[rand % list.length];
  });

  return words.join(separator);
}

export function parseVulnerabilities(sequence: any[]): string[] {
  if (!sequence || sequence.length === 0) return [];

  const strings: string[] = [];
  let foundVuln = false;

  sequence.forEach((match: any) => {
    if (match.pattern !== "bruteforce") {
      foundVuln = true;
      let desc = "";
      if (match.pattern === "dictionary") {
        const dictionary = match.dictionaryName ?? "unknown";

        if (match.l33t) {
          desc = `"${match.token}" is in [${dictionary} l33t]`;
        } else {
          desc = `"${match.token}" is in [${dictionary}]`;
        }
      } else {
        desc = `"${match.token}" is in [${match.pattern}]`;
      }
      strings.push(desc);
    }
  });

  if (!foundVuln) {
    strings.push("None detected. (Pure bruteforce)");
  }

  return strings;
}

export interface GeneratorConfig {
  format: "ascii" | "diceware";
  length: number;
  algo: Algorithm;
  asciiPool: string;
  dicewareSeparator: string;
}

export async function generateSecurePassphrase(
  config: GeneratorConfig,
  onProgress?: (attempt: number, vulnerabilities: string[]) => void,
): Promise<{
  passphrase: string;
  result: ZxcvbnResult | null;
  attempts: number;
}> {
  let finalPassphrase = "";
  let finalResult: ZxcvbnResult | null = null;
  let attempts = 0;
  const maxAttempts = 100;

  let candidate =
    config.format === "ascii"
      ? generateAscii(config.length, config.asciiPool)
      : generateDiceware(config.length, config.dicewareSeparator);

  let fallbackWarning = "";
  if (config.format === "diceware" && candidate.length !== config.length) {
    fallbackWarning = `Warning: Mathematically impossible to generate exactly ${config.length} characters using diceware constraints. Fell back to ${candidate.length} characters.`;
  }

  while (attempts < maxAttempts) {
    let hasVulnerability = false;
    let currentResult: ZxcvbnResult | null = null;

    if (config.format === "ascii") {
      currentResult = await evaluatePassword(candidate, config.algo, true);
      if (!currentResult) break;

      if (currentResult.sequence) {
        const hasBadPattern = currentResult.sequence.some(
          (m: any) => m.pattern !== "bruteforce",
        );

        if (hasBadPattern) {
          hasVulnerability = true;

          const detectedPatterns = Array.from(
            new Set(
              currentResult.sequence
                .filter((m: any) => m.pattern !== "bruteforce")
                .map((m: any) =>
                  m.pattern === "dictionary"
                    ? `${m.dictionaryName || "unknown"} dictionary`
                    : m.pattern,
                ),
            ),
          ) as string[];

          if (onProgress) {
            onProgress(attempts + 1, detectedPatterns);
          }

          candidate = generateAscii(config.length, config.asciiPool);
        }
      }
    }

    if (!hasVulnerability) {
      finalPassphrase = candidate;
      finalResult = await evaluatePassword(candidate, config.algo, false);
      if (finalResult && fallbackWarning) {
        if (!finalResult.feedback)
          finalResult.feedback = { warning: "", warnings: [], suggestions: [] };
        if (!finalResult.feedback.warnings) finalResult.feedback.warnings = [];
        finalResult.feedback.warnings.push(fallbackWarning);
      }
      break;
    }

    attempts++;
  }

  if (!finalPassphrase && attempts >= maxAttempts) {
    finalPassphrase = candidate;
    finalResult = await evaluatePassword(candidate, config.algo);
  }

  return { passphrase: finalPassphrase, result: finalResult, attempts };
}

export function getFirstInvalidEngineChar(input: string): string | undefined {
  return input.match(/[^\x20-\x7E]/)?.[0];
}

export function isValidEngineChar(char: string): boolean {
  return /^[\x20-\x7E]$/.test(char);
}

export function sanitizeEngineInput(input: string): string {
  return input.replace(/[^\x20-\x7E]/g, "");
}
