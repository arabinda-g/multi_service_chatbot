import CryptoJS from 'crypto-js'

const ENV_CIPHER_PREFIX = 'enc:v1:'
const ENV_FALLBACK_KEY = 'msc_aes256_env_key_2026_q1_rotate_in_prod'
const ENV_VALUE_MARKER = '__ENV__::'

function decryptValue(value, encryptionKey) {
  if (typeof value !== 'string' || !value.startsWith(ENV_CIPHER_PREFIX)) {
    return value
  }

  const cipherText = value.slice(ENV_CIPHER_PREFIX.length)
  if (!cipherText) {
    return ''
  }

  const bytes = CryptoJS.AES.decrypt(cipherText, encryptionKey)
  const decrypted = bytes.toString(CryptoJS.enc.Utf8)
  if (!decrypted.startsWith(ENV_VALUE_MARKER)) {
    throw new Error('Unable to decrypt encrypted env value.')
  }

  return decrypted.slice(ENV_VALUE_MARKER.length)
}

export function getRuntimeEnv(rawEnv) {
  const encryptionKey = rawEnv.VITE_ENV_CRYPTO_KEY || ENV_FALLBACK_KEY

  return new Proxy(rawEnv, {
    get(target, property) {
      const value = Reflect.get(target, property)
      return decryptValue(value, encryptionKey)
    },
  })
}
