// import type {ContentListUnion, GenerateContentConfig, GenerateContentParameters} from "@google/genai";
import { type SafetySetting, getValidHarmSettings } from "./safety"; // Assuming SafetySetting is exported from safety.ts

// --- Start of new type definitions based on REST API structure ---

interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64 encoded
  };
  // TODO: Add other Part types if used (e.g., functionCall, functionResponse, fileData)
}

export interface Content { // Exporting Content as it's used in systemInstruction
  parts: Part[];
  role?: 'user' | 'model' | 'system'; // Added 'system' for systemInstruction
}

// Type for the 'contents' array in the request body
export type ContentList = Content[];

// Type for 'generationConfig'
export interface GenerationConfig {
  stopSequences?: string[];
  candidateCount?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  responseMimeType?: string;
  // TODO: Add responseSchema if used
}

// Type for 'tools'
// TODO: Define FunctionDeclaration and other tool-related types if used
interface FunctionDeclaration {
    name: string;
    description: string;
    parameters?: object; // Simplified for now, ideally a JSON Schema object
}
export interface Tool {
  functionDeclarations?: FunctionDeclaration[];
  // TODO: Add codeExecution if used
}

// This will be the actual structure of the request body for the REST API
// (excluding 'model' which is in the URL)
export interface GeminiRestApiRequestBody {
  contents: ContentList;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  systemInstruction?: Content;
}

// This type represents the incoming originalBody that normalizeRequestBody might receive.
// It's a bit loose to accommodate various ways the user might send the request.
type OriginalRequestBody = Partial<GeminiRestApiRequestBody> & {
    // Fields that might have been part of the old SDK structure or common alternatives
    config?: Partial<Omit<GeminiRestApiRequestBody, 'contents'>>; // For old { config: { ... } } structure
    generation_config?: GenerationConfig; // Allow snake_case for generationConfig
    safety_settings?: SafetySetting[];   // Allow snake_case for safetySettings
    system_instruction?: Content;      // Allow snake_case for systemInstruction
    // Include other potential pre-normalized fields if necessary
    [key: string]: any; // Allow other fields that will be filtered out or processed
};


// --- End of new type definitions ---


// Fields that are considered part of the main configuration at the top level of REST API body
// or were previously under 'config' or 'generationConfig' in SDK/old structures.
const TOP_LEVEL_CONFIG_FIELDS = {
    safetySettings: true,
    systemInstruction: true,
    tools: true,
    generationConfig: true,
    // snake_case versions that might come from originalBody
    safety_settings: true,
    system_instruction: true,
    generation_config: true,
} as const;


/**
 * Extracts and merges configuration properties from the original request body.
 * Handles nesting (e.g., from a 'config' object or 'generationConfig' object)
 * and snake_case to camelCase conversion for relevant fields.
 */
function processAndBuildConfig(originalBody: OriginalRequestBody): Omit<GeminiRestApiRequestBody, 'contents'> {
    const configOutput: Omit<GeminiRestApiRequestBody, 'contents'> = {};

    // Priority 1: Top-level camelCase from originalBody
    if (originalBody.generationConfig !== undefined) configOutput.generationConfig = originalBody.generationConfig;
    if (originalBody.safetySettings !== undefined) configOutput.safetySettings = originalBody.safetySettings;
    if (originalBody.tools !== undefined) configOutput.tools = originalBody.tools;
    if (originalBody.systemInstruction !== undefined) configOutput.systemInstruction = originalBody.systemInstruction;

    // Priority 2: Top-level snake_case from originalBody (if not already set by camelCase)
    if (originalBody.generation_config !== undefined && configOutput.generationConfig === undefined) {
        configOutput.generationConfig = originalBody.generation_config;
    }
    if (originalBody.safety_settings !== undefined && configOutput.safetySettings === undefined) {
        configOutput.safetySettings = originalBody.safety_settings;
    }
    if (originalBody.system_instruction !== undefined && configOutput.systemInstruction === undefined) {
        configOutput.systemInstruction = originalBody.system_instruction;
    }
    // Tools are generally camelCase.

    // Priority 3: From originalBody.config (expected to have camelCase keys as per SDK structure)
    if (originalBody.config) {
        if (originalBody.config.generationConfig !== undefined && configOutput.generationConfig === undefined) {
            configOutput.generationConfig = originalBody.config.generationConfig;
        }
        if (originalBody.config.safetySettings !== undefined && configOutput.safetySettings === undefined) {
            configOutput.safetySettings = originalBody.config.safetySettings;
        }
        if (originalBody.config.tools !== undefined && configOutput.tools === undefined) {
            configOutput.tools = originalBody.config.tools;
        }
        if (originalBody.config.systemInstruction !== undefined && configOutput.systemInstruction === undefined) {
            configOutput.systemInstruction = originalBody.config.systemInstruction;
        }
    }
    
    // Process safetySettings using getValidHarmSettings
    // Check if safetySettings were explicitly provided in any form or already determined.
    const wasSafetySettingsProvidedOrDetermined = 
        originalBody.safetySettings !== undefined ||
        originalBody.safety_settings !== undefined ||
        (originalBody.config && originalBody.config.safetySettings !== undefined) ||
        configOutput.safetySettings !== undefined; // Already set from one of the above

    if (wasSafetySettingsProvidedOrDetermined) {
      // getValidHarmSettings can handle undefined input by applying environment defaults.
      // We pass the currently determined configOutput.safetySettings, which might be undefined
      // if only env vars are meant to apply, or it might be the user's specific settings.
      configOutput.safetySettings = getValidHarmSettings(configOutput.safetySettings);
    }


    // Filter out undefined values from the final configOutput to keep the payload clean
    for (const key in configOutput) {
        if (configOutput[key as keyof typeof configOutput] === undefined) {
            delete configOutput[key as keyof typeof configOutput];
        }
    }

    return configOutput;
}


/**
 * Validates that the 'contents' field is present in the request body.
 */
function validateContents(body: Record<string, unknown>): void {
    if (!body.contents || !Array.isArray(body.contents) || body.contents.length === 0) {
        throw new Error('Request body must include a non-empty "contents" array.');
    }
    // Further validation for each content item could be added here if needed
}

/**
 * Normalizes the incoming request body to the format expected by the Google Gemini REST API.
 * It handles requests that might still be in the old SDK format (e.g., with a 'config' object)
 * or have snake_case keys for some configuration parameters.
 *
 * @param originalBody The original request body, potentially in various formats.
 * @param _modelName The model name (unused in the REST API body, but kept for signature compatibility if needed elsewhere).
 * @returns The normalized request body for the REST API.
 * @throws If the 'contents' field is missing or invalid.
 */
export default function normalizeRequestBody(
    originalBody: OriginalRequestBody,
    _modelName?: string // modelName is not part of the REST request body itself
): GeminiRestApiRequestBody {
    validateContents(originalBody);

    const processedConfig = processAndBuildConfig(originalBody);

    const normalized: GeminiRestApiRequestBody = {
        contents: originalBody.contents as ContentList, // Assume contents are already in the correct format or will be validated
        ...processedConfig,
    };
    
    // Ensure systemInstruction is correctly typed if present
    if (normalized.systemInstruction && typeof normalized.systemInstruction === 'string') {
        normalized.systemInstruction = { parts: [{ text: normalized.systemInstruction }] };
    }


    return normalized;
}
