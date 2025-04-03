const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.split(",") ?? [];

if (GEMINI_API_KEY.length === 0) {
    throw new Error("GEMINI_API_KEY is not set");
}

const geminiAPIKeys = GEMINI_API_KEY;
let counterIndex = 0;

const getAPIKey = () => {
    counterIndex = counterIndex % geminiAPIKeys.length;
    const key = geminiAPIKeys[counterIndex];
    counterIndex++;

    return key;
}

export default getAPIKey;