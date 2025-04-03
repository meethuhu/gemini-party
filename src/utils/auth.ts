const AUTH_TOKEN = process.env.AUTH_TOKEN;

const extractToken = (authHeader: string) => {
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return authHeader;
}

function checkAuth(authHeader: string): boolean {
    const token = extractToken(authHeader);
    return token === AUTH_TOKEN;
}

export default checkAuth;