import "katex/dist/katex.min.css";
import { evaluatePassword, calculateCrackTime, formatTime, Algorithm, HardwareTier, calculateRequiredGuesses, generateTargetedPassphrase, TimeUnit } from "./crypto";

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

    let hasInvalidChar = false;
    let invalidChar = "";
    const invalidMatch = textarea.value.match(/[^\x20-\x7E]/);
    if (invalidMatch) {
      hasInvalidChar = true;
      invalidChar = invalidMatch[0];
    }

    if (copyBtn) {
      if (hasInvalidChar) {
        copyBtn.disabled = false;
        copyBtn.textContent = `Invalid: ${invalidChar}`;
        copyBtn.classList.add("btn-unsupported");
      } else {
        copyBtn.disabled = !hasContent;
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("btn-unsupported");
      }
    }

    if (hasContent && !hasInvalidChar) {
      clearTimeout(evaluateTimeout);
      evaluateTimeout = window.setTimeout(() => {
        const currentJobId = ++latestInputJobId;
        evaluatePassword(textarea.value).then(result => {
          if (!result || currentJobId !== latestInputJobId) return; // Ignore stale
          updateCrackTimes(result.guesses);
          updateResistanceBadge(result.score);
        });
      }, 150);
    } else {
      clearTimeout(evaluateTimeout);
      latestInputJobId++;
      resetCrackTimes();
      resetResistanceBadge();
    }

    adjustHeight();
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (copyBtn.classList.contains("btn-unsupported")) {
        return;
      }

      if (!textarea.value) return;

      const onSuccess = () => {
        copyBtn.textContent = "Copied!";
        copyBtn.disabled = true;
      };

      const fallbackCopy = () => {
        const el = document.createElement("textarea");
        el.value = textarea.value;
        el.style.position = "fixed";
        el.style.left = "-9999px";
        el.style.top = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        try {
          document.execCommand("copy");
        } catch (e) {}
        document.body.removeChild(el);
        onSuccess();
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(textarea.value)
          .then(onSuccess)
          .catch(fallbackCopy);
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
      textarea.focus();
    });
  }
}

