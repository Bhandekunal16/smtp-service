const {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} = require("../provider/dependency.map");

const {
  secretKey,
  algorithm,
  encryption_algorithm,
  Unicode_Transformation_Format,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  ENCODED_KEY,
} = require("../provider/config.map");

class Encryption {
  #KEY;

  constructor() {
    this.#KEY = createHash(algorithm).update(secretKey).digest();
  }

  encrypt(value) {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(encryption_algorithm, this.#KEY, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, Unicode_Transformation_Format),
      cipher.final(),
    ]);

    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      ENCODED_KEY,
    );
  }

  decrypt(value) {
    const buffer = Buffer.from(value, ENCODED_KEY);
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(encryption_algorithm, this.#KEY, iv);

    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString(Unicode_Transformation_Format);
  }
}

const encryptionService = new Encryption();

module.exports = function encryptionInterceptor(req, res, next) {
  try {
    const encryptedData = req.body?.data;

    if (encryptedData) {
      req.body = JSON.parse(encryptionService.decrypt(encryptedData));
    }

    const originalJson = res.json.bind(res);

    res.json = (body) => {
      const encrypted = encryptionService.encrypt(JSON.stringify(body));

      return originalJson({
        data: encrypted,
      });
    };

    next();
  } catch (err) {
    console.error("Encryption error:", err.message);

    res.status(400).json({
      error: "Invalid encrypted data",
    });
  }
};
