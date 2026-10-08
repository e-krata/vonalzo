import { Injectable } from "@angular/core";
import {
    HttpInterceptor,
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpErrorResponse,
} from "@angular/common/http";
import { Observable, from, throwError } from "rxjs";
import { mergeMap, catchError } from "rxjs/operators";

import { KretaService } from "../kreta.service";
import { KretaEUgyService } from "../kreta-eugy.service";

@Injectable()
export class BearerTokenInterceptorService implements HttpInterceptor {
    constructor(private kreta: KretaService, private eugy: KretaEUgyService) {}

    /** Új API: ezekre NE tegyen Bearer tokent */
    private isPublicAuthUrl(url: string): boolean {
        return (
            url.includes("/connect/token") ||
            url.includes("/connect/mfa/verify") ||
            url.includes("/health") ||
            url.includes("/admin/")
        );
    }

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        if (!req.url.startsWith("https")) {
            return next.handle(req);
        }

        const base = this.kreta.baseUrl || "https://ujkreta.onrender.com";
        const isKretaApi =
            req.url.startsWith(base) || req.url.includes("ujkreta.onrender.com");

        // Login / MFA / health – token nélkül
        if (isKretaApi && this.isPublicAuthUrl(req.url)) {
            return next.handle(req);
        }

        if (isKretaApi) {
            return from(this.kreta.getValidAccessToken()).pipe(
                mergeMap(token => {
                    const authed = req.clone({
                        setHeaders: { Authorization: `Bearer ${token}` },
                    });
                    console.debug("[TOKEN INTERC] Kreta Token applied:", req.url);
                    return next.handle(authed).pipe(
                        catchError((error: HttpErrorResponse) => {
                            if (error.status === 401) {
                                return from(this.kreta.getValidAccessToken(true)).pipe(
                                    mergeMap(newToken => {
                                        const retryReq = req.clone({
                                            setHeaders: {
                                                Authorization: `Bearer ${newToken}`,
                                            },
                                        });
                                        return next.handle(retryReq);
                                    })
                                );
                            }
                            return throwError(error);
                        })
                    );
                })
            );
        }

        // E-ügyintézés (új API prefix)
        if (
            req.url.includes("integration-kretamobile-api") ||
            req.url.includes("eugyintezes") ||
            req.url.includes("e-ugy") ||
            req.url.includes("kommunikacio")
        ) {
            return from(this.eugy.getValidAccessToken()).pipe(
                mergeMap(token => {
                    const authed = req.clone({
                        setHeaders: { Authorization: `Bearer ${token}` },
                    });
                    return next.handle(authed).pipe(
                        catchError((error: HttpErrorResponse) => {
                            if (error.status === 401) {
                                return from(this.eugy.getValidAccessToken(true)).pipe(
                                    mergeMap(newToken => {
                                        const retryReq = req.clone({
                                            setHeaders: {
                                                Authorization: `Bearer ${newToken}`,
                                            },
                                        });
                                        return next.handle(retryReq);
                                    })
                                );
                            }
                            return throwError(error);
                        })
                    );
                })
            );
        }

        return next.handle(req);
    }
}