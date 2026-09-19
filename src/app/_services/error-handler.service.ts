import { Injectable, ErrorHandler } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { FirebaseX } from "@ionic-native/firebase-x/ngx";
import * as StackTrace from "stacktrace-js";

import {
    NaploHttpUnauthorizedException,
    KretaInvalidRefreshTokenException,
    KretaNewSchoolYearException,
} from "../_exceptions";
import { ErrorHelper } from "../_helpers";
import { ConfigService } from "./config.service";
import { KretaService } from "./kreta.service";
import { KretaEUgyService } from "./kreta-eugy.service";
import { StorageCacheItem } from "ionic-cache/dist/cache-storage";
import { DataService } from "./data.service";

@Injectable({
    providedIn: "root",
})
export class ErrorHandlerService extends ErrorHandler {
    constructor(
        private firebase: FirebaseX,
        private config: ConfigService,
        private kreta: KretaService,
        private eugy: KretaEUgyService,
        private errorHelper: ErrorHelper,
        private translate: TranslateService,
        private data: DataService
    ) {
        super();
    }

    async handleError(error: any): Promise<void> {
        if (error && error.promise && error.rejection) {
            // Promise rejection wrapped by zone.js
            error = error.rejection;
        }

        let stackframes: StackTrace.StackFrame[];
        try {
            if (error && typeof error === "object") {
                stackframes = await StackTrace.fromError(error).catch(() => undefined);
            }
        } catch (_) {
            stackframes = undefined;
        }

        let errorReportString = "";
        try {
            errorReportString = await this.appendAuthDebugToError(error);
        } catch (e) {
            errorReportString =
                (error && typeof error.toString === "function" ? error.toString() : String(error)) +
                "\n(auth debug failed: " +
                e +
                ")";
        }

        // Firebase plugin nélkül se dőljön el a hibakezelő
        try {
            if (this.firebase && typeof this.firebase.logError === "function") {
                await this.firebase.logError(errorReportString, stackframes);
            }
        } catch (e) {
            console.warn("Firebase logError skipped:", e);
        }

        console.error("ERROR REPORT:\n", errorReportString, stackframes || error);

        // 400 - KretaInvalidRefreshTokenException – rossz refresh token
        // 401 - NaploHttpUnauthorizedException – rossz access_token
        // 409 - KretaNewSchoolYearException – előző tanév token
        if (
            error instanceof KretaInvalidRefreshTokenException ||
            error instanceof NaploHttpUnauthorizedException ||
            error instanceof KretaNewSchoolYearException
        ) {
            this.errorHelper.presentAlertFromError(error, () => {
                this.kreta.logout();
            });
            return;
        }

        // true = mindig részletes debug alert (teszteléshez)
        // később: csak this.config.debugging
        const showDebug = this.config.debugging === true;

        if (!error || !error.handled) {
            if (showDebug) {
                await this.errorHelper.presentDebugError(error, "Hiba (debug)");
            } else {
                this.errorHelper.presentToast(
                    this.translate.instant(
                        error && error.messageTranslationKey
                            ? error.messageTranslationKey
                            : "exceptions.error-occurred"
                    ),
                    10000
                );
            }
        }

        try {
            super.handleError(error);
        } catch (_) {}
    }

    private async appendAuthDebugToError(error: any): Promise<string> {
        let output =
            typeof error === "string"
                ? error
                : error && typeof error.toString === "function"
                ? error.toString()
                : String(error);

        // Részletes formázás (HTTP body stb.)
        try {
            output = this.errorHelper.formatError(error) + "\n\n" + output;
        } catch (_) {}

        if (this.kreta && this.kreta.currentUser) {
            output += "\n\n---- Kreta Token Debug ----\n";
            output += `Auth time: ${new Date(
                this.kreta.currentUser.auth_time * 1000
            ).toISOString()}\n`;
            output += `Not before: ${new Date(this.kreta.currentUser.nbf * 1000).toISOString()}\n`;
            output += `Expiration: ${new Date(this.kreta.currentUser.exp * 1000).toISOString()}\n`;

            const rawRefreshToken = <StorageCacheItem>(
                await this.data.getRawItem("refresh_token").catch(() => null)
            );
            if (rawRefreshToken) {
                output += `Refresh token cache expiry: ${new Date(rawRefreshToken.expires)}\n`;
                output += `Refresh token length: ${
                    rawRefreshToken.value ? rawRefreshToken.value.length : "null"
                }\n`;
            } else {
                output += "Refresh token: does not exists\n";
            }
        }

        if (this.eugy && this.eugy.currentEugyUser) {
            output += "\n---- Eugy Token Debug ----\n";
            output += `Auth time: ${new Date(
                this.eugy.currentEugyUser.auth_time * 1000
            ).toISOString()}\n`;
            output += `Not before: ${new Date(
                this.eugy.currentEugyUser.nbf * 1000
            ).toISOString()}\n`;
            output += `Expiration: ${new Date(
                this.eugy.currentEugyUser.exp * 1000
            ).toISOString()}\n`;

            const rawRefreshToken = <StorageCacheItem>(
                await this.data.getRawItem("eugy_refresh_token").catch(() => null)
            );
            if (rawRefreshToken) {
                output += `Refresh token cache expiry: ${new Date(rawRefreshToken.expires)}\n`;
                output += `Refresh token length: ${
                    rawRefreshToken.value ? rawRefreshToken.value.length : "null"
                }\n`;
            } else {
                output += "Refresh token: does not exists\n";
            }
        }

        return output;
    }
}