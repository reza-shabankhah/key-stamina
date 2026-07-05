
import {
  evaluatePassword,
  calculateCrackTime,
  formatTime,
  calculateRequiredGuesses,
  generateTargetedPassphrase,
  Algorithm,
  HardwareTier,
  TimeUnit,
  ZxcvbnResult,
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
  ["laptop", "time-laptop"],
  ["pc", "time-pc"],
  ["server", "time-server"],
  ["supercomputer", "time-supercomputer"],
];

function getAlgo(): Algorithm {
  return ((
    document.getElementById("hash-algorithm") as HTMLSelectElement | null
  )?.value || "argon2id") as Algorithm;
}

function initPassphraseInput(): void {
  const textarea = document.getElementById(
    "passphrase-input",
  ) as HTMLTextAreaElement | null;
  const counter = document.getElementById("char-counter");
  const clearBtn = document.getElementById("clear-input-btn");
  const copyBtn = document.getElementById(
    "copy-btn",
  ) as HTMLButtonElement | null;

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

    const len = textarea.value.length;
    const hasContent = len > 0;

    if (counter) counter.textContent = hasContent ? ` (${len})` : "";
    if (clearBtn) clearBtn.hidden = !hasContent;

    const invalidChar = textarea.value.match(/[^\x20-\x7E]/)?.[0];

    // Reset Passphrase Copy Button
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
        evaluatePassword(textarea.value, algo).then((result) => {
          if (!result || currentJobId !== latestInputJobId) return;
          updateCrackTimes(result.guesses);
          updateCrackTimeBadge(result.guesses, algo);
          updateConsole(textarea.value, result, algo);
        });
      }, 500);
    } else {
      clearTimeout(evaluateTimeout);
      latestInputJobId++;
      resetCrackTimes();
      resetCrackTimeBadge();
      resetConsole();
    }

    adjustHeight();
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (copyBtn.classList.contains("btn-unsupported") || !textarea.value)
        return;
      executeCopy(textarea.value, copyBtn);
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
      resetCrackTimeBadge();
      resetConsole();
      textarea.focus();
    });
  }
}

function initTargetTimeValueInput(): void {
  const input = document.getElementById(
    "minimum-time-value",
  ) as HTMLInputElement | null;
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
    input.value =
      !input.value || isNaN(num)
        ? "1"
        : String(Math.min(Math.max(num, 0), 999));
  });
}

function initBorderMaskHandling(): void {
  const textarea = document.getElementById("passphrase-input");
  const borderBox = document.querySelector(
    ".passphrase-border-box",
  ) as HTMLElement | null;
  const labelCore = document.querySelector(".label-core") as HTMLElement | null;
  const charCounter = document.getElementById("char-counter");
  const clearBtn = document.getElementById("clear-input-btn");

  if (!textarea || !borderBox || !labelCore) return;

  let maskRaf: number;
  const updateMask = () => {
    cancelAnimationFrame(maskRaf);
    maskRaf = requestAnimationFrame(() => {
      const counterWidth = charCounter?.textContent
        ? charCounter.offsetWidth
        : 0;
      const textWidth = labelCore.offsetWidth + counterWidth;
      const unscaledLabelWidth = textWidth + 11.2;
      const maskWidth = unscaledLabelWidth * 0.75;
      const maskLeft = 6.4;

      borderBox.style.setProperty("--mask-width", `${maskWidth}px`);
      borderBox.style.setProperty("--mask-left", `${maskLeft}px`);
    });
  };

  updateMask();
  textarea.addEventListener("input", updateMask);
  textarea.addEventListener("focus", updateMask);
  textarea.addEventListener("blur", updateMask);
  window.addEventListener("resize", updateMask);
  if (clearBtn) clearBtn.addEventListener("click", updateMask);
}

