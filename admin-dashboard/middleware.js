import { NextResponse } from 'next/server';

export function middleware(request) {
    const authCookie = request.cookies.get('admin_auth');
    const { pathname } = request.nextUrl;

    // Bypass auth check for login screen, Next.js system internals, and static icons
    if (
        pathname.startsWith('/login') || 
        pathname.startsWith('/_next') || 
        pathname.includes('favicon.ico')
    ) {
        return NextResponse.next();
    }

    // Redirect unauthenticated requests to login page
    if (!authCookie || !authCookie.value || authCookie.value === 'true' || authCookie.value.split('.').length !== 3) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
