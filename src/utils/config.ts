import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 读取package.json获取版本号
let version = '0.0.0';
try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(
        readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')
    );
    version = packageJson.version;
} catch (error) {
    console.warn('无法读取package.json版本信息:', error);
}

export const config = {
    version,
    api: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        AUTH_TOKEN: process.env.AUTH_TOKEN,
        API_PREFIX: process.env.API_PREFIX,
    },
    keyManagement: {
        kvPrefix: 'gemini_party_api_rotation',
        rotationResetInterval: Number(process.env.ROTATION_RESET_INTERVAL) || 60000,
        blacklistTimeout: Number(process.env.BLACKLIST_TIMEOUT) || 300000,
        defaultMaxRetries: Number(process.env.DEFAULT_MAX_RETRIES) || 3
    },
    safety: {
        HARM_CATEGORY_HARASSMENT: process.env.HARM_CATEGORY_HARASSMENT,
        HARM_CATEGORY_DANGEROUS_CONTENT: process.env.HARM_CATEGORY_DANGEROUS_CONTENT,
        HARM_CATEGORY_SEXUALLY_EXPLICIT: process.env.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        HARM_CATEGORY_HATE_SPEECH: process.env.HARM_CATEGORY_HATE_SPEECH,
        HARM_CATEGORY_CIVIC_INTEGRITY: process.env.HARM_CATEGORY_CIVIC_INTEGRITY,
    }
} as const;