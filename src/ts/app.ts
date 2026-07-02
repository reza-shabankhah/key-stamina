import "katex/dist/katex.min.css";
import katex from "katex";
import {
  evaluatePassword, calculateCrackTime, formatTime,
  calculateRequiredGuesses, generateTargetedPassphrase,
  Algorithm, HardwareTier, TimeUnit, ZxcvbnResult,
} from "./crypto";

let latestInputJobId = 0;
let evaluateTimeout: number | undefined;

initPassphraseInput();
initTargetTimeValueInput();
initBorderMaskHandling();
initMobileAutoScroll();
initTooltips();
initHashSelector();
initGenerateButton();
initAdvancedPanelToggle();
initDynamicFormatOptionsInteractivity();

// Tier → DOM element id; module-level to avoid per-call recreation.
const TIER_EL_MAP: [HardwareTier, string][] = [
  ["laptop",        "time-laptop"],
  ["pc",            "time-pc"],
  ["server",        "time-server"],
  ["supercomputer", "time-supercomputer"],
];

function getAlgo(): Algorithm {
  return ((document.getElementById("hash-algorithm") as HTMLSelectElement | null)?.value || "argon2id") as Algorithm;
}

function initPassphraseInput(): void {
  const textarea  = document.getElementById("passphrase-input") as HTMLTextAreaElement | null;
  const counter   = document.getElementById("char-counter");
  const clearBtn  = document.getElementById("clear-input-btn");
  const copyBtn   = document.getElementById("copy-btn") as HTMLButtonElement | null;

  if (!textarea) return;

  let heightRaf: number;
  const adjustHeight = () => {
    cancelAnimationFrame(heightRaf);
    heightRaf = requestAnimationFrame(() => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    });
  };

  window.addEventListener("resize", adjustHeight);
  adjustHeight();

  textarea.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") e.preventDefault();
  });

  textarea.addEventListener("input", () => {
    if (/[\r\n]/.test(textarea.value)) {
      textarea.value = textarea.value.replace(/[\r\n]/g, "");
    }

    const len        = textarea.value.length;
    const hasContent = len > 0;

    if (counter) counter.textContent = hasContent ? ` (${len})` : "";
    if (clearBtn) clearBtn.hidden = !hasContent;

    const invalidChar = textarea.value.match(/[^\x20-\x7E]/)?.[0];

    if (copyBtn) {
      if (invalidChar) {
        copyBtn.disabled = false;
        copyBtn.textContent = `Invalid: ${invalidChar}`;
        copyBtn.classList.add("btn-unsupported");
      } else {
        copyBtn.disabled = !hasContent;
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("btn-unsupported");
      }
    }

    if (hasContent && !invalidChar) {
      clearTimeout(evaluateTimeout);
      evaluateTimeout = window.setTimeout(() => {
        const currentJobId = ++latestInputJobId;
        const algo = getAlgo();
        evaluatePassword(textarea.value, algo).then(result => {
          if (!result || currentJobId !== latestInputJobId) return;
          updateCrackTimes(result.guesses);
          updateResistanceBadge(result.score);
          updateTerminalTelemetry(textarea.value, result, algo);
        });
      }, 150);
    } else {
      clearTimeout(evaluateTimeout);
      latestInputJobId++;
      resetCrackTimes();
      resetResistanceBadge();
      resetTerminalTelemetry();
    }

    adjustHeight();
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (copyBtn.classList.contains("btn-unsupported") || !textarea.value) return;

      const onSuccess = () => {
        copyBtn.textContent = "Copied!";
        copyBtn.disabled = true;
      };

      const fallbackCopy = () => {
        const el = document.createElement("textarea");
        el.value = textarea.value;
        el.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        try { document.execCommand("copy"); } catch {}
        document.body.removeChild(el);
        onSuccess();
      };

      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textarea.value).then(onSuccess).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      textarea.value = "";
      textarea.style.height = "28px";
      if (counter) counter.textContent = "";
      clearBtn.hidden = true;
      if (copyBtn) {
        copyBtn.textContent = "Copy";
        copyBtn.disabled = true;
        copyBtn.classList.remove("btn-unsupported");
      }
      resetCrackTimes();
      resetResistanceBadge();
      resetTerminalTelemetry();
      textarea.focus();
    });
  }
}

