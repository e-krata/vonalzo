import { Injectable } from "@angular/core";
import {
    HttpInterceptor,
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpErrorResponse,
} from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { catchError, retry } from "rxjs/operators";
import {
    NaploNetworkException,
    NaploHttpInvalidRequestException,
    NaploHttpServerSideErrorException,
    NaploHttpInvalidResponseException,
    NaploHttpException,
    NaploHttpUnauthorizedException,
    KretaInvalidPasswordException,
    KretaInvalidRefreshTokenException,
    KretaNewSchoolYearException,
} from "src/app/_exceptions";

/** Új API MFA válasz – a login kezeli */
export class KretaMfaRequiredException {
    name = "KretaMfaRequiredException";
    message: string;
    mfa_token: string;
    error: any;

    constructor(error: HttpErrorResponse) {
        this.error = error;
        const body = error && error.error ? error.error : {};
        this.mfa_token = body.mfa_token || "";
        this.message =
            body.error_description ||
            body.error ||
            "Kétfaktoros azonosítás szükséges.";
    }
}

@Injectable()
export class ErrorInterceptorService implements HttpInterceptor {
    constructor() {}

    private body(error: HttpErrorResponse): any {
        return error && error.error && typeof error.error === "object" ? error.error : {};
    }

    private isTokenUrl(req: HttpRequest<any>): boolean {
        return req.url.includes("/connect/token") || req.url.includes("/connect/mfa/verify");
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(req).pipe(
            // Login/MFA ne retry-zzon automatikusan
            retry(this.isTokenUrl(req) ? 0 : 1),
            catchError((error: HttpErrorResponse) => {
                if (error.status < 0) {
                    return throwError(new NaploNetworkException(error));
                }

                const b = this.body(error);
                const errCode = (b.error || "").toString();
                const errDesc = (b.error_description || "").toString();

                // --- Új API: 2FA szükséges (400 vagy 401) ---
                if (errCode === "mfa_required" || b.mfa_token) {
                    return throwError(new KretaMfaRequiredException(error));
                }

                // --- HTTP 400 / connect token ---
                if (error.status === 400 || (error.status === 401 && this.isTokenUrl(req))) {
                    // Hibás jelszó – régi és új API
                    // Új: { error: "invalid_grant", error_description: "Hibás felhasználónév vagy jelszó." }
                    // Régi: error_description == "invalid_username_or_password"
                    const badPassword =
                        errDesc === "invalid_username_or_password" ||
                        errDesc.toLowerCase().indexOf("jelszó") !== -1 ||
                        errDesc.toLowerCase().indexOf("jelszo") !== -1 ||
                        errDesc.toLowerCase().indexOf("password") !== -1 ||
                        errDesc.toLowerCase().indexOf("username") !== -1 ||
                        (errCode === "invalid_grant" && this.isTokenUrl(req) && !req.body?.toString?.().includes("refresh_token"));

                    if (badPassword && this.isTokenUrl(req)) {
                        return throwError(new KretaInvalidPasswordException());
                    }

                    // Refresh token grant elbukott
                    if (errCode === "invalid_grant" && req.body && String(req.body).includes("refresh_token")) {
                        return throwError(new KretaInvalidRefreshTokenException(error));
                    }

                    // Egyéb 400 – tartsuk meg az API üzenetet
                    return throwError(new NaploHttpInvalidRequestException(req, error));
                }

                if (error.status === 401) {
                    return throwError(new NaploHttpUnauthorizedException(req, error));
                }

                if (error.status === 403) {
                    return throwError(new NaploHttpInvalidRequestException(req, error));
                }

                if (error.status > 401 && error.status < 500) {
                    return throwError(new NaploHttpInvalidRequestException(req, error));
                }

                if (error.status === 409 && error.message && error.message.includes("IntezmenyMarTanevetValtott")) {
                    return throwError(new KretaNewSchoolYearException(error));
                }

                if (error.status >= 500) {
                    return throwError(new NaploHttpServerSideErrorException(req, error));
                }

                if (error.error && error.error.error instanceof SyntaxError) {
                    return throwError(new NaploHttpInvalidResponseException(req, error));
                }

                if (error instanceof HttpErrorResponse) {
                    return throwError(new NaploHttpException(req, error));
                }

                return throwError(error);
            })
        );
    }
}