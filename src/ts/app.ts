import "katex/dist/katex.min.css";

// One-shot callbacks, flushed on next input.
const onNextInputChange: Array<() => void> = [];

function flushInputResets(): void {
  while (onNextInputChange.length) {
    const cb = onNextInputChange.pop();
    if (cb) cb();
  }
}

initPassphraseInput();
initTargetTimeValueInput();
initBorderMaskHandling();
initMobileAutoScroll();
initTooltips();

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

  const adjustHeight = () => {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  };

  textarea.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") e.preventDefault();
  });

  textarea.addEventListener("input", () => {
    if (/[\r\n]/.test(textarea.value)) {
      textarea.value = textarea.value.replace(/[\r\n]/g, "");
    }

    flushInputResets();

    const len = textarea.value.length;
    const hasContent = len > 0;

    if (counter) counter.textContent = hasContent ? ` (${len})` : "";
    if (clearBtn) clearBtn.hidden = !hasContent;
    if (copyBtn) copyBtn.disabled = !hasContent;

    adjustHeight();
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!textarea.value) return;

      const onSuccess = () => {
        copyBtn.textContent = "Copied!";
        copyBtn.disabled = true;
        onNextInputChange.push(() => {
          copyBtn.textContent = "Copy";
          copyBtn.disabled = !textarea.value;
        });
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
      }
      onNextInputChange.length = 0;
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

  const labelLeft = 15.2; // Matches 0.95rem in CSS
  const leftPadding = 2.4; // Scaled 0.2rem CSS padding (0.75)

  const updateMask = () => {
    const counterWidth =
      charCounter && charCounter.textContent ? charCounter.offsetWidth : 0;
    const scaledTextWidth = (labelCore.offsetWidth + counterWidth) * 0.75;

    const textInkLeft = labelLeft + leftPadding;
    const maskLeft = textInkLeft - visualLeftGap;
    const maskWidth = visualLeftGap + scaledTextWidth + visualRightGap;

    borderBox.style.setProperty("--mask-width", `${maskWidth}px`);
    borderBox.style.setProperty("--mask-left", `${maskLeft}px`);
  };

  updateMask();
  textarea.addEventListener("input", updateMask);
  textarea.addEventListener("focus", updateMask);
  textarea.addEventListener("blur", updateMask);

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
