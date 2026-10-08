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
        this.statusBar.styleDefault();
        this.statusBar.backgroundColorByHexString("#FDEC5D");
        this.menuController.enable(false);

        this.returnUrl = this.route.snapshot.queryParams["returnUrl"] || "/";
        this.firebase.setScreenName("login");

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
        this.firebase.startTrace("login_time");
        this.loading = true;
        const loading = await this.loadingController.create({
            message: this.translate.instant("login.logging-in"),
        });
        await loading.present();

        try {
            let deviceToken: string = null;
            try {
                deviceToken = await this.kreta.getDeviceToken();
            } catch (_) {}

            await this.kreta.loginWithUsername(this.username, this.password, deviceToken);

            console.log("Sikeres bejelentkezés, átirányítás: ", this.returnUrl);

            this.kreta.deleteInstituteListFromStorage();
            this.firebase.logEvent("login", { method: "kreta" });