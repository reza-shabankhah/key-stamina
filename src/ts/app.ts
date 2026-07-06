import {
  evaluatePassword,
  calculateCrackTime,
  formatTime,
  buildAsciiPool,
  generateAscii,
  generateDiceware,
  Algorithm,
  HardwareTier,
} from "./crypto";

let latestInputJobId = 0;
let evaluateTimeout: number | undefined;
let isProgrammaticInput = false;

type ConsoleState =
  | "idle"
  | "processing_manual"
  | "processing_generation"
  | "completed_manual"
  | "completed_generation";

class ConsoleManager {
  private static instance: ConsoleManager;
  private state: ConsoleState = "idle";
  private timerStart: number = 0;
  private timerId: number | null = null;
  private lastRenderData: any = {};

  private constructor() {}

  public static getInstance(): ConsoleManager {
    if (!ConsoleManager.instance) {
      ConsoleManager.instance = new ConsoleManager();
    }
    return ConsoleManager.instance;
  }

  public setState(newState: ConsoleState, extraData?: any) {
    const isSameState = this.state === newState;
    this.state = newState;
    this.lastRenderData = extraData || {};

    if (newState.startsWith("processing_")) {
      if (!isSameState || newState === "processing_manual") {
        this.timerStart = Date.now();
        if (this.timerId !== null) clearInterval(this.timerId);
        this.timerId = window.setInterval(
          () => this.updateTimerDisplay(),
          1000,
        );
      }
      this.render();
      if (!isSameState || newState === "processing_manual") {
        this.updateTimerDisplay();
      }
    } else {
      if (this.timerId !== null) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      this.render();
    }
  }

  private updateTimerDisplay() {
    const elapsed = Math.floor((Date.now() - this.timerStart) / 1000);
    const timerEl = document.getElementById("console-timer-val");
    if (timerEl) {
      timerEl.textContent = elapsed.toString();
    }
  }

