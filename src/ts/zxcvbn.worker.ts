import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import * as zxcvbnFaPackage from "@zxcvbn-ts/language-fa";
import { md5, sha256, bcrypt, pbkdf2, argon2id, createSHA256 } from "hash-wasm";
import type { Algorithm } from "./crypto";
import {
  KDF_PBKDF2_ITERATIONS,
  KDF_BCRYPT_COST,
  KDF_ARGON2_MEM,
  KDF_ARGON2_ITER,
  KDF_ARGON2_PARALLELISM,
} from "./crypto";

const SALT_16 = new Uint8Array([
  0x5b, 0x11, 0x9a, 0xf6, 0x3d, 0x8e, 0x4c, 0x22, 0xb9, 0x73, 0x0f, 0xc8, 0x1a,
  0xd5, 0x6e, 0x90,
]);
const SALT_8 = new Uint8Array([0x8a, 0x3c, 0x5f, 0x1d, 0x9e, 0x2b, 0x74, 0x06]);

const sha256HasherPromise = createSHA256();

const zxcvbn = new ZxcvbnFactory({
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
    ...zxcvbnFaPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  translations: zxcvbnEnPackage.translations,
});

async function hashPassword(
  password: string,
  algo: Algorithm,
): Promise<string> {
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
          iterations: KDF_PBKDF2_ITERATIONS,
          hashFunction: sha256HasherPromise,
          hashLength: 32,
        });
      case "bcrypt": {
        let bcryptPassword: string | Uint8Array = password;
        const encoded = new TextEncoder().encode(password);
        if (encoded.length > 72) {
          bcryptPassword = encoded.slice(0, 72);
        }
        return await bcrypt({
          password: bcryptPassword,
          salt: SALT_16,
          costFactor: KDF_BCRYPT_COST,
        });
      }
      case "argon2id":
        return await argon2id({
          password,
          salt: SALT_16,
          parallelism: KDF_ARGON2_PARALLELISM,
          iterations: KDF_ARGON2_ITER,
          memorySize: KDF_ARGON2_MEM,
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
  const { jobId, password, algo, skipHash } = e.data as {
    jobId: number;
    password: string;
    algo: Algorithm;
    skipHash: boolean;
  };

  const result = zxcvbn.check(password);

  let hashValue = "";
  if (!skipHash) {
    hashValue = await hashPassword(password, algo);
  }

  self.postMessage({ jobId, result, hashValue });
};
