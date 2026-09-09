import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = ['/login', '/register', '/auth/callback']; 

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get('auth_token')?.value || null;
    const isLoggedIn = !!token;

    if (isLoggedIn && publicRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    if (!isLoggedIn && !publicRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};