function initMobileAutoScroll(): void {
  const textarea = document.getElementById(
    "passphrase-input",
  ) as HTMLTextAreaElement | null;
  const card = document.querySelector(".passphrase-card") as HTMLElement | null;

  if (!textarea || !card) return;

  let isMobile = false;
  const checkMobile = () => {
    isMobile = window.innerWidth <= 768;
  };

  window.addEventListener("resize", checkMobile);
  checkMobile();

  textarea.addEventListener("focus", () => {
    if (!isMobile) return;

    // Allows native keyboard expansion to calculate before pushing the scroll
    setTimeout(() => {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  });

}

function initTooltips(): void {
  const triggers =
    document.querySelectorAll<HTMLButtonElement>(".tooltip-trigger");

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
    const isPinned = trigger.getAttribute("aria-expanded") === "true";

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

  document
    .querySelectorAll<HTMLElement>(".clickable-title")
    .forEach((title) => {
      title.addEventListener("click", (e) => {
        e.stopPropagation();
        const container = title.closest(
          ".label-with-tooltip, .title-with-tooltip, .aligned-settings-row, .section-card, .console-header",
        );
        const trigger =
          container?.querySelector<HTMLButtonElement>(".tooltip-trigger");
        if (trigger) togglePinTooltip(trigger);
      });
    });

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      !target.closest(".tooltip-container") &&
      !target.closest(".clickable-title")
    ) {
      unpinAllTooltips();
    }
  });
}

function initHashSelector(): void {
  const hashSelect = document.getElementById(
    "hash-algorithm",
  ) as HTMLSelectElement | null;
  const textarea = document.getElementById(
    "passphrase-input",
  ) as HTMLTextAreaElement | null;
  if (!hashSelect || !textarea) return;

  hashSelect.addEventListener("change", () => {
    if (!textarea.value.length) return;
    const currentJobId = ++latestInputJobId;
    const algo = hashSelect.value as Algorithm;

    evaluatePassword(textarea.value, algo).then((result) => {
      if (!result || currentJobId !== latestInputJobId) return;
      updateCrackTimes(result.guesses);
      updateConsole(textarea.value, result, algo);
    });
  });
}

function updateCrackTimes(guesses: number): void {
  const algo = getAlgo();
  for (const [tier, elId] of TIER_EL_MAP) {
    const el = document.getElementById(elId);
    if (!el) continue;
    const formatted = formatTime(calculateCrackTime(guesses, tier, algo));
    const valEl = el.querySelector(".time-value");
    const unitEl = el.querySelector(".time-unit");
    if (valEl) valEl.textContent = formatted.value;
    if (unitEl) unitEl.textContent = formatted.unit;
  }
}

function resetCrackTimes(): void {
  for (const [, elId] of TIER_EL_MAP) {
    const el = document.getElementById(elId);
    if (!el) continue;
    const valEl = el.querySelector(".time-value");
    const unitEl = el.querySelector(".time-unit");
    if (valEl) valEl.textContent = "  0";
    if (unitEl) unitEl.textContent = "Seconds";
  }
}

function updateCrackTimeBadge(guesses: number, algo: Algorithm): void {
  const badge = document.getElementById("crack-time-badge");
  if (!badge) return;
  badge.classList.remove("badge-low", "badge-medium", "badge-high");
  
  const crackTime = calculateCrackTime(guesses, "supercomputer", algo);

  // 1 Year threshold = 31,536,000 seconds
  // 1 Century threshold = 3,153,600,000 seconds
  if (crackTime < 31536000) {
    badge.textContent = "Low";
    badge.classList.add("badge-low");
  } else if (crackTime < 3153600000) {
    badge.textContent = "Medium";
    badge.classList.add("badge-medium");
  } else {
    badge.textContent = "High";
    badge.classList.add("badge-high");
  }
}

function resetCrackTimeBadge(): void {
  const badge = document.getElementById("crack-time-badge");
  if (!badge) return;
  badge.textContent = "Low";
  badge.classList.remove("badge-medium", "badge-high");
  badge.classList.add("badge-low");
}

