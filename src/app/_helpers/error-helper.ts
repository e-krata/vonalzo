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

    /** Bármilyen hiba → olvasható szöveg */
    formatError(error: any): string {
        if (error == null) return "null / undefined hiba";
        if (typeof error === "string") return error;

        const lines: string[] = [];

        // Angular HttpErrorResponse
        if (error.status !== undefined || error.name === "HttpErrorResponse") {
            lines.push(`HTTP ${error.status || "?"} ${error.statusText || ""}`.trim());
            if (error.url) lines.push(`URL: ${error.url}`);
            if (error.message) lines.push(`Msg: ${error.message}`);
            const body = error.error;
            if (body != null) {
                if (typeof body === "string") {
                    lines.push(`Body: ${body.substring(0, 800)}`);
                } else {
                    try {
                        lines.push(`Body: ${JSON.stringify(body).substring(0, 800)}`);
                    } catch {
                        lines.push(`Body: [nem serializálható]`);
                    }
                }
            }
        }

        if (error.name) lines.push(`Name: ${error.name}`);
        if (error.message && !lines.some((l) => l.includes(error.message))) {
            lines.push(`Message: ${error.message}`);
        }
        if (error.messageTranslationKey) {
            lines.push(`i18n: ${error.messageTranslationKey}`);
        }

        // Saját exception mezők
        if (error.originalError) {
            lines.push(`Original: ${this.formatError(error.originalError)}`);
        }

        if (error.stack) {
            lines.push("--- stack ---");
            lines.push(String(error.stack).substring(0, 1200));
        }

        if (lines.length === 0) {
            try {
                return JSON.stringify(error, null, 2).substring(0, 1500);
            } catch {
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
        // Ionic alert: sortöréshez <br> / whitespace
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

    /** Teljes debug alert */
    async presentDebugError(error: any, header: string = "Debug hiba"): Promise<void> {
        const text = this.formatError(error);
        console.error("[DEBUG ERROR]", error);
        console.error("[DEBUG TEXT]", text);
        await this.presentAlert(text, undefined, header);
    }

    async presentToast(msg: string, duration: number = 10000): Promise<HTMLIonToastElement> {
        if (this.toast) await this.toast.dismiss().catch(() => {});

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
        error: NaploException,
        okHandler?: (value: any) => boolean | void | { [key: string]: any }
    ) {
        let header = error.nameTranslationKey
            ? this.translate.instant(error.nameTranslationKey)
            : "Hiba történt";
        let message = error.messageTranslationKey
            ? this.translate.instant(error.messageTranslationKey)
            : error.message || this.formatError(error);

        return this.presentAlert(message, null, header, okHandler);
    }
}