function initTargetTimeValueInput(): void {
  const input = document.getElementById("target-time-value") as HTMLInputElement | null;
  if (!input) return;

  input.addEventListener("beforeinput", (e: InputEvent) => {
    if (e.data && !/^[0-9]+$/.test(e.data)) e.preventDefault();
  });

  input.addEventListener("input", () => {
    const clean = input.value.replace(/[^0-9]/g, "");
    input.value = clean.length > 3 ? "999" : clean;
  });

  input.addEventListener("blur", () => {
    const num = parseInt(input.value, 10);
    input.value = !input.value || isNaN(num) ? "1" : String(Math.min(Math.max(num, 0), 999));
  });
}

function initBorderMaskHandling(): void {
  const textarea   = document.getElementById("passphrase-input");
  const borderBox  = document.querySelector(".passphrase-border-box") as HTMLElement | null;
  const labelCore  = document.querySelector(".label-core") as HTMLElement | null;
  const charCounter = document.getElementById("char-counter");
  const clearBtn   = document.getElementById("clear-input-btn");

  if (!textarea || !borderBox || !labelCore) return;

  const visualLeftGap = 4.0;
  const visualRightGap = 2.0;
  const labelLeft  = 15.2; // 0.95rem CSS match
  const leftPadding = 2.4; // 0.2rem CSS padding scaled

  let maskRaf: number;
  const updateMask = () => {
    cancelAnimationFrame(maskRaf);
    maskRaf = requestAnimationFrame(() => {
      const counterWidth   = charCounter?.textContent ? charCounter.offsetWidth : 0;
      const scaledTextWidth = (labelCore.offsetWidth + counterWidth) * 0.75;
      const maskLeft       = labelLeft + leftPadding - visualLeftGap;
      const maskWidth      = visualLeftGap + scaledTextWidth + visualRightGap;

      borderBox.style.setProperty("--mask-width", `${maskWidth}px`);
      borderBox.style.setProperty("--mask-left",  `${maskLeft}px`);
    });
  };

  updateMask();
  textarea.addEventListener("input",  updateMask);
  textarea.addEventListener("focus",  updateMask);
  textarea.addEventListener("blur",   updateMask);
  window.addEventListener("resize",   updateMask);
  if (clearBtn) clearBtn.addEventListener("click", updateMask);
}

function initMobileAutoScroll(): void {
  const textarea = document.getElementById("passphrase-input") as HTMLTextAreaElement | null;
  const card     = document.querySelector(".passphrase-card") as HTMLElement | null;

  if (!textarea || !card) return;

  let isMobile = false;
  const checkMobile = () => { isMobile = window.innerWidth <= 768; };
  window.addEventListener("resize", checkMobile);
  checkMobile();

  textarea.addEventListener("focus", () => {
    if (!isMobile) return;
    setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  });

  let blurScrollY = 0;
  let preventScrollRestore = false;
  let restoreTimeout: number | undefined;

  const endScrollLock = () => {
    preventScrollRestore = false;
    if (restoreTimeout !== undefined) {
      clearTimeout(restoreTimeout);
      restoreTimeout = undefined;
    }
  };

  const handleViewportResize = () => {
    if (!preventScrollRestore || !isMobile) return;
    window.scrollTo(0, blurScrollY);
    const vp = window.visualViewport;
    if (vp && Math.abs(vp.height - window.innerHeight) < 15) endScrollLock();
  };

  window.visualViewport?.addEventListener("resize", handleViewportResize);

  textarea.addEventListener("blur", () => {
    if (!isMobile) return;
    blurScrollY = window.scrollY || document.documentElement.scrollTop;
    preventScrollRestore = true;
    clearTimeout(restoreTimeout);
    restoreTimeout = window.setTimeout(endScrollLock, 600);
  });

  window.addEventListener("scroll", () => {
    if (preventScrollRestore && isMobile) window.scrollTo(0, blurScrollY);
  });
}

