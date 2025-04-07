/**
 * 创建标准化的错误响应
 * @param {any} error - 错误对象
 * @returns {Object} 包含状态码和错误消息的对象
 */
export default function createErrorResponse(error: any) {
    const status = error.status || 500;
    const message = error.error?.message || error.message || 'Unknown error';
    const type = error.error?.type || error.type || "invalid_request_error";
    return { status, body: { error: { message, type } } };
}