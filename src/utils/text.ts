// 转换请求体格式为 GenAI 接受的格式
function convertRequestFormat(model: string = '', body: any) {
    const newBody = { ...body }

    const { contents } = newBody;
    const [history, lastMessage] = [contents.slice(0, -1), contents.at(-1)];
    const message = lastMessage?.parts.map(({ text }: { text: string }) => text).join('\n');

    delete newBody.contents;
    newBody.history = history;
    newBody.message = message;

    // 系统指令处理
    if (newBody.systemInstruction) {
        newBody.config = newBody.config || {};
        newBody.config.systemInstruction = newBody.systemInstruction;
        delete newBody.systemInstruction;
    }
    // 安全设置处理
    if (newBody.safetySettings) {
        newBody.config = newBody.config || {};
        newBody.config.safetySettings = newBody.safetySettings;
        delete newBody.safetySettings;
    }
    // 工具处理
    if (newBody.tools) {
        newBody.config = newBody.config || {};
        newBody.config.tools = newBody.tools;
        delete newBody.tools;
    }
    // 配置参数处理
    if (newBody.generationConfig) {
        newBody.config = newBody.config || {};
        newBody.config = { ...newBody.config, ...newBody.generationConfig };
        delete newBody.generationConfig;
    }

    console.log('NewBody', JSON.stringify(newBody));

    return newBody;
}