function initTooltips(): void {
  const triggers = document.querySelectorAll<HTMLButtonElement>(".tooltip-trigger");

  const unpinAllTooltips = (exceptTrigger?: HTMLButtonElement) => {
    triggers.forEach((btn) => {
      if (btn === exceptTrigger) return;
      btn.setAttribute("aria-expanded", "false");
      btn.closest(".tooltip-container")?.classList.remove("is-pinned");
      btn.blur();
    });
  };

  const togglePinTooltip = (trigger: HTMLButtonElement) => {
    const container = trigger.closest(".tooltip-container");
    const isPinned  = trigger.getAttribute("aria-expanded") === "true";

    if (isPinned) {
      trigger.setAttribute("aria-expanded", "false");
      container?.classList.remove("is-pinned");
      trigger.blur();
    } else {
      unpinAllTooltips(trigger);
      trigger.setAttribute("aria-expanded", "true");
      container?.classList.add("is-pinned");
      trigger.focus();
    }
  };

  triggers.forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePinTooltip(trigger);
    });
  });

  document.querySelectorAll<HTMLElement>(".clickable-title").forEach((title) => {
    title.addEventListener("click", (e) => {
      e.stopPropagation();
      const container = title.closest(
        ".label-with-tooltip, .title-with-tooltip, .aligned-settings-row, .section-card, .terminal-header",
      );
      const trigger = container?.querySelector<HTMLButtonElement>(".tooltip-trigger");
      if (trigger) togglePinTooltip(trigger);
    });
  });

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && !target.closest(".tooltip-container") && !target.closest(".clickable-title")) {
      unpinAllTooltips();
    }
  });
}

function initHashSelector(): void {
  const hashSelect = document.getElementById("hash-algorithm") as HTMLSelectElement | null;
  const textarea   = document.getElementById("passphrase-input") as HTMLTextAreaElement | null;
  if (!hashSelect || !textarea) return;

  hashSelect.addEventListener("change", () => {
    if (!textarea.value.length) return;
    const currentJobId = ++latestInputJobId;
    const algo = hashSelect.value as Algorithm;
    evaluatePassword(textarea.value, algo).then(result => {
      if (!result || currentJobId !== latestInputJobId) return;
      updateCrackTimes(result.guesses);
      updateTerminalTelemetry(textarea.value, result, algo);
    });
  });
}

function updateCrackTimes(guesses: number): void {
  const algo = getAlgo();
  for (const [tier, elId] of TIER_EL_MAP) {
    const el = document.getElementById(elId);
    if (!el) continue;
    const formatted = formatTime(calculateCrackTime(guesses, tier, algo));
    const valEl  = el.querySelector(".time-value");
    const unitEl = el.querySelector(".time-unit");
    if (valEl)  valEl.textContent  = formatted.value;
    if (unitEl) unitEl.textContent = formatted.unit;
  }
}

function resetCrackTimes(): void {
  for (const [, elId] of TIER_EL_MAP) {
    const el = document.getElementById(elId);
    if (!el) continue;
    const valEl  = el.querySelector(".time-value");
    const unitEl = el.querySelector(".time-unit");
    if (valEl)  valEl.textContent  = "  0";
    if (unitEl) unitEl.textContent = "Seconds";
  }
}

function updateResistanceBadge(score: number): void {
  const badge = document.getElementById("resistance-badge");
  if (!badge) return;
  badge.classList.remove("badge-low", "badge-medium", "badge-high");
  if (score <= 1) {
    badge.textContent = "Low";
    badge.classList.add("badge-low");
  } else if (score === 2) {
    badge.textContent = "Medium";
    badge.classList.add("badge-medium");
  } else {
    badge.textContent = "High";
    badge.classList.add("badge-high");
  }
}

function resetResistanceBadge(): void {
  const badge = document.getElementById("resistance-badge");
  if (!badge) return;
  badge.textContent = "Low";
  badge.classList.remove("badge-medium", "badge-high");
  badge.classList.add("badge-low");
}

