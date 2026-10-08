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
            body.error_description || body.error || "Kétfaktoros azonosítás szükséges.";
    }
}

@Injectable()
export class ErrorInterceptorService implements HttpInterceptor {
    constructor() {}

    private body(error: HttpErrorResponse): any {
        return error && error.error && typeof error.error === "object" ? error.error : {};
    }

    private isTokenUrl(req: HttpRequest<any>): boolean {
        return req.url.indexOf("/connect/token") !== -1 || req.url.indexOf("/connect/mfa/verify") !== -1;
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const retryCount = this.isTokenUrl(req) ? 0 : 1;

        return next.handle(req).pipe(
            retry(retryCount),
            catchError((error: HttpErrorResponse) => {
                if (error.status < 0) {
                    return throwError(new NaploNetworkException(error));
                }

                const b = this.body(error);
                const errCode = (b.error || "").toString();
                const errDesc = (b.error_description || "").toString();
                const errDescLower = errDesc.toLowerCase();

                // Új API: 2FA szükséges
                if (errCode === "mfa_required" || b.mfa_token) {
                    return throwError(new KretaMfaRequiredException(error));
                }

                const bodyStr = req.body ? String(req.body) : "";
                const isRefreshGrant = bodyStr.indexOf("refresh_token") !== -1;

                // HTTP 400, vagy token URL-en 401
                if (error.status === 400 || (error.status === 401 && this.isTokenUrl(req))) {
                    const badPassword =
                        errDesc === "invalid_username_or_password" ||
                        errDescLower.indexOf("jelszó") !== -1 ||
                        errDescLower.indexOf("jelszo") !== -1 ||
                        errDescLower.indexOf("password") !== -1 ||
                        errDescLower.indexOf("username") !== -1 ||
                        (errCode === "invalid_grant" && this.isTokenUrl(req) && !isRefreshGrant);

                    if (badPassword && this.isTokenUrl(req)) {
                        return throwError(new KretaInvalidPasswordException());
                    }

                    if (errCode === "invalid_grant" && isRefreshGrant) {
                        return throwError(new KretaInvalidRefreshTokenException(error));
                    }

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

                if (
                    error.status === 409 &&
                    error.message &&
                    error.message.indexOf("IntezmenyMarTanevetValtott") !== -1
                ) {
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
