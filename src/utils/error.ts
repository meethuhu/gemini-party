// 创建错误响应
function createErrorResponse(error: any) {
    const status = error.status || 500;
    const message = error.error?.message || error.message || 'Unknown error';
    const type = error.error?.type || error.type || "invalid_request_error";
    return { status, body: { error: { message, type } } };
}
export default createErrorResponse;
