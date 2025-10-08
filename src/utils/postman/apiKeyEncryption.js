import crypto from 'crypto';
import env from '../../env.js';

class ApiKeyEncryption {
    constructor() {
        // Use a secret from environment or generate one
        this.algorithm = 'aes-256-gcm';
        this.secretKey = this.getSecretKey();
    }

    getSecretKey() {
        const secret = env.ENCRYPTION_SECRET || 'default-secret-key-change-in-production';
        // Create a 32-byte key from the secret
        return crypto.createHash('sha256').update(secret).digest();
    }

    async encryptApiKey(apiKey) {
        try {
            // Generate a random initialization vector
            const iv = crypto.randomBytes(16);
            
            // Create cipher
            const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
            
            // Encrypt the API key
            let encrypted = cipher.update(apiKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Get the auth tag
            const authTag = cipher.getAuthTag();
            
            // Combine iv, authTag, and encrypted data
            const combined = {
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                encrypted: encrypted
            };
            
            // Return as base64 string
            return Buffer.from(JSON.stringify(combined)).toString('base64');
        } catch (error) {
            throw new Error('Failed to encrypt API key');
        }
    }

    async decryptApiKey(encryptedData) {
        try {
            // Parse the combined data
            const combined = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
            
            // Extract components
            const iv = Buffer.from(combined.iv, 'hex');
            const authTag = Buffer.from(combined.authTag, 'hex');
            const encrypted = combined.encrypted;
            
            // Create decipher
            const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
            decipher.setAuthTag(authTag);
            
            // Decrypt
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error('Failed to decrypt API key');
        }
    }
}

// Export singleton instance
const encryption = new ApiKeyEncryption();
export const encryptApiKey = (key) => encryption.encryptApiKey(key);
export const decryptApiKey = (encrypted) => encryption.decryptApiKey(encrypted);