function initGenerateButton(): void {
  const generateBtn          = document.getElementById("generate-btn");
  const formatSelect         = document.getElementById("generator-format") as HTMLSelectElement | null;
  const targetHardwareSelect = document.getElementById("target-hardware") as HTMLSelectElement | null;
  const targetTimeValueInput = document.getElementById("target-time-value") as HTMLInputElement | null;
  const targetTimeUnitSelect = document.getElementById("target-time-unit") as HTMLSelectElement | null;
  const hashSelect           = document.getElementById("hash-algorithm") as HTMLSelectElement | null;
  const textarea             = document.getElementById("passphrase-input") as HTMLTextAreaElement | null;

  if (!generateBtn || !formatSelect || !targetHardwareSelect || !targetTimeValueInput || !targetTimeUnitSelect || !hashSelect || !textarea) return;

  generateBtn.addEventListener("click", () => {
    const panel     = document.getElementById("advanced-generation-panel");
    const toggleBtn = document.getElementById("toggle-advanced-btn");

    if (panel && !panel.classList.contains("expanded")) {
      panel.classList.add("expanded");
      if (toggleBtn) {
        toggleBtn.textContent = "×";
        toggleBtn.setAttribute("aria-label", "Collapse advanced options");
      }
    }

    const format = formatSelect.value;
    if (format === "diceware") return;

    const hardware       = targetHardwareSelect.value as HardwareTier;
    const timeValue      = parseFloat(targetTimeValueInput.value) || 1;
    const timeUnit       = targetTimeUnitSelect.value as TimeUnit;
    const algo           = hashSelect.value as Algorithm;
    const requiredGuesses = calculateRequiredGuesses(timeValue, timeUnit, hardware, algo);

    textarea.value = generateTargetedPassphrase(format as "ascii" | "numeric", requiredGuesses);
    textarea.dispatchEvent(new Event("input"));
  });
}

function initAdvancedPanelToggle(): void {
  const toggleBtn = document.getElementById("toggle-advanced-btn");
  const panel     = document.getElementById("advanced-generation-panel");
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener("click", () => {
    const isExpanded = panel.classList.toggle("expanded");
    toggleBtn.textContent = isExpanded ? "×" : "+";
    toggleBtn.setAttribute("aria-label", isExpanded ? "Collapse advanced options" : "Expand advanced options");
  });
}

function initDynamicFormatOptionsInteractivity(): void {
  const formatSelect    = document.getElementById("generator-format") as HTMLSelectElement | null;
  const asciiOptions    = document.getElementById("ascii-options");
  const dicewareOptions = document.getElementById("diceware-options");
  const separatorInput  = document.getElementById("diceware-separator") as HTMLInputElement | null;

  if (formatSelect && asciiOptions && dicewareOptions) {
    formatSelect.addEventListener("change", () => {
      const isDiceware = formatSelect.value === "diceware";
      asciiOptions.style.display    = isDiceware ? "none" : "flex";
      dicewareOptions.style.display = isDiceware ? "flex" : "none";
    });
  }

  if (separatorInput) {
    separatorInput.addEventListener("beforeinput", (e: InputEvent) => {
      if (e.data && !/^[\x20-\x7E]$/.test(e.data)) e.preventDefault();
    });
    separatorInput.addEventListener("input", () => {
      separatorInput.value = separatorInput.value.replace(/[^\x20-\x7E]/g, "").slice(0, 1);
    });
    separatorInput.addEventListener("blur", () => {
      if (!separatorInput.value) separatorInput.value = " ";
    });
  }
}

function buildPatternLines(sequence: any[]): { lines: string[]; inCommonPasswords: boolean } {
  const lines: string[] = [];
  let inCommonPasswords = false;

  for (const match of sequence) {
    let desc = "";

    if (match.pattern === "dictionary") {
      const dictionary = match.dictionaryName ?? "unknown";
      if (dictionary === "passwords") inCommonPasswords = true;

      if (match.l33t) {
        const subs = Object.entries(match.sub ?? {}).map(([k, v]) => `${k}→${v}`).join(", ");
        desc = `• Dict Match: "${match.token}" → "${match.matchedWord}" (${dictionary}) [l33t: ${subs}]`;
      } else {
        desc = `• Dict Match: "${match.token}" → "${match.matchedWord}" (${dictionary})`;
      }
    } else if (match.pattern === "spatial") {
      desc = `• Spatial Match: "${match.token}" (keyboard pattern, turns: ${match.turns})`;
    } else if (match.pattern === "repeat") {
      desc = `• Repeat Match: "${match.token}" (repeated "${match.base_token}" x ${match.repeat_count})`;
    } else if (match.pattern === "sequence") {
      desc = `• Sequence Match: "${match.token}" (linear sequence)`;
    } else if (match.pattern === "regex") {
      desc = `• Regex Match: "${match.token}" (matched pattern)`;
    }

    if (desc) {
      lines.push(`<div class="terminal-line log-warning" style="padding-left: 1rem;">${desc}</div>`);
    }
  }

  return { lines, inCommonPasswords };
}

