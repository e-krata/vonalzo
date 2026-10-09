import { Component } from "@angular/core";
import {
    KretaService,
    ConfigService,
    NetworkStatusService,
    ConnectionStatus,
    FirebaseService,
    HwButtonService,
    KretaEUgyService,
} from "../_services";
import { ActivatedRoute, Router } from "@angular/router";
import {
    LoadingController,
    MenuController,
    ModalController,
    AlertController,
} from "@ionic/angular";
import { ErrorHelper } from "../_helpers";
import { SafariViewController } from "@ionic-native/safari-view-controller/ngx";
import { StatusBar } from "@ionic-native/status-bar/ngx";
import { InAppBrowser } from "@ionic-native/in-app-browser/ngx";
import { Market } from "@ionic-native/market/ngx";
import { KretaMissingRoleException, KretaInvalidPasswordException } from "../_exceptions";
import { TranslateService } from "@ngx-translate/core";
import { Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";

@Component({
    selector: "app-login",
    templateUrl: "./login.page.html",
    styleUrls: ["./login.page.scss"],
})
export class LoginPage {
    public username: string;
    public password: string;
    private returnUrl: string;
    public loading: boolean;

    private unsubscribe$: Subject<void>;

    constructor(
        private kreta: KretaService,
        private eugy: KretaEUgyService,
        private router: Router,
        private route: ActivatedRoute,
        private loadingController: LoadingController,
        private menuController: MenuController,
        private modalController: ModalController,
        private errorHelper: ErrorHelper,
        private safariViewController: SafariViewController,
        private statusBar: StatusBar,
        private config: ConfigService,
        private networkStatus: NetworkStatusService,
        private firebase: FirebaseService,
        private iab: InAppBrowser,
        private market: Market,
        private alertController: AlertController,
        private translate: TranslateService,
        private hwButton: HwButtonService
    ) {}

    async ionViewWillEnter() {
        this.unsubscribe$ = new Subject<void>();
        this.config.applyTheme("light", false);

        try {
            this.statusBar.styleDefault();
            this.statusBar.backgroundColorByHexString("#FDEC5D");
        } catch (e) {
            console.warn("StatusBar unavailable", e);
        }

        this.menuController.enable(false);

        this.returnUrl = this.route.snapshot.queryParams["returnUrl"] || "/";

        try {
            this.firebase.setScreenName("login");
        } catch (e) {
            console.warn("Firebase setScreenName skipped", e);
        }

        if (await this.kreta.isAuthenticated()) {
            console.log("A login page lett megnyitva, de be vagyunk jelentkezve. Átirányítás...");
            await this.router.navigate(["/timetable"]);
            return;
        }

        this.hwButton.registerHwBackButton(this.unsubscribe$, true);
    }

    ionViewWillLeave() {
        this.unsubscribe$.next();
        this.unsubscribe$.complete();
    }

    async doLogin() {
        try {
            this.firebase.startTrace("login_time");
        } catch (e) {}

        this.loading = true;
        const loading = await this.loadingController.create({
            message: this.translate.instant("login.logging-in"),
        });
        await loading.present();

        try {
            let deviceToken: string = null;
            try {
                deviceToken = await this.kreta.getDeviceToken();
            } catch (err) {}

            await this.kreta.loginWithUsername(this.username, this.password, deviceToken);

            console.log("Sikeres bejelentkezés, átirányítás: ", this.returnUrl);

            this.kreta.deleteInstituteListFromStorage();
            try {
                this.firebase.logEvent("login", { method: "kreta" });
            } catch (e) {}

            await Promise.all([
                this.menuController.enable(true),
                loading.dismiss(),
                this.config.applyTheme("light"),
            ]);

            this.router.navigate([this.returnUrl], { replaceUrl: true });
        } catch (e) {
            console.log("Hiba a bejelentkezés során: ", e);

            if (e && (e.name === "KretaMfaRequiredException" || e.mfa_token)) {
                await loading.dismiss();
                this.loading = false;
                await this.promptMfa(e.mfa_token, e.message);
                e.handled = true;
                return;
            }

            if (e instanceof KretaInvalidPasswordException) {
                try {
                    this.firebase.logEvent("login_bad_credentials");
                } catch (err) {}
                await this.errorHelper.presentAlertFromError(e);
                return;
            }

            if (e instanceof KretaMissingRoleException) {
                try {
                    this.firebase.logEvent("login_missing_role");
                } catch (err) {}
                const alert = await this.alertController.create({
                    header: this.translate.instant("login.permission-needed"),
                    message: this.translate.instant("login.teacher-role-needed"),
                    buttons: [
                        {
                            text: this.translate.instant("common.no"),
                            role: "cancel",
                        },
                        {
                            text: this.translate.instant("common.yes"),
                            handler: () => {
                                try {
                                    this.firebase.logEvent("login_ariszto_opened");
                                } catch (err) {}
                                this.market.open("hu.coware.ellenorzo");
                            },
                        },
                    ],
                });
                await alert.present();
                return;
            }

            await this.errorHelper.presentAlertFromError(e);
            if (e) {
                e.handled = true;
            }
        } finally {
            loading.dismiss();
            this.loading = false;
            try {
                this.firebase.stopTrace("login_time");
            } catch (e) {}
        }
    }

    private async promptMfa(mfaToken: string, message?: string) {
        const alert = await this.alertController.create({
            header: "Kétfaktoros azonosítás",
            message: message || "Add meg a 6 jegyű kódot az authenticator appból.",
            inputs: [
                {
                    name: "code",
                    type: "tel",
                    placeholder: "123456",
                    attributes: { maxlength: 12 },
                },
            ],
            buttons: [
                {
                    text: this.translate.instant("common.cancel") || "Mégse",
                    role: "cancel",
                },
                {
                    text: "OK",
                    handler: async data => {
                        if (!data || !data.code) {
                            return false;
                        }
                        const loading = await this.loadingController.create({
                            message: this.translate.instant("login.logging-in"),
                        });
                        await loading.present();
                        try {
                            let deviceToken: string = null;
                            try {
                                deviceToken = await this.kreta.getDeviceToken();
                            } catch (err) {}

                            await this.kreta.loginWithMfa(mfaToken, data.code, true, deviceToken);

                            this.kreta.deleteInstituteListFromStorage();
                            try {
                                this.firebase.logEvent("login", { method: "kreta_mfa" });
                            } catch (err) {}
                            await this.menuController.enable(true);
                            await this.config.applyTheme("light");
                            this.router.navigate([this.returnUrl], { replaceUrl: true });
                        } catch (mfaErr) {
                            console.error("MFA hiba:", mfaErr);
                            await this.errorHelper.presentAlertFromError(mfaErr);
                        } finally {
                            loading.dismiss();
                        }
                    },
                },
            ],
        });
        await alert.present();
    }

    openPrivacy() {
        try {
            this.firebase.logEvent("login_privacypolicy_opened");
        } catch (e) {}

        this.safariViewController.isAvailable().then(async (available: boolean) => {
            if (available) {
                this.safariViewController
                    .show({
                        url: "https://coware-apps.github.io/naplo/privacy",
                        barColor: "#3880ff",
                        toolbarColor: "#3880ff",
                        controlTintColor: "#ffffff",
                    })
                    .pipe(takeUntil(this.unsubscribe$))
                    .subscribe({
                        next: (result: any) => {},
                        error: (error: any) => {
                            console.error(error);
                        },
                    });
            } else {
                this.iab.create("https://coware-apps.github.io/naplo/privacy", "_blank", {
                    location: "yes",
                    closebuttoncaption: this.translate.instant("common.back"),
                    closebuttoncolor: "#ffffff",
                    toolbarcolor: "#3880ff",
                    zoom: "no",
                    hideurlbar: "yes",
                    hidenavigationbuttons: "yes",
                    footer: "no",
                });
            }
        }).catch(function () {});
    }
}