  private render() {
    const consoleBody = document.getElementById("console-output");
    const consoleCard = consoleBody?.closest(".console-card");
    const statusDot = document.querySelector(".console-status-dot");
    const statusText = document.querySelector(".console-status");
    if (!consoleBody) return;

    const checkScrollFade = () => {
      if (!consoleCard) return;
      const isScrollable =
        consoleBody.scrollHeight - consoleBody.scrollTop >
        consoleBody.clientHeight + 2;
      consoleCard.classList.toggle("is-scrollable", isScrollable);
    };

    if (!consoleBody.hasAttribute("data-scroll-listener")) {
      consoleBody.addEventListener("scroll", checkScrollFade, {
        passive: true,
      });
      window.addEventListener("resize", checkScrollFade, { passive: true });
      consoleBody.setAttribute("data-scroll-listener", "true");
    }

    let timeText = "";
    if (this.state.startsWith("completed_")) {
      const elapsed = Math.ceil((Date.now() - this.timerStart) / 1000);
      timeText = ` (${elapsed}s)`;
    } else if (this.state.startsWith("processing_")) {
      const elapsed = Math.floor((Date.now() - this.timerStart) / 1000);
      timeText = ` (<span id="console-timer-val">${elapsed}</span>s)`;
    }

    if (this.state === "idle") {
      if (statusDot) statusDot.classList.remove("active");
      if (statusText) {
        statusText.classList.remove("active");
        statusText.textContent = "IDLE";
      }
      consoleBody.innerHTML = `
        <div class="console-line">[ENGINE STATUS]</div>
        <div class="console-line">Awaiting input stream...</div>
        <div class="console-line"><br/></div>
        <div class="console-line">Active zxcvbn language Packages:</div>
        <div class="console-line">- common</div>
        <div class="console-line">- en</div>
        <div class="console-line">- fa</div>
      `;
    } else if (this.state === "processing_manual") {
      if (statusDot) statusDot.classList.add("active");
      if (statusText) {
        statusText.classList.add("active");
        statusText.textContent = "ACTIVE";
      }
      consoleBody.innerHTML = `
        <div class="console-line">[ENGINE STATUS]</div>
        <div class="console-line">Processing...${timeText}</div>
        <div class="console-line">Manual input</div>
      `;
    } else if (this.state === "processing_generation") {
      if (statusDot) statusDot.classList.add("active");
      if (statusText) {
        statusText.classList.add("active");
        statusText.textContent = "ACTIVE";
      }

      let vulnerabilityLog = "";
      if (
        this.lastRenderData.attempt &&
        this.lastRenderData.vulnerabilities &&
        this.lastRenderData.vulnerabilities.length > 0
      ) {
        vulnerabilityLog = `<div class="console-line">Attempt #${this.lastRenderData.attempt} detected '${this.lastRenderData.vulnerabilities.join("' and '")}'</div>`;
      }

      consoleBody.innerHTML = `
        <div class="console-line">[ENGINE STATUS]</div>
        <div class="console-line">Processing...${timeText}</div>
        ${vulnerabilityLog}
      `;
    } else if (
      this.state === "completed_manual" ||
      this.state === "completed_generation"
    ) {
      if (statusDot) statusDot.classList.add("active");
      if (statusText) {
        statusText.classList.add("active");
        statusText.textContent = "ACTIVE";
      }

      const { password, result, algo, attempt } = this.lastRenderData;

      let kdfParams = "N/A";
      if (algo === "pbkdf2") kdfParams = "m=N/A, t=600000, p=1";
      else if (algo === "bcrypt") kdfParams = "cost=10";
      else if (algo === "argon2id") kdfParams = "m=65536, t=3, p=1";
      else if (algo === "sha256" || algo === "md5") kdfParams = "raw";

      const lines: string[] = [
        `<div class="console-line">[ENGINE STATUS]</div>`,
        `<div class="console-line">Processed${timeText}</div>`,
        `<div class="console-line">${this.state === "completed_manual" ? "Manual input" : `Generated on attempt #${attempt || 1}`}</div>`,
        `<div class="console-line"><br/></div>`,
        `<div class="console-line">[CRYPTOGRAPHY]</div>`,
        `<div class="console-line">Algorithm: ${algo.toUpperCase()} (${kdfParams})</div>`,
        `<div class="console-line">Hash: ${result.hashValue || "..."}</div>`,
      ];

      if (algo === "bcrypt" && password.length > 72) {
        lines.push(
          `<div class="console-line">Warning: bcrypt silently truncates input at 72 bytes.</div>`,
        );
      }

      const log2Guesses = Math.log2(result.guesses);
      const entropyBits = log2Guesses.toFixed(2);
      const log10Guesses = log2Guesses / Math.log2(10);
      const guessesSci =
        log10Guesses >= 4
          ? `10^${log10Guesses.toFixed(1)}`
          : result.guesses.toString();

      lines.push(
        `<div class="console-line">Guesses ≈ ${guessesSci}</div>`,
        `<div class="console-line">Entropy ≈ ${entropyBits} bits</div>`,
      );

      if (result.sequence && result.sequence.length > 0) {
        lines.push(`<div class="console-line"><br/></div>`);
        lines.push(`<div class="console-line">[VULNERABILITIES]</div>`);

        let foundVuln = false;
        let inCommonPasswords = false;
        result.sequence.forEach((match: any) => {
          if (match.pattern !== "bruteforce") {
            foundVuln = true;

            let desc = "";
            if (match.pattern === "dictionary") {
              const dictionary = match.dictionaryName ?? "unknown";
              if (dictionary === "passwords") inCommonPasswords = true;

              if (match.l33t) {
                desc = `"${match.token}" is in [${dictionary} l33t]`;
              } else {
                desc = `"${match.token}" is in [${dictionary}]`;
              }
            } else {
              desc = `"${match.token}" is in [${match.pattern}]`;
            }

            lines.push(`<div class="console-line">${desc}</div>`);
          }
        });
        if (!foundVuln) {
          lines.push(
            `<div class="console-line">None detected. (Pure bruteforce)</div>`,
          );
        } else if (inCommonPasswords) {
          lines.push(`<div class="console-line"><br/></div>`);
          lines.push(
            `<div class="console-line">Danger: Base password found in top-passwords lists</div>`,
          );
        }
      }

      consoleBody.innerHTML = lines.join("");
    }
    setTimeout(checkScrollFade, 0);
  }
}

