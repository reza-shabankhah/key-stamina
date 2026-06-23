// One-shot callbacks, flushed on next input.
const onNextInputChange = [];

function flushInputResets() {
  while (onNextInputChange.length) onNextInputChange.pop()();
}

initPassphraseInput();
initTargetTimeValueInput();
initBorderMaskHandling();
initMobileAutoScroll();
initTooltips();

function initPassphraseInput() {
  const textarea = document.getElementById("passphrase-input");
  const counter = document.getElementById("char-counter");
  const clearBtn = document.getElementById("clear-input-btn");
  const copyBtn = document.getElementById("copy-btn");

  if (!textarea) return;

  const adjustHeight = () => {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });

  textarea.addEventListener("input", () => {
    if (/[\r\n]/.test(textarea.value)) {
      textarea.value = textarea.value.replace(/[\r\n]/g, "");
    }

    flushInputResets();

    const len = textarea.value.length;
    const hasContent = len > 0;

    counter.textContent = hasContent ? ` (${len})` : "";
    clearBtn.hidden = !hasContent;
    copyBtn.disabled = !hasContent;

    adjustHeight();
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!textarea.value) return;
      navigator.clipboard.writeText(textarea.value).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.disabled = true;
        onNextInputChange.push(() => {
          copyBtn.textContent = "Copy";
          copyBtn.disabled = !textarea.value;
        });
      });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      textarea.value = "";
      textarea.style.height = "28px";
      counter.textContent = "";
      clearBtn.hidden = true;
      copyBtn.textContent = "Copy";
      copyBtn.disabled = true;
      onNextInputChange.length = 0;
      textarea.focus();
    });
  }
}

function initTargetTimeValueInput() {
  const input = document.getElementById("target-time-value");
  if (!input) return;

  input.addEventListener("beforeinput", (e) => {
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

function initBorderMaskHandling() {
  const textarea = document.getElementById("passphrase-input");
  const borderBox = document.querySelector(".passphrase-border-box");
  const labelCore = document.querySelector(".label-core");
  const charCounter = document.getElementById("char-counter");
  const clearBtn = document.getElementById("clear-input-btn");

  if (!textarea || !borderBox || !labelCore) return;

  // Visual border mask gaps (pixels)
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

function initMobileAutoScroll() {
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

function initTooltips() {
  document.querySelectorAll(".clickable-title").forEach((title) => {
    title.addEventListener("click", () => {
      const container = title.parentElement;
      if (container) {
        const trigger = container.querySelector(".tooltip-trigger");
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