function initGenerateButton(): void {
  const generateBtn = document.getElementById("generate-btn");
  const formatSelect = document.getElementById(
    "generator-format",
  ) as HTMLSelectElement | null;
  const targetHardwareSelect = document.getElementById(
    "target-hardware",
  ) as HTMLSelectElement | null;
  const targetTimeValueInput = document.getElementById(
    "minimum-time-value",
  ) as HTMLInputElement | null;
  const targetTimeUnitSelect = document.getElementById(
    "minimum-time-unit",
  ) as HTMLSelectElement | null;
  const hashSelect = document.getElementById(
    "hash-algorithm",
  ) as HTMLSelectElement | null;
  const textarea = document.getElementById(
    "passphrase-input",
  ) as HTMLTextAreaElement | null;

  if (
    !generateBtn ||
    !formatSelect ||
    !targetHardwareSelect ||
    !targetTimeValueInput ||
    !targetTimeUnitSelect ||
    !hashSelect ||
    !textarea
  )
    return;

  generateBtn.addEventListener("click", () => {
    const panel = document.getElementById("advanced-generation-panel");
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

    const hardware = targetHardwareSelect.value as HardwareTier;
    const timeValue = parseFloat(targetTimeValueInput.value) || 1;
    const timeUnit = targetTimeUnitSelect.value as TimeUnit;
    const algo = hashSelect.value as Algorithm;
    const requiredGuesses = calculateRequiredGuesses(
      timeValue,
      timeUnit,
      hardware,
      algo,
    );

    textarea.value = generateTargetedPassphrase(
      format as "ascii" | "numeric",
      requiredGuesses,
      algo,
    );
    textarea.dispatchEvent(new Event("input"));
  });
}

function initAdvancedPanelToggle(): void {
  const toggleBtn = document.getElementById("toggle-advanced-btn");
  const panel = document.getElementById("advanced-generation-panel");
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener("click", () => {
    const isExpanded = panel.classList.toggle("expanded");
    toggleBtn.textContent = isExpanded ? "×" : "+";
    toggleBtn.setAttribute(
      "aria-label",
      isExpanded ? "Collapse advanced options" : "Expand advanced options",
    );
  });
}

function initDynamicFormatOptionsInteractivity(): void {
  const formatSelect = document.getElementById(
    "generator-format",
  ) as HTMLSelectElement | null;
  const asciiOptions = document.getElementById("ascii-options");
  const dicewareOptions = document.getElementById("diceware-options");
  const separatorInput = document.getElementById(
    "diceware-separator",
  ) as HTMLInputElement | null;

  if (formatSelect && asciiOptions && dicewareOptions) {
    formatSelect.addEventListener("change", () => {
      const isDiceware = formatSelect.value === "diceware";
      asciiOptions.style.display = isDiceware ? "none" : "flex";
      dicewareOptions.style.display = isDiceware ? "flex" : "none";
    });
  }

  if (separatorInput) {
    separatorInput.addEventListener("beforeinput", (e: InputEvent) => {
      if (e.data && !/^[\x20-\x7E]$/.test(e.data)) e.preventDefault();
    });
    separatorInput.addEventListener("input", () => {
      separatorInput.value = separatorInput.value
        .replace(/[^\x20-\x7E]/g, "")
        .slice(0, 1);
    });
    separatorInput.addEventListener("blur", () => {
      if (!separatorInput.value) separatorInput.value = " ";
    });
  }
}

function buildPatternLines(sequence: any[]): {
  lines: string[];
  inCommonPasswords: boolean;
} {
  const lines: string[] = [];
  let inCommonPasswords = false;

  for (const match of sequence) {
    let desc = "";

    if (match.pattern === "dictionary") {
      const dictionary = match.dictionaryName ?? "unknown";
      if (dictionary === "passwords") inCommonPasswords = true;

      if (match.l33t) {
        desc = `"${match.token}" is in [${dictionary} l33t]`;
      } else {
        desc = `"${match.token}" is in [${dictionary}]`;
      }
    } else if (match.pattern === "spatial") {
      desc = `"${match.token}" is in [spatial]`;
    } else if (match.pattern === "repeat") {
      desc = `"${match.token}" is in [repeat]`;
    } else if (match.pattern === "sequence") {
      desc = `"${match.token}" is in [sequence]`;
    } else if (match.pattern === "regex") {
      desc = `"${match.token}" is in [regex]`;
    }

    if (desc) {
      lines.push(
        `<div class="console-line log-info">${desc}</div>`,
      );
    }
  }

  return { lines, inCommonPasswords };
}

