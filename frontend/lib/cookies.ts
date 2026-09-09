import Cookies from 'js-cookie';

const TOKEN_KEY = 'auth_token';

export const setAuthToken = (token: string) => {
    Cookies.set(TOKEN_KEY, token, {
        expires: 1,
        path: '/',           
        sameSite: 'lax',     
        secure: false        
    });
};

export const getAuthToken = (): string | null => {
    return Cookies.get(TOKEN_KEY) || null;
};

export const removeAuthToken = () => {
    Cookies.remove(TOKEN_KEY, { path: '/' });
};