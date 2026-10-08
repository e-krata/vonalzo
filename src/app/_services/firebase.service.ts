import { Injectable } from "@angular/core";
import { FirebaseX } from "@ionic-native/firebase-x/ngx";
import { environment } from "src/environments/environment";
import { Jwt, Institute } from "../_models";

@Injectable({
    providedIn: "root",
})
export class FirebaseService {
    private initialized = false;

    constructor(private firebase: FirebaseX) {}

    public async initialize(currentUser: Jwt, institute: Institute) {
        if (this.initialized) return;
        if (!currentUser) {
            this.initialized = true;
            return;
        }

        try {
            const userId =
                currentUser["kreta:institute_user_unique_id"] ||
                currentUser["kreta:institute_user_id"] ||
                currentUser["kreta:user_name"] ||
                currentUser["name"] ||
                "unknown";

            if (this.firebase && typeof this.firebase.setUserId === "function") {
                await this.firebase.setUserId(String(userId)).catch(function () {});
            }
            if (this.firebase && typeof this.firebase.setUserProperty === "function") {
                await this.firebase
                    .setUserProperty(
                        "kreta_institute_code",
                        String(currentUser["kreta:institute_code"] || "mockschool")
                    )
                    .catch(function () {});
                await this.firebase
                    .setUserProperty(
                        "kreta_institute_name",
                        institute && institute.name ? institute.name : "unknown"
                    )
                    .catch(function () {});
                await this.firebase
                    .setUserProperty(
                        "kreta_institute_city",
                        institute && institute.city ? institute.city : ""
                    )
                    .catch(function () {});
            }
            if (this.firebase && typeof this.firebase.setCrashlyticsUserId === "function") {
                await this.firebase.setCrashlyticsUserId(String(userId)).catch(function () {});
            }
        } catch (e) {
            console.warn("[Firebase] initialize skipped:", e);
        }

        this.initialized = true;
    }

    public setAnalyticsCollectionEnabled(enabled: boolean): Promise<any> {
        return this.safeCall("setAnalyticsCollectionEnabled", [enabled]);
    }

    public setPerformanceCollectionEnabled(enabled: boolean): Promise<any> {
        return this.safeCall("setPerformanceCollectionEnabled", [enabled]);
    }

    public setCrashlyticsCollectionEnabled(enabled: boolean): Promise<any> {
        return this.safeCall("setCrashlyticsCollectionEnabled", [enabled]);
    }

    public setScreenName(name: string): Promise<any> {
        return this.safeCall("setScreenName", [name]);
    }

    public startTrace(name: string): Promise<any> {
        if (this.isDisabled()) return Promise.resolve();
        return this.safeCall("startTrace", [name]);
    }

    public stopTrace(name: string): Promise<any> {
        if (this.isDisabled()) return Promise.resolve();
        return this.safeCall("stopTrace", [name]);
    }

    public logError(error: string, stackTrace?: object): Promise<any> {
        return this.safeCall("logError", [error, stackTrace]);
    }

    public logEvent(type: string, data?: any): Promise<any> {
        return this.safeCall("logEvent", [type, data ? data : {}]);
    }

    public unregister(): Promise<any> {
        return this.safeCall("unregister", []);
    }

    private isDisabled() {
        return !environment.production;
    }

    public fetchConfig(): Promise<any> {
        return this.safeCall("fetch", []);
    }

    public activateFetchedConfig(): Promise<any> {
        return this.safeCall("activateFetched", []);
    }

    public getConfigValue(key: string): Promise<any> {
        if (!this.firebase || typeof this.firebase.getValue !== "function") {
            return Promise.resolve(
                environment.deviceDefaultConfig
                    ? environment.deviceDefaultConfig[key]
                    : undefined
            );
        }
        return this.firebase.getValue(key).catch(() => {
            return environment.deviceDefaultConfig
                ? environment.deviceDefaultConfig[key]
                : undefined;
        });
    }

    private safeCall(method: string, args: any[]): Promise<any> {
        try {
            if (!this.firebase || typeof this.firebase[method] !== "function") {
                return Promise.resolve();
            }
            const result = this.firebase[method].apply(this.firebase, args);
            if (result && typeof result.then === "function") {
                return result.catch(function (e) {
                    console.warn("[Firebase] " + method + " failed:", e);
                    return undefined;
                });
            }
            return Promise.resolve(result);
        } catch (e) {
            console.warn("[Firebase] " + method + " threw:", e);
            return Promise.resolve();
        }
    }
}