function initTargetTimeValueInput(): void {
  const input = document.getElementById(
    "target-time-value",
  ) as HTMLInputElement | null;
  if (!input) return;

  input.addEventListener("beforeinput", (e: InputEvent) => {
    if (e.data && !/^[0-9]+$/.test(e.data)) e.preventDefault();
  });

  input.addEventListener("input", () => {
    let clean = input.value.replace(/[^0-9]/g, "");
    if (clean.length > 3) {
      clean = "999";
    }
    input.value = clean;
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

  const visualLeftGap = 4.0;
  const visualRightGap = 2.0;

  const labelLeft = 15.2; // 0.95rem CSS match
  const leftPadding = 2.4; // 0.2rem CSS padding scaled

  let maskRaf: number;
  const updateMask = () => {
    cancelAnimationFrame(maskRaf);
    maskRaf = requestAnimationFrame(() => {
      const counterWidth =
        charCounter && charCounter.textContent ? charCounter.offsetWidth : 0;
      const scaledTextWidth = (labelCore.offsetWidth + counterWidth) * 0.75;

      const textInkLeft = labelLeft + leftPadding;
      const maskLeft = textInkLeft - visualLeftGap;
      const maskWidth = visualLeftGap + scaledTextWidth + visualRightGap;

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
  const textarea = document.getElementById("passphrase-input");
  const card = document.querySelector(".passphrase-card");

  if (!textarea || !card) return;

  textarea.addEventListener("focus", () => {
    if (window.innerWidth <= 768) {
      setTimeout(() => {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 600);
    }
  });
}

function initTooltips(): void {
  document.querySelectorAll(".clickable-title").forEach((title) => {
    title.addEventListener("click", () => {
      const container = title.parentElement;
      if (container) {
        const trigger = container.querySelector(
          ".tooltip-trigger",
        ) as HTMLElement | null;
        if (trigger) {
          if (document.activeElement === trigger) {
            trigger.blur();
          } else {
            trigger.focus();
          }
        }
      }
    });
  });
}

function initHashSelector(): void {
  const hashSelect = document.getElementById("hash-algorithm") as HTMLSelectElement | null;
  const textarea = document.getElementById("passphrase-input") as HTMLTextAreaElement | null;
  if (!hashSelect || !textarea) return;

  hashSelect.addEventListener("change", () => {
    if (textarea.value.length > 0) {
      const currentJobId = ++latestInputJobId;
      evaluatePassword(textarea.value).then(result => {
        if (!result || currentJobId !== latestInputJobId) return;
        updateCrackTimes(result.guesses);
      });
    }
  });
}

function updateCrackTimes(guesses: number): void {
  const hashSelect = document.getElementById("hash-algorithm") as HTMLSelectElement | null;
  if (!hashSelect) return;
  const algo = hashSelect.value as Algorithm;

  const tiers: HardwareTier[] = ["laptop", "pc", "server", "supercomputer"];
  const timeMapping: Record<HardwareTier, string> = {
    laptop: "time-laptop",
    pc: "time-pc",
    server: "time-server",
    supercomputer: "time-supercomputer",
  };

  tiers.forEach(tier => {
    const elId = timeMapping[tier];
    const el = document.getElementById(elId);
    if (el) {
      const timeInSeconds = calculateCrackTime(guesses, tier, algo);
      const formatted = formatTime(timeInSeconds);
      
      const valEl = el.querySelector(".time-value");
      const unitEl = el.querySelector(".time-unit");
      if (valEl) valEl.textContent = formatted.value;
      if (unitEl) unitEl.textContent = formatted.unit;
    }
  });
}

function resetCrackTimes(): void {
  const ids = ["time-laptop", "time-pc", "time-server", "time-supercomputer"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const valEl = el.querySelector(".time-value");
      const unitEl = el.querySelector(".time-unit");
      if (valEl) valEl.textContent = "  0";
      if (unitEl) unitEl.textContent = "Seconds";
    }
  });
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
  const generateBtn = document.getElementById("generate-btn");
  const formatSelect = document.getElementById("generator-format") as HTMLSelectElement | null;
  const targetHardwareSelect = document.getElementById("target-hardware") as HTMLSelectElement | null;
  const targetTimeValueInput = document.getElementById("target-time-value") as HTMLInputElement | null;
  const targetTimeUnitSelect = document.getElementById("target-time-unit") as HTMLSelectElement | null;
  const hashSelect = document.getElementById("hash-algorithm") as HTMLSelectElement | null;
  const textarea = document.getElementById("passphrase-input") as HTMLTextAreaElement | null;

  if (!generateBtn || !formatSelect || !targetHardwareSelect || !targetTimeValueInput || !targetTimeUnitSelect || !hashSelect || !textarea) return;

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

    const requiredGuesses = calculateRequiredGuesses(timeValue, timeUnit, hardware, algo);
    const passphrase = generateTargetedPassphrase(format as "ascii" | "numeric", requiredGuesses);

    textarea.value = passphrase;
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
    toggleBtn.setAttribute("aria-label", isExpanded ? "Collapse advanced options" : "Expand advanced options");
  });
}

function initDynamicFormatOptionsInteractivity(): void {
  const formatSelect = document.getElementById("generator-format") as HTMLSelectElement | null;
  const asciiOptions = document.getElementById("ascii-options");
  const dicewareOptions = document.getElementById("diceware-options");
  const separatorInput = document.getElementById("diceware-separator") as HTMLInputElement | null;

  if (formatSelect && asciiOptions && dicewareOptions) {
    formatSelect.addEventListener("change", () => {
      const format = formatSelect.value;
      if (format === "ascii") {
        asciiOptions.style.display = "flex";
        dicewareOptions.style.display = "none";
      } else if (format === "diceware") {
        asciiOptions.style.display = "none";
        dicewareOptions.style.display = "flex";
      }
    });
  }

  if (separatorInput) {
    separatorInput.addEventListener("beforeinput", (e: InputEvent) => {
      if (e.data && !/^[\x20-\x7E]$/.test(e.data)) {
        e.preventDefault();
      }
    });

    separatorInput.addEventListener("input", () => {
      const clean = separatorInput.value.replace(/[^\x20-\x7E]/g, "");
      separatorInput.value = clean.slice(0, 1);
    });

    separatorInput.addEventListener("blur", () => {
      if (!separatorInput.value) {
        separatorInput.value = " ";
      }
    });
  }
}