ConsoleManager.getInstance().setState("idle");
initPassphraseInput();
initLengthInputOptions();
initBorderMaskHandling();
initMobileAutoScroll();
initTooltips();
initHashSelector();
initGenerateButton();
initAdvancedPanelToggle();
initDynamicFormatOptionsInteractivity();
initGlobalKeyboardListener();

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

    if (isProgrammaticInput) return;

    if (hasContent && !invalidChar) {
      clearTimeout(evaluateTimeout);
      ConsoleManager.getInstance().setState("processing_manual");
      evaluateTimeout = window.setTimeout(() => {
        const currentJobId = ++latestInputJobId;
        const algo = getAlgo();
        evaluatePassword(textarea.value, algo).then((result) => {
          if (!result || currentJobId !== latestInputJobId) return;
          updateCrackTimes(result.guesses);
          updateCrackTimeBadge(result.guesses, algo);
          ConsoleManager.getInstance().setState("completed_manual", {
            password: textarea.value,
            result,
            algo,
          });
        });
      }, 500);
    } else {
      clearTimeout(evaluateTimeout);
      latestInputJobId++;
      resetCrackTimes();
      resetCrackTimeBadge();
      ConsoleManager.getInstance().setState("idle");
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
      if (counter) counter.textContent = "";
      clearBtn.hidden = true;
      if (copyBtn) {
        copyBtn.textContent = "Copy";
        copyBtn.disabled = true;
        copyBtn.classList.remove("btn-unsupported");
      }
      clearTimeout(evaluateTimeout);
      latestInputJobId++;
      resetCrackTimes();
      resetCrackTimeBadge();
      ConsoleManager.getInstance().setState("idle");
      textarea.focus();
    });
  }
}

function initLengthInputOptions(): void {
  const formatSelect = document.getElementById(
    "generator-format",
  ) as HTMLSelectElement | null;
  const titleLabel = document.getElementById("length-title-label");
  const input = document.getElementById(
    "length-input",
  ) as HTMLInputElement | null;
  const btnDec = document.getElementById("length-decrease");
  const btnInc = document.getElementById("length-increase");

  if (!formatSelect || !titleLabel || !input || !btnDec || !btnInc) return;

  const updateFormatBounds = () => {
    const isDiceware = formatSelect.value === "diceware";
    titleLabel.textContent = isDiceware
      ? "Number of words:"
      : "Number of characters:";

    if (isDiceware) {
      input.value = "5";
    } else {
      input.value = "14";
    }
  };

  formatSelect.addEventListener("change", updateFormatBounds);

  const enforceBounds = () => {
    let num = parseInt(input.value, 10);
    if (isNaN(num)) num = formatSelect.value === "diceware" ? 5 : 14;

    const max = formatSelect.value === "diceware" ? 20 : 128;
    const min = 1;

    input.value = String(Math.min(Math.max(num, min), max));
  };

  input.addEventListener("beforeinput", (e: InputEvent) => {
    if (e.data && !/^[0-9]+$/.test(e.data)) e.preventDefault();
  });

  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "");

    if (input.value) {
      const num = parseInt(input.value, 10);
      const max = formatSelect.value === "diceware" ? 20 : 128;
      if (num > max) {
        input.value = String(max);
      }
    }
  });

  input.addEventListener("blur", enforceBounds);

  const setupHoldToChange = (btn: HTMLElement, delta: number) => {
    let timeoutId: number | null = null;
    let currentDelay = 150;
    const minDelay = 15;
    const decay = 0.85;

    const changeVal = () => {
      let val = parseInt(input.value, 10) || 1;
      input.value = String(val + delta);
      enforceBounds();
    };

    const tick = () => {
      changeVal();
      currentDelay = Math.max(minDelay, currentDelay * decay);
      timeoutId = window.setTimeout(tick, currentDelay);
    };

    const start = (e: Event) => {
      if (e.cancelable) e.preventDefault();

      if (timeoutId !== null) return;

      changeVal();

      currentDelay = 150;

      timeoutId = window.setTimeout(tick, 400);
    };

    const stop = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    btn.addEventListener("mousedown", start);
    btn.addEventListener("touchstart", start, { passive: false });

    btn.addEventListener("mouseup", stop);
    btn.addEventListener("mouseleave", stop);
    btn.addEventListener("touchend", stop);
    btn.addEventListener("touchcancel", stop);
  };

  setupHoldToChange(btnDec, -1);
  setupHoldToChange(btnInc, 1);
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
  const card = document.querySelector(".passphrase-card") as HTMLElement | null;
  if (!card) return;

  const inputs = [
    document.getElementById("passphrase-input"),
    document.getElementById("length-input"),
    document.getElementById("diceware-separator"),
  ];

  inputs.forEach((input) => {
    if (!input) return;
    input.addEventListener("focus", () => {
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      }
    });
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
    clearTimeout(evaluateTimeout);
    const currentJobId = ++latestInputJobId;
    const algo = hashSelect.value as Algorithm;

    ConsoleManager.getInstance().setState("processing_manual");

    evaluatePassword(textarea.value, algo).then((result) => {
      if (!result || currentJobId !== latestInputJobId) return;
      updateCrackTimes(result.guesses);
      updateCrackTimeBadge(result.guesses, algo);
      ConsoleManager.getInstance().setState("completed_manual", {
        password: textarea.value,
        result,
        algo,
      });
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
  const generateBtn = document.getElementById(
    "generate-btn",
  ) as HTMLButtonElement | null;
  const formatSelect = document.getElementById(
    "generator-format",
  ) as HTMLSelectElement | null;
  const hashSelect = document.getElementById(
    "hash-algorithm",
  ) as HTMLSelectElement | null;
  const textarea = document.getElementById(
    "passphrase-input",
  ) as HTMLTextAreaElement | null;

  const uppercaseCheckbox = document.getElementById(
    "ascii-uppercase",
  ) as HTMLInputElement | null;
  const lowercaseCheckbox = document.getElementById(
    "ascii-lowercase",
  ) as HTMLInputElement | null;
  const numbersCheckbox = document.getElementById(
    "ascii-numbers",
  ) as HTMLInputElement | null;
  const symbolsCheckbox = document.getElementById(
    "ascii-special",
  ) as HTMLInputElement | null;
  const ambigCheckbox = document.getElementById(
    "ascii-ambiguous",
  ) as HTMLInputElement | null;
  const separatorInput = document.getElementById(
    "diceware-separator",
  ) as HTMLInputElement | null;

  if (
    !generateBtn ||
    !formatSelect ||
    !hashSelect ||
    !textarea ||
    !uppercaseCheckbox ||
    !lowercaseCheckbox ||
    !numbersCheckbox ||
    !symbolsCheckbox ||
    !ambigCheckbox ||
    !separatorInput
  ) {
    return;
  }

  generateBtn.addEventListener("click", async () => {
    const originalBtnText = generateBtn.innerHTML;
    textarea.classList.add("is-generating");
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<div class="spinner"></div>';

    const panel = document.getElementById("advanced-generation-panel");
    const toggleBtn = document.getElementById("toggle-advanced-btn");

    if (panel && !panel.classList.contains("expanded")) {
      panel.classList.add("expanded");
      if (toggleBtn) {
        toggleBtn.textContent = "×";
        toggleBtn.setAttribute("aria-label", "Collapse advanced options");
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    const format = formatSelect.value as "ascii" | "diceware";
    const lengthInput = document.getElementById(
      "length-input",
    ) as HTMLInputElement | null;
    const currentLength = parseInt(lengthInput?.value || "14", 10);
    const algo = hashSelect.value as Algorithm;

    const useUpper = uppercaseCheckbox.checked;
    const useLower = lowercaseCheckbox.checked;
    const useNum = numbersCheckbox.checked;
    const useSym = symbolsCheckbox.checked;
    const useAmbig = ambigCheckbox.checked;

    const dicewareSeparator = separatorInput.value;

    let asciiPool = "";
    if (format === "ascii") {
      try {
        asciiPool = buildAsciiPool({
          useUpper,
          useLower,
          useNum,
          useSym,
          useAmbig,
        });
      } catch (err: any) {
        alert(err.message);
        generateBtn.innerHTML = originalBtnText;
        generateBtn.disabled = false;
        textarea.classList.remove("is-generating");
        return;
      }
    }

    clearTimeout(evaluateTimeout);
    latestInputJobId++;
    ConsoleManager.getInstance().setState("processing_generation", {
      attempt: 1,
      vulnerabilities: [],
    });

    let finalPassphrase = "";
    let finalResult: any = null;

    let attempts = 0;
    const maxAttempts = 100;

    let candidate =
      format === "ascii"
        ? generateAscii(currentLength, asciiPool)
        : generateDiceware(currentLength, dicewareSeparator);

    while (attempts < maxAttempts) {
      let hasVulnerability = false;
      let currentResult: any = null;

      if (format === "ascii") {
        currentResult = await evaluatePassword(candidate, algo, true);
        if (!currentResult) break;

        if (currentResult.sequence) {
          const badIndices = new Set<number>();

          currentResult.sequence.forEach((match: any) => {
            if (match.pattern !== "bruteforce") {
              for (let idx = match.i; idx <= match.j; idx++) {
                badIndices.add(idx);
              }
            }
          });

          if (badIndices.size > 0) {
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
            );
            ConsoleManager.getInstance().setState("processing_generation", {
              attempt: attempts + 1,
              vulnerabilities: detectedPatterns,
            });

            const newChars = generateAscii(badIndices.size, asciiPool);
            const candidateArray = candidate.split("");

            let replaceIdx = 0;
            badIndices.forEach((idx) => {
              candidateArray[idx] = newChars[replaceIdx];
              replaceIdx++;
            });

            candidate = candidateArray.join("");
          }
        }
      }

      if (!hasVulnerability) {
        finalPassphrase = candidate;
        finalResult = await evaluatePassword(candidate, algo, false);
        break;
      }

      attempts++;
    }

    if (!finalPassphrase && attempts >= maxAttempts) {
      finalPassphrase = candidate;
      finalResult = await evaluatePassword(candidate, algo);
    }

    generateBtn.innerHTML = originalBtnText;
    generateBtn.disabled = false;
    textarea.classList.remove("is-generating");

    if (finalPassphrase && finalResult) {
      isProgrammaticInput = true;
      textarea.value = finalPassphrase;

      textarea.dispatchEvent(new Event("input"));
      isProgrammaticInput = false;

      clearTimeout(evaluateTimeout);
      latestInputJobId++;

      ConsoleManager.getInstance().setState("completed_generation", {
        password: finalPassphrase,
        result: finalResult,
        algo,
        attempt: attempts + 1,
      });
      updateCrackTimes(finalResult.guesses);
      updateCrackTimeBadge(finalResult.guesses, algo);
    }
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
        .slice(-1);
    });
    separatorInput.addEventListener("blur", () => {
      if (!separatorInput.value) separatorInput.value = " ";
    });
  }

  const primaryCheckboxes = [
    document.getElementById("ascii-uppercase") as HTMLInputElement | null,
    document.getElementById("ascii-lowercase") as HTMLInputElement | null,
    document.getElementById("ascii-numbers") as HTMLInputElement | null,
    document.getElementById("ascii-special") as HTMLInputElement | null,
    document.getElementById("ascii-ambiguous") as HTMLInputElement | null,
  ].filter(Boolean) as HTMLInputElement[];

  primaryCheckboxes.forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const activeCount = primaryCheckboxes.filter((c) => c.checked).length;
      if (activeCount === 0) {
        e.preventDefault();
        cb.checked = true;

        const parentGroup = document.getElementById("ascii-options");
        if (parentGroup) {
          parentGroup.classList.remove("show-warning-popup");
          void parentGroup.offsetWidth;
          parentGroup.classList.add("show-warning-popup");

          const anyGroup = parentGroup as any;
          if (anyGroup._warningTimeout) clearTimeout(anyGroup._warningTimeout);
          anyGroup._warningTimeout = setTimeout(() => {
            parentGroup.classList.remove("show-warning-popup");
          }, 2000);
        }
      }
    });
  });
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

function initGlobalKeyboardListener(): void {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "SELECT")
    ) {
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;

    const textarea = document.getElementById(
      "passphrase-input",
    ) as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.focus();
    }
  });
}

document.addEventListener("change", (e) => {
  if (e.target instanceof HTMLSelectElement) {
    e.target.blur();
  }
});
