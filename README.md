<div align="center">

# KeyStamina

**A UI-focused, browser-based sandbox for exploring password cryptography and entropy.**

<br>

<video src=".github/assets/demo.mp4" width="100%" autoplay loop muted playsinline></video>
</div>
<br>

## Overview

KeyStamina is an interactive showcase project designed to bridge the gap between abstract cryptography mathematics and premium, intuitive user experience design. It provides a real-time, highly visual environment for modeling password permutation pools, calculating Shannon Entropy, and estimating brute-force vulnerability times across modern hardware architectures.

While the mathematics driving the estimations are highly accurate and rooted in modern security baselines, the primary focus of KeyStamina is delivering a flawless, premium user experience. The tool runs entirely within the client boundary with zero external network dependencies, proving that high-performance, secure applications can also be visually stunning.

## Download & Run (Zero Dependencies)

I've streamlined the entire project—including all styling, logic, WebAssembly binaries, and dictionaries—into a single, portable HTML file that's ready to use straight out of the box.

**[Download KeyStamina-Portable.html (Latest)](https://github.com/reza-shabankhah/KeyStamina/releases/latest/download/KeyStamina-Portable.html)**

Simply download the file using the link above and open it in any modern web browser. It requires no installation, no server, and works perfectly in air-gapped or offline environments.

---

## Core Capabilities

- **CSPRNG Password Generation:** Features a robust generation suite for ASCII permutations and Diceware passphrases. It relies strictly on the Web Crypto API (`crypto.getRandomValues`) and actively eliminates modulo bias to ensure mathematical uniformity.
- **Cryptographic Hash Benchmarking:** Evaluates password resilience against specific 2026 baseline hashing algorithms, including Argon2id, bcrypt, PBKDF2, SHA-256, and MD5.
- **Client-Side Entropy Evaluation:** Utilizes an asynchronous Web Worker implementation of `zxcvbn` to perform deep pattern matching (dictionaries, spatial layouts) without ever blocking or stuttering the main UI thread.
- **Hardware-Targeted Threat Modeling:** Translates theoretical entropy into intuitive vulnerability metrics by calculating estimated time-to-crack against specific hardware profiles (from integrated laptop GPUs to nation-state supercomputing clusters).

## Technical Architecture

KeyStamina is built entirely with vanilla TypeScript, HTML, and CSS. It deliberately avoids heavy frontend frameworks like React or Vue to maximize performance and maintain a highly customized aesthetic.

### Component Layering
1. **Core Logic:** `app.ts` drives the DOM manipulation, event delegation, and state management via an integrated Console Manager.
2. **Cryptography Engine:** `crypto.ts` contains the hash rate definitions, time-scaling algorithms, and the secure generators.
3. **Web Worker Pipeline:** `zxcvbn.worker.ts` isolates the heavy dictionary processing, sequence scoring, and the WebAssembly cryptographic hash generation (`hash-wasm`).
4. **Build System:** Vite, in conjunction with `vite-plugin-singlefile`, seamlessly bundles the complex multi-file TypeScript architecture into the standalone HTML artifact.

### Cryptographic Assumptions

To provide realistic brute-force visual estimations, KeyStamina maps hardware against modern OWASP minimum parameters:
- **Argon2id:** `m=65536` (64MiB memory), `t=3` (iterations), `p=1` (parallelism)
- **bcrypt:** Work factor / cost of `10`
- **PBKDF2:** 600,000 iterations using HMAC-SHA-256

The hardware tier hash rates are calibrated to modern standards, such as a single RTX 5090 GPU yielding approximately 240 GH/s for unsalted MD5, down to roughly 1.5 kH/s for memory-hard Argon2id operations.

---

### Local Development
If you wish to explore or modify the source code locally:
```bash
git clone https://github.com/reza-shabankhah/KeyStamina.git
cd KeyStamina
npm install
npm run dev
```
