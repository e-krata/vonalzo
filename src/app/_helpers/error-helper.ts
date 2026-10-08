import { Injectable } from "@angular/core";
import { AlertController, ToastController } from "@ionic/angular";
import { TranslateService } from "@ngx-translate/core";
import { NaploException } from "../_exceptions";

@Injectable({
    providedIn: "root",
})
export class ErrorHelper {
    constructor(
        private alertController: AlertController,
        private toastController: ToastController,
        private translate: TranslateService
    ) {}

    private alert: HTMLIonAlertElement;
    private toast: HTMLIonToastElement;

    /** Bármilyen hiba → olvasható szöveg (új API error / error_description is) */
    formatError(error: any): string {
        if (error == null) return "null / undefined hiba";
        if (typeof error === "string") return error;

        const lines: string[] = [];

        if (error.status !== undefined || error.name === "HttpErrorResponse") {
            lines.push(("HTTP " + (error.status || "?") + " " + (error.statusText || "")).trim());
            if (error.url) lines.push("URL: " + error.url);
            if (error.message) lines.push("Msg: " + error.message);
        }

        // Új API body: { error, error_description, mfa_token, ... }
        let body = error.error;
        if (error.originalError && error.originalError.error) {
            body = error.originalError.error;
        }
        if (body != null) {
            if (typeof body === "string") {
                lines.push("Body: " + body.substring(0, 800));
            } else if (typeof body === "object") {
                if (body.error) lines.push("API error: " + body.error);
                if (body.error_description) lines.push("Leírás: " + body.error_description);
                if (body.mfa_token) lines.push("mfa_token: (van)");
                if (body.message) lines.push("message: " + body.message);
                try {
                    const raw = JSON.stringify(body);
                    if (raw.length < 600) lines.push("Body: " + raw);
                } catch (_) {}
            }
        }

        if (error.name) lines.push("Name: " + error.name);
        if (error.message && lines.indexOf("Message: " + error.message) === -1) {
            if (!lines.some(function (l) { return l.indexOf(error.message) !== -1; })) {
                lines.push("Message: " + error.message);
            }
        }
        if (error.messageTranslationKey) {
            lines.push("i18n: " + error.messageTranslationKey);
        }

        if (error.originalError && !error.originalError.error) {
            lines.push("Original: " + this.formatError(error.originalError));
        }

        if (error.stack) {
            lines.push("--- stack ---");
            lines.push(String(error.stack).substring(0, 1200));
        }

        if (lines.length === 0) {
            try {
                return JSON.stringify(error, null, 2).substring(0, 1500);
            } catch (_) {
                return String(error);
            }
        }

        return lines.join("\n");
    }

    async presentAlert(
        msg: string,
        subheader?: string | number,
        header?: string,
        okHandler?: (value: any) => boolean | void | { [key: string]: any }
    ): Promise<HTMLIonAlertElement> {
        const safeMsg = (msg || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>");

        this.alert = await this.alertController.create({
            header: header || this.translate.instant("common.error") || "Hiba",
            subHeader: subheader ? subheader.toString() : "",
            message: safeMsg,
            cssClass: "error-debug-alert",
            buttons: [
                {
                    text: this.translate.instant("common.ok") || "OK",
                    handler: okHandler,
                },
            ],
        });

        await this.alert.present();
        return this.alert;
    }

    async presentDebugError(error: any, header: string = "Hiba (debug)"): Promise<void> {
        const text = this.formatError(error);
        console.error("[DEBUG ERROR]", error);
        console.error("[DEBUG TEXT]", text);
        await this.presentAlert(text, undefined, header);
    }

    async presentToast(msg: string, duration: number = 10000): Promise<HTMLIonToastElement> {
        if (this.toast) await this.toast.dismiss().catch(function () {});

        this.toast = await this.toastController.create({
            message: msg,
            duration: duration,
            buttons: [
                {
                    text: this.translate.instant("common.ok") || "OK",
                    role: "cancel",
                },
            ],
        });
        await this.toast.present();
        return this.toast;
    }

    presentAlertFromError(
        error: NaploException | any,
        okHandler?: (value: any) => boolean | void | { [key: string]: any }
    ) {
        const details = this.formatError(error);

        let apiDesc = "";
        try {
            if (error && error.error && error.error.error_description) {
                apiDesc = error.error.error_description;
            } else if (
                error &&
                error.originalError &&
                error.originalError.error &&
                error.originalError.error.error_description
            ) {
                apiDesc = error.originalError.error.error_description;
            } else if (error && error.message && !error.messageTranslationKey) {
                apiDesc = error.message;
            }
        } catch (_) {}

        let translated = "";
        if (error && error.messageTranslationKey) {
            try {
                translated = this.translate.instant(error.messageTranslationKey);
            } catch (_) {}
        }

        const header = apiDesc || translated ? "Hiba" : "Hiba (debug)";
        let message = details;
        if (apiDesc) {
            message = apiDesc + "\n\n---\n" + details;
        } else if (translated && translated !== error.messageTranslationKey) {
            message = translated + "\n\n---\n" + details;
        }

        return this.presentAlert(message, null, header, okHandler);
    }
}