function updateConsole(
  password: string,
  result: ZxcvbnResult,
  algo: Algorithm,
): void {
  const consoleBody = document.getElementById("console-output");
  const statusDot = document.querySelector(".console-status-dot");
  const statusText = document.querySelector(".console-status");
  if (!consoleBody) return;

  if (statusDot) statusDot.classList.add("active");
  if (statusText) {
    statusText.classList.add("active");
    statusText.textContent = "ACTIVE";
  }

  let kdfParams = "N/A";
  if (algo === "pbkdf2") kdfParams = "m=N/A, t=600000, p=1";
  else if (algo === "bcrypt") kdfParams = "cost=10";
  else if (algo === "argon2id") kdfParams = "m=65536, t=3, p=1";
  else if (algo === "sha256" || algo === "md5") kdfParams = "raw";

  const lines: string[] = [
    `<div class="console-line log-info">[CRYPTOGRAPHY]</div>`,
    `<div class="console-line log-info">Algorithm: ${algo.toUpperCase()} (${kdfParams})</div>`,
    `<div class="console-line log-info">Hash: ${result.hashValue || "..."}</div>`
  ];

  if (algo === "bcrypt" && password.length > 72) {
    lines.push(
      `<div class="console-line log-info">Warning: bcrypt silently truncates input at 72 bytes.</div>`
    );
  }

  const log2Guesses = Math.log2(result.guesses);
  const entropyBits = log2Guesses.toFixed(2);
  const log10Guesses = log2Guesses / Math.log2(10);

  const guessesSci =
    result.guesses >= 1000
      ? (() => {
          const exponent = Math.floor(log10Guesses);
          const coefficient = (result.guesses / 10 ** exponent).toFixed(2);
          return `${coefficient} * 10^${exponent}`;
        })()
      : String(result.guesses);

  lines.push(
    `<div class="console-line log-info">Guesses: G ≈ ${guessesSci}</div>`,
    `<div class="console-line log-info">Entropy: E = ${entropyBits} bits</div>`
  );

  const { lines: patternLines, inCommonPasswords } = buildPatternLines(
    result.sequence ?? [],
  );

  lines.push(`<div class="console-line log-info">&nbsp;</div>`);
  lines.push(`<div class="console-line log-info">[VULNERABILITIES]</div>`);

  if (patternLines.length > 0) {
    lines.push(...patternLines);
  } else {
    lines.push(`<div class="console-line log-info">No Vulnerability Patterns Detected</div>`);
  }

  if (inCommonPasswords) {
    lines.push(
      `<div class="console-line log-info">Danger: Base password found in top-passwords lists</div>`
    );
  }

  consoleBody.innerHTML = lines.join("\n");
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

function resetConsole(): void {
  const consoleBody = document.getElementById("console-output");
  const statusDot = document.querySelector(".console-status-dot");
  const statusText = document.querySelector(".console-status");
  if (!consoleBody) return;

  if (statusDot) statusDot.classList.remove("active");
  if (statusText) {
    statusText.classList.remove("active");
    statusText.textContent = "OFFLINE";
  }

  consoleBody.innerHTML = `
    <div class="console-line log-info">[SYSTEM READY]</div>
    <div class="console-line log-info">Engines: zxcvbn-ts, hash-wasm</div>
    <div class="console-line log-info">Active Language Packages:</div>
    <div class="console-line log-info">- @zxcvbn-ts/language-common</div>
    <div class="console-line log-info">- @zxcvbn-ts/language-en</div>
    <div class="console-line log-info">- @zxcvbn-ts/language-fa</div>
    <div class="console-line log-info">&nbsp;</div>
    <div class="console-line log-info">Awaiting input stream...</div>
  `;
}

function executeCopy(text: string, btn: HTMLButtonElement): void {
  const onSuccess = () => {
    btn.textContent = "Copied!";
    btn.disabled = true;
  };

  const fallbackCopy = () => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    try {
      document.execCommand("copy");
    } catch {}
    document.body.removeChild(el);
    onSuccess();
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}
