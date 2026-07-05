import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import * as zxcvbnFaPackage from "@zxcvbn-ts/language-fa";
import { md5, sha256, bcrypt, pbkdf2, argon2id, createSHA256 } from "hash-wasm";

const SALT_16 = new Uint8Array([0x5b, 0x11, 0x9a, 0xf6, 0x3d, 0x8e, 0x4c, 0x22, 0xb9, 0x73, 0x0f, 0xc8, 0x1a, 0xd5, 0x6e, 0x90]);
const SALT_8 = new Uint8Array([0x8a, 0x3c, 0x5f, 0x1d, 0x9e, 0x2b, 0x74, 0x06]);

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
          salt: SALT_8,
          iterations: 600000,
          hashFunction: createSHA256(),
          hashLength: 32,
        });
      case "bcrypt":
        return await bcrypt({
          password,
          salt: SALT_16,
          costFactor: 10,
        });
      case "argon2id":
        return await argon2id({
          password,
          salt: SALT_16,
          parallelism: 1,
          iterations: 3,
          memorySize: 65536,
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
