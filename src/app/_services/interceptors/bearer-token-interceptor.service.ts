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

    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        if (!req.url.startsWith("https")) {
            return next.handle(req);
        }

        const base = this.kreta.baseUrl || "https://ujkreta.onrender.com";

        if (req.url.startsWith(base) || req.url.includes("ujkreta.onrender.com")) {
            return from(this.kreta.getValidAccessToken()).pipe(
                mergeMap(token => {
                    req = req.clone({
                        setHeaders: {
                            Authorization: `Bearer ${token}`,
                        },
                    });
                    console.debug("[TOKEN INTERC] Kreta Token applied:", req.url);
                    return next.handle(req).pipe(
                        catchError((error: HttpErrorResponse) => {
                            if (error.status == 401) {
                                return from(this.kreta.getValidAccessToken(true)).pipe(
                                    mergeMap(token => {
                                        req = req.clone({
                                            setHeaders: {
                                                Authorization: `Bearer ${token}`,
                                            },
                                        });
                                        return next.handle(req);
                                    })
                                );
                            }
                            return throwError(error);
                        })
                    );
                })
            );
        }

        if (req.url.includes("eugyintezes") || req.url.includes("e-ugy")) {
            return from(this.eugy.getValidAccessToken())
                .pipe(
                    mergeMap(token => {
                        req = req.clone({
                            setHeaders: {
                                Authorization: `Bearer ${token}`,
                            },
                        });
                        return next.handle(req);
                    })
                )
                .pipe(
                    catchError((error: HttpErrorResponse) => {
                        if (error.status == 401) {
                            return from(this.eugy.getValidAccessToken(true)).pipe(
                                mergeMap(token => {
                                    req = req.clone({
                                        setHeaders: {
                                            Authorization: `Bearer ${token}`,
                                        },
                                    });
                                    return next.handle(req);
                                })
                            );
                        }
                        return throwError(error);
                    })
                );
        }

        return next.handle(req);
    }
}
