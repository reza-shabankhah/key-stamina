
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import * as zxcvbnFaPackage from "@zxcvbn-ts/language-fa";
export type HardwareTier = "laptop" | "pc" | "server" | "supercomputer";
export type Algorithm = "md5" | "sha256" | "pbkdf2" | "bcrypt" | "argon2id";

// Hash rates based on 2025/2026 hashcat benchmarks. Values are absolute hashes/second.
export const HASH_RATES: Record<HardwareTier, Record<Algorithm, number>> = {
  laptop: { md5: 1e10, sha256: 1e9, pbkdf2: 1e5, bcrypt: 1500, argon2id: 200 },
  pc: { md5: 1.64e11, sha256: 2.2e10, pbkdf2: 2.5e6, bcrypt: 10000, argon2id: 1500 },
  server: { md5: 1.3e12, sha256: 1.76e11, pbkdf2: 2e7, bcrypt: 80000, argon2id: 12000 },
  supercomputer: { md5: 1.64e15, sha256: 2.2e14, pbkdf2: 2.5e10, bcrypt: 1e8, argon2id: 1.5e7 },
};

const zxcvbnOptions = {
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
    ...zxcvbnFaPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  translations: zxcvbnEnPackage.translations,
};

export const zxcvbn = new ZxcvbnFactory(zxcvbnOptions);


export interface ParsedPattern {
  pattern: string;
  token: string;
  matchedWord?: string;
  dictionaryName?: string;
  l33t?: boolean;
  l33tSubstitutions?: any;
  l33tEntropy?: number;
  spatialGraph?: string;
  spatialTurns?: number;
  repeatBase?: string;
  repeatCount?: number;
  isOfflineBreached?: boolean;
  breachRank?: number;
}

export function parseZxcvbnSequence(sequence: any[]): ParsedPattern[] {
  const result: ParsedPattern[] = [];
  for (const match of sequence) {
    const item: ParsedPattern = {
      pattern: match.pattern,
      token: match.token,
    };
    if (match.pattern === "dictionary") {
      item.matchedWord = match.matchedWord;
      item.dictionaryName = match.dictionaryName;
      item.l33t = !!match.l33t;
      if (match.l33t) {
        item.l33tSubstitutions = match.subs;
        const variations = match.l33tVariations || 1;
        item.l33tEntropy = Math.log2(variations);
      }
      if (match.dictionaryName === "passwords-common") {
        item.isOfflineBreached = true;
        item.breachRank = match.rank;
      }
    } else if (match.pattern === "spatial") {
      item.spatialGraph = match.graph;
      item.spatialTurns = match.turns;
    } else if (match.pattern === "repeat") {
      item.repeatBase = typeof match.baseToken === "string" ? match.baseToken : String(match.baseToken);
      item.repeatCount = match.repeatCount;
    }
    result.push(item);
  }
  return result;
}

/**
 * Calculates the estimated time to crack a password in seconds, based on
 * real-world hardware benchmarks and the selected hashing algorithm.
 * 
 * @param guesses The total number of guesses required to crack the password (from zxcvbn.guesses)
 * @param hardware The hardware tier of the attacker
 * @param algo The hashing algorithm used to store the password
 * @returns Time in seconds to crack
 */
export function calculateCrackTime(
  guesses: number,
  hardware: HardwareTier,
  algo: Algorithm
): number {
  const hashRate = HASH_RATES[hardware][algo];
  return guesses / hashRate;
}

/**
 * Formats seconds into a human-readable value and unit.
 */
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
    // Pad to 2 digits with a space prefix (total 3 characters including sign slot)
    if (rawVal < 10) {
      valueStr = "  " + rawVal;
    } else {
      valueStr = " " + rawVal;
    }
  }

  return { value: valueStr, unit };
}
