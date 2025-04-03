const AUTH_TOKEN = process.env.AUTH_TOKEN;

const checkAuth = (authHeader: string | undefined): boolean => {
    if (!authHeader || !AUTH_TOKEN) {
        return false;
    }

    const token = authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader;

    return token === AUTH_TOKEN;
}

export default checkAuth;
