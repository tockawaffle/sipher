import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

const PUBLIC_ROUTES = [
	'/auth/login',
	'/auth/signup',
	'/api/auth',
	'/_next',
	'/favicon.ico',
	'/static',
	'/images',
];

const isPublicRoute = (path: string) => {
	return PUBLIC_ROUTES.some(route => path.startsWith(route));
}

export async function middleware(request: NextRequest) {
	
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set('x-current-pathname', request.url)
	requestHeaders.set('x-next-pathname', request.nextUrl.pathname);
	
	let response = NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
	
	try {
		const supabase = await createClient();
		const {data: {user}, error} = await supabase.auth.getUser();
		const path = request.nextUrl.pathname;
		
		if (!user && !isPublicRoute(path)) {
			const redirectUrl = new URL('/auth/login', request.url);
			if (request.nextUrl.search) {
				redirectUrl.search = request.nextUrl.search;
			}
			redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
			const redirect = NextResponse.redirect(redirectUrl);
			redirect.headers.set('x-current-pathname', path);
			return redirect;
		}
		
		if (user && path.startsWith('/auth/') && !path.includes("/auth/complete")) {
			return NextResponse.redirect(new URL('/', request.url));
		}
		
		if (user?.id) {
			response.headers.set('x-user-id', user.id);
		}
		
		return response;
	} catch (error) {
		console.error('Middleware error:', error);
		return response;
	}
}

export const config = {
	matcher: [
		'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
		"/api/preferences/language",
	],
}