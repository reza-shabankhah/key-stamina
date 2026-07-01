import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import * as zxcvbnFaPackage from "@zxcvbn-ts/language-fa";

const zxcvbnOptions = {
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
    ...zxcvbnFaPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  translations: zxcvbnEnPackage.translations,
};

const zxcvbn = new ZxcvbnFactory(zxcvbnOptions);

let isProcessing = false;
let nextJob: { jobId: number; password: string } | null = null;

self.onmessage = (e: MessageEvent) => {
  nextJob = e.data;
  if (!isProcessing) {
    processNext();
  }
};

function processNext() {
  if (!nextJob) return;
  isProcessing = true;
  
  const { jobId, password } = nextJob;
  nextJob = null;

  if (typeof password === "string") {
    const result = zxcvbn.check(password);
    self.postMessage({ jobId, result });
  }

  // Yield to allow incoming messages to overwrite nextJob
  setTimeout(() => {
    isProcessing = false;
    processNext();
  }, 0);
}
