import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 直接从package.json读取版本号
let version = '0.0.0'; // BUILD_VERSION_PLACEHOLDER

// 尝试在开发环境中读取package.json
try {
    // 检查是否在Deno环境
    if (typeof Deno === 'undefined') {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
        
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            version = packageJson.version || version;
        }
    }
    // 在Deno环境中，版本号会在构建时被替换
} catch (error) {
    console.warn('读取版本信息失败，使用默认版本号:', error);
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
        defaultMaxRetries: Number(process.env.DEFAULT_MAX_RETRIES) || 3,
        KEY_ROTATION_STRATEGY: process.env.KEY_ROTATION_STRATEGY || 'LEAST_USED' // LEAST_USED, RANDOM
    },
    safety: {
        HARM_CATEGORY_HARASSMENT: process.env.HARM_CATEGORY_HARASSMENT,
        HARM_CATEGORY_DANGEROUS_CONTENT: process.env.HARM_CATEGORY_DANGEROUS_CONTENT,
        HARM_CATEGORY_SEXUALLY_EXPLICIT: process.env.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        HARM_CATEGORY_HATE_SPEECH: process.env.HARM_CATEGORY_HATE_SPEECH,
        HARM_CATEGORY_CIVIC_INTEGRITY: process.env.HARM_CATEGORY_CIVIC_INTEGRITY,
    }
} as const;