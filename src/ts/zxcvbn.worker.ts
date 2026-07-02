import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import * as zxcvbnFaPackage from "@zxcvbn-ts/language-fa";
import { md5, sha256, bcrypt, pbkdf2, argon2id } from "hash-wasm";

const zxcvbn = new ZxcvbnFactory({
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
    ...zxcvbnFaPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  translations: zxcvbnEnPackage.translations,
});

async function hashPassword(password: string, algo: string): Promise<string> {
  if (!password) return "";
  try {
    switch (algo) {
      case "md5":
        return await md5(password);
      case "sha256":
        return await sha256(password);
      case "pbkdf2":
        return await pbkdf2({
          password,
          salt: new Uint8Array(8),
          iterations: 1000,
          hashAlgorithm: "SHA-256",
          keyLength: 32,
        });
      case "bcrypt":
        return await bcrypt({
          password,
          salt: new Uint8Array(16),
          cost: 4,
        });
      case "argon2id":
        return await argon2id({
          password,
          salt: new Uint8Array(16),
          parallelism: 1,
          iterations: 1,
          memorySize: 512,
          hashLength: 16,
          outputType: "encoded",
        });
      default:
        return "";
    }
  } catch {
    return "Error: Hash execution failed";
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { jobId, password, algo } = e.data;
  const result = zxcvbn.check(password);
  const hashValue = await hashPassword(password, algo);
  self.postMessage({ jobId, result, hashValue });
};
