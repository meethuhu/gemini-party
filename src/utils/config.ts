export const config = {
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
    },
} as const;