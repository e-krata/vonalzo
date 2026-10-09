import { Injectable, RendererFactory2, Inject, Renderer2 } from "@angular/core";
import { Platform } from "@ionic/angular";
import { DOCUMENT, registerLocaleData } from "@angular/common";
import { TranslateService } from "@ngx-translate/core";

import { Globalization } from "@ionic-native/globalization/ngx";
import { StatusBar } from "@ionic-native/status-bar/ngx";

import { FirebaseService } from "./firebase.service";
import { DataService } from "./data.service";

import { themes } from "../../theme/themes";
import { Institute, ErtekelesTipus } from "../_models";
import { environment } from "src/environments/environment";

@Injectable({
    providedIn: "root",
})
export class ConfigService {
    private _locale: string;
    public get locale(): string {
        return this._locale;
    }
    public set locale(v: string) {
        this.data.saveSetting("locale", v);
        this.applyLocale(v);
    }

    private _theme: string;
    public get theme(): string {
        return this._theme || "light";
    }
    public set theme(v: string) {
        this.data.saveSetting("theme", v);
        this.applyTheme(v);
    }

    private _debugging: boolean;
    public get debugging(): boolean {
        return this._debugging;
    }
    public set debugging(v: boolean) {
        this.data.saveSetting("debugging", v);
        this._debugging = v;
    }

    private _analytics: boolean;
    public get analytics(): boolean {
        return this._analytics || true;
    }
    public set analytics(v: boolean) {
        this.data.saveSetting("analytics", v);
        this._analytics = v;
        this.firebase.setAnalyticsCollectionEnabled(v);
    }

    private _defaultErtekelesTipus: ErtekelesTipus;
    public get defaultErtekelesTipus(): ErtekelesTipus {
        return this._defaultErtekelesTipus || ErtekelesTipus.Osztalyzat;
    }
    public set defaultErtekelesTipus(v: ErtekelesTipus) {
        this.data.saveSetting("defaultErtekelesTipus", v);
        this._defaultErtekelesTipus = v;
    }

    private renderer: Renderer2;

    private _swipeGestureEnabled = true;
    public get swipeGestureEnabled(): boolean {
        return this.platform.is("ios") ? this._swipeGestureEnabled : false;
    }
    public set swipeGestureEnabled(v: boolean) {
        this._swipeGestureEnabled = v;
    }

    constructor(
        private globalization: Globalization,
        private data: DataService,
        private statusBar: StatusBar,
        private rendererFactory: RendererFactory2,
        private firebase: FirebaseService,
        private translate: TranslateService,
        private platform: Platform,
        @Inject(DOCUMENT) private document: Document
    ) {
        this.renderer = this.rendererFactory.createRenderer(null, null);
    }

    public async onInit() {
        try {
            const res = await Promise.all([
                this.applyTheme().catch(function (e) {
                    console.warn("applyTheme failed", e);
                }),
                this.applyLocale().catch(function (e) {
                    console.warn("applyLocale failed", e);
                }),
                this.data.getSetting<boolean>("debugging").catch(function () {
                    return null;
                }),
                this.data.getSetting<boolean>("analytics").catch(function () {
                    return null;
                }),
                this.data.getSetting<ErtekelesTipus>("defaultErtekelesTipus").catch(function () {
                    return null;
                }),
            ]);

            this._debugging = res[2] as any;
            this._analytics = res[3] as any;
            this._defaultErtekelesTipus = res[4] as any;

            if (!environment.production) {
                try {
                    this.firebase.setAnalyticsCollectionEnabled(false);
                    this.firebase.setPerformanceCollectionEnabled(false);
                    this.firebase.setCrashlyticsCollectionEnabled(false);
                    this.firebase.unregister();
                } catch (e) {}
            } else {
                try {
                    this.firebase.setAnalyticsCollectionEnabled(this.analytics);
                } catch (e) {}
            }

            try {
                this.firebase.fetchConfig().then(() =>
                    this.firebase
                        .activateFetchedConfig()
                        .catch(function (error) {
                            console.warn("Firebase remote config error", error);
                        })
                );
            } catch (e) {}
        } catch (e) {
            console.warn("ConfigService.onInit failed (continuing)", e);
        }
    }

    public async applyTheme(theme?: string, setStatusbar: boolean = true) {
        if (!theme) {
            theme = await this.data.getSetting<string>("theme").catch(function () {
                const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
                return prefersDark.matches ? "dark" : "light";
            });
        }

        this._theme = theme;

        if (setStatusbar) {
            try {
                this.statusBar.styleLightContent();
                if (theme == "dark") {
                    this.statusBar.backgroundColorByHexString("#000000");
                } else {
                    this.statusBar.backgroundColorByHexString("#3880ff");
                }
            } catch (e) {
                console.warn("StatusBar unavailable in applyTheme", e);
            }
        }

        themes.forEach(t => {
            this.renderer.removeClass(this.document.body, t.id);
        });

        this.renderer.addClass(this.document.body, theme);
    }

    private async applyLocale(locale?: string) {
        if (!locale) {
            try {
                locale = await this.data.getSetting<string>("locale");
            } catch (_) {
                locale = null;
            }
        }

        if (!locale) {
            try {
                const g = await this.globalization.getLocaleName();
                locale = g && g.value ? g.value.substring(0, 2) : "hu";
            } catch (e) {
                console.warn("Globalization unavailable", e);
                locale = "hu";
            }
        }

        this._locale = locale;
        this.translate.use(locale);

        if (locale == "en") {
            return;
        }

        try {
            return import(
                /* webpackInclude: /(hu|de)\.js$/ */
                `@angular/common/locales/${locale}.js`
            ).then(function (module) {
                registerLocaleData(module.default);
            });
        } catch (e) {
            console.warn("Locale import failed", e);
        }
    }

    public getBackButtonText(): string | null {
        return this.platform.is("ios") ? this.translate.instant("common.back") : null;
    }
}