function updateTerminalTelemetry(
  password: string,
  result: ZxcvbnResult,
  algo: Algorithm
): void {
  const terminalBody = document.getElementById("telemetry-output");
  const statusDot    = document.querySelector(".terminal-status-dot");
  const statusText   = document.querySelector(".terminal-status");
  if (!terminalBody) return;

  if (statusDot) statusDot.classList.add("active");
  if (statusText) {
    statusText.classList.add("active");
    statusText.textContent = "ACTIVE";
  }

  const lines: string[] = [
    `<div class="terminal-line log-system">[EVAL] Running passphrase telemetry (algo: ${algo})...</div>`,
    `<div class="terminal-line log-system">[SYS] Input Length: ${password.length} characters</div>`,
    `<div class="terminal-line log-info">[HASH] ${algo.toUpperCase()}: <span class="log-success">${result.hashValue || "Computing hash..."}</span></div>`,
    `<div class="terminal-line log-system">[PROOF] Keyspace complexity estimation:</div>`,
  ];

  try {
    const log2Guesses  = Math.log2(result.guesses);
    const entropyBits  = log2Guesses.toFixed(2);
    const log10Guesses = log2Guesses / Math.log2(10); // log10 via log2 change-of-base

    const guessesSci = result.guesses >= 1000
      ? (() => {
          const exponent    = Math.floor(log10Guesses);
          const coefficient = (result.guesses / 10 ** exponent).toFixed(2);
          return `${coefficient} \\times 10^{${exponent}}`;
        })()
      : String(result.guesses);

    const eqGuesses = katex.renderToString(`G \\approx ${guessesSci}`, { throwOnError: false });
    const eqEntropy = katex.renderToString(`E = \\log_2(G) \\approx ${entropyBits} \\text{ bits}`, { throwOnError: false });
    const eqVerify  = katex.renderToString(`2^{${entropyBits}} \\approx G`, { throwOnError: false });

    lines.push(`<div class="terminal-line log-info" style="padding-left: 1rem; display: flex; flex-direction: column; gap: 0.25rem;">
      <div>• Guesses: ${eqGuesses}</div>
      <div>• Entropy: ${eqEntropy}</div>
      <div>• Equation: ${eqVerify}</div>
    </div>`);
  } catch {
    lines.push(`<div class="terminal-line log-error">• KaTeX rendering failed</div>`);
  }

  lines.push(`<div class="terminal-line log-system">[PATTERN] Telemetry analysis:</div>`);

  const { lines: patternLines, inCommonPasswords } = buildPatternLines(result.sequence ?? []);

  if (patternLines.length > 0) {
    lines.push(...patternLines);
  } else {
    lines.push(`<div class="terminal-line log-info" style="padding-left: 1rem;">• No heuristic patterns detected. Brute-force verification required.</div>`);
  }

  lines.push(`<div class="terminal-line log-system">[DICTIONARY] Database check:</div>`);
  lines.push(
    inCommonPasswords
      ? `<div class="terminal-line log-error" style="padding-left: 1rem; font-weight: bold;">[!] DANGER: Base password found in top-passwords lists!</div>`
      : `<div class="terminal-line log-success" style="padding-left: 1rem;">[✓] Passphrase structure clean from common password lists.</div>`
  );
  lines.push(`<div class="terminal-line log-system">[MONITOR] Telemetry stream updated.</div>`);

  terminalBody.innerHTML = lines.join("");
  terminalBody.scrollTop = terminalBody.scrollHeight;
}

function resetTerminalTelemetry(): void {
  const terminalBody = document.getElementById("telemetry-output");
  const statusDot    = document.querySelector(".terminal-status-dot");
  const statusText   = document.querySelector(".terminal-status");
  if (!terminalBody) return;

  if (statusDot) statusDot.classList.remove("active");
  if (statusText) {
    statusText.classList.remove("active");
    statusText.textContent = "OFFLINE";
  }

  terminalBody.innerHTML = `
    <div class="terminal-line log-system">[SYS] Initializing entropy telemetry sandbox...</div>
    <div class="terminal-line log-system">[SYS] Hashing engine: hash-wasm (WASM loaded)</div>
    <div class="terminal-line log-system">[SYS] Entropy estimator: @zxcvbn-ts (Offline dictionary loaded)</div>
    <div class="terminal-line log-system">[SYS] CSP: Connect-src blocked. WebWorker thread: Spawned.</div>
    <div class="terminal-line log-info">Ready. Enter passphrase to stream telemetry.</div>
    <div class="terminal-line log-system">[MONITOR] Awaiting entropy stream...</div>
  `;
}
