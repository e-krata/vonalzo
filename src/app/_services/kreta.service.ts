import { Injectable } from "@angular/core";
import { HttpHeaders, HttpParams } from "@angular/common/http";
import { Observable, of, forkJoin } from "rxjs";
import { map } from "rxjs/operators";
import {
    TanarProfil,
    Lesson,
    OsztalyTanuloi,
    Mulasztas,
    Feljegyzes,
    OraJavasoltJelenlet,
    KretaEnum,
    Institute,
    Jwt,
    Tanmenet,
    TokenResponse,
    JavasoltJelenletTemplate,
    Ertekeles,
    HaziFeladat,
    Szamonkeres,
    Tanulo,
    OsztalyCsoport,
} from "../_models";
import { JwtDecodeHelper } from "../_helpers";
import {
    KretaMissingRoleException,
    KretaInvalidResponseException,
    KretaException,
} from "../_exceptions";
import { DataService } from "./data.service";
import { FirebaseService } from "./firebase.service";
import { environment } from "src/environments/environment";

@Injectable({
    providedIn: "root",
})
export class KretaService {
    public readonly baseUrl = "https://ujkreta.onrender.com";

    private _institute: Institute = {
        instituteCode: "mockschool",
        name: "Mock Gimnázium",
        url: "https://ujkreta.onrender.com",
        city: "Budapest",
    };

    public get institute(): Institute {
        return this._institute;
    }
    public set institute(v: Institute) {
        if (v) {
            this._institute = { ...this._institute, ...v, url: this.baseUrl };
            this.data.saveSetting("institute", this._institute);
        }
    }

    private _currentUser: Jwt;
    public get currentUser(): Jwt {
        return this._currentUser;
    }

    constructor(
        private data: DataService,
        private jwtHelper: JwtDecodeHelper,
        private firebase: FirebaseService
    ) {}

    private longtermStorageExpiry = 72 * 30 * 24 * 60 * 60;
    private loginInProgress: boolean = false;

    public async onInit() {
        const saved = await this.data.getSetting<Institute>("institute").catch(() => null);
        if (saved) {
            this._institute = { ...this._institute, ...saved, url: this.baseUrl };
        }

        if (await this.isAuthenticated()) {
            const token = await this.data.getRawItem("access_token").catch(() => null);
            if (token) {
                this._currentUser = this.jwtHelper.decodeToken(token.value);
                this.firebase.initialize(this.currentUser, this.institute);
            }
        }
    }

    public async getValidAccessToken(forceRefresh: boolean = false): Promise<string> {
        if (!forceRefresh) {
            const access_token = await this.data.getItem<string>("access_token").catch(() => {
                console.debug("[LOGIN] Nincs valid AT");
                return null;
            });
            if (access_token) return access_token;
        }

        const refresh_token = await this.data.getItem<string>("refresh_token").catch(() => {
            throw Error("[LOGIN] Nincs valid RT");
        });

        if (refresh_token) {
            console.debug("[LOGIN] Van valid RT, megújítás...");
            const accessToken = await this.loginWithRefreshToken(refresh_token);
            this.firebase.initialize(this.jwtHelper.decodeToken(accessToken), this.institute);
            return accessToken;
        }

        throw new KretaException("Nincs érvényes token");
    }

    async loginWithUsername(username: string, password: string): Promise<TokenResponse> {
        const body = new HttpParams()
            .set("grant_type", "password")
            .set("username", username)
            .set("password", password);

        const response = await this.data
            .postUrl<TokenResponse>(
                this.baseUrl + "/connect/token",
                body.toString(),
                new HttpHeaders().set("Content-Type", "application/x-www-form-urlencoded")
            )
            .toPromise();

        if (!response || !response.access_token) {
            throw new KretaInvalidResponseException(response);
        }

        try {
            if (response.id_token) {
                this._currentUser = this.jwtHelper.decodeToken(response.id_token);
            } else {
                this._currentUser = this.jwtHelper.decodeToken(response.access_token);
            }
        } catch (e) {
            this._currentUser = {
                name: username,
                role: "Tanar",
                "kreta:user_name": username,
                "kreta:institute_code": "mockschool",
                "kreta:institute_user_id": "300",
            };
        }

        const roles = Array.isArray(this._currentUser.role)
            ? this._currentUser.role
            : [this._currentUser.role];

        console.debug("[LOGIN] Roles we have: ", roles);

        await Promise.all([
            this.data.saveItem(
                "access_token",
                response.access_token,
                null,
                (response.expires_in || 43200) - 30
            ),
            this.data.saveItem(
                "refresh_token",
                response.refresh_token,
                null,
                this.longtermStorageExpiry
            ),
        ]);

        this.firebase.initialize(this.currentUser, this.institute);
        return response;
    }

    private delay(timer: number): Promise<void> {
        return new Promise(resolve => setTimeout(() => resolve(), timer));
    }

    private async loginWithRefreshToken(refresh_token: string): Promise<string> {
        if (this.loginInProgress) {
            while (this.loginInProgress) await this.delay(20);
            return this.getValidAccessToken();
        }

        this.loginInProgress = true;

        try {
            await this.firebase.startTrace("token_refresh_time");

            const body = new HttpParams()
                .set("grant_type", "refresh_token")
                .set("refresh_token", refresh_token);

            const response = await this.data
                .postUrl<TokenResponse>(
                    this.baseUrl + "/connect/token",
                    body.toString(),
                    new HttpHeaders().set("Content-Type", "application/x-www-form-urlencoded")
                )
                .toPromise();

            if (response && response.access_token) {
                await Promise.all([
                    this.data.saveItem(
                        "access_token",
                        response.access_token,
                        null,
                        (response.expires_in || 43200) - 30
                    ),
                    this.data.saveItem(
                        "refresh_token",
                        response.refresh_token || refresh_token,
                        null,
                        this.longtermStorageExpiry
                    ),
                ]);

                try {
                    if (response.id_token) {
                        this._currentUser = this.jwtHelper.decodeToken(response.id_token);
                    }
                } catch {}

                console.debug("[LOGIN] AT sikeresen megújítva RT-el");
                this.firebase.stopTrace("token_refresh_time");
                return response.access_token;
            } else {
                throw new KretaInvalidResponseException(response);
            }
        } finally {
            this.loginInProgress = false;
        }
    }

    async logout() {
        await Promise.all([this.data.clearAll(), this.firebase.unregister()]);
        window.location.replace("/login");
    }

    async isAuthenticated(): Promise<boolean> {
        return (await this.data.itemExists("refresh_token")) === true;
    }

    getInstituteList(): Observable<Institute[]> {
        return of([this._institute]);
    }

    deleteInstituteListFromStorage(): Promise<void> {
        return Promise.resolve();
    }

    private getAuthenticated<T>(
        path: string,
        cacheSecs: number = 30 * 60,
        forceRefresh: boolean = false
    ): Observable<T> {
        const url = this.baseUrl + path;
        return this.data.getUrlWithCache<T>(url, null, null, cacheSecs, forceRefresh);
    }

    getTanarProfil(): Observable<TanarProfil> {
        return this.getAuthenticated<TanarProfil>(
            "/naplo/v3/sajat/TanarAdatlap",
            this.longtermStorageExpiry
        ).pipe(
            map(p => {
                if (p) {
                    (p as any).Id = p.Uid;
                }
                return p;
            })
        );
    }

    getOsztalyCsoportok(): Observable<OsztalyCsoport[]> {
        return this.getAuthenticated<OsztalyCsoport[]>("/naplo/v3/sajat/OsztalyCsoportok", 60 * 60);
    }

    getTanulok(): Observable<Tanulo[]> {
        return this.getAuthenticated<Tanulo[]>("/naplo/v3/sajat/Tanulok", 60 * 60);
    }

    getOrarendElemek(forceRefresh: boolean = false): Observable<any[]> {
        return this.getAuthenticated<any[]>(
            "/naplo/v3/sajat/OrarendElemek",
            30 * 60,
            forceRefresh
        );
    }

    getOraLista(day: Date, forceRefresh: boolean = false): Observable<Lesson[]> {
        return this.getOrarendElemek(forceRefresh).pipe(
            map((items: any[]) => {
                if (!Array.isArray(items)) return [];
                return items.map(item => this.mapToLesson(item));
            })
        );
    }

    private mapToLesson(item: any): Lesson {
        const tantargy = item.Tantargy || {};
        const osztaly = item.OsztalyCsoport || {};
        return {
            OrarendiOraId: item.Uid || item.OrarendiOraId,
            TanitasiOraId: item.TanitasiOraId || item.Uid,
            Allapot: item.Allapot || { Id: 1, Uid: "1", Nev: "Megtartott" },
            KezdeteUtc: item.KezdetIdopont || item.KezdeteUtc || item.Kezdet || item.Datum,
            VegeUtc: item.VegIdopont || item.VegeUtc || item.Vege,
            EvesOraszam: item.EvesOraszam || 0,
            Oraszam: item.Oraszam || 0,
            IsElmaradt: item.IsElmaradt || (item.Allapot && item.Allapot.Nev === "Elmaradt") || false,
            Tema: item.Tema || item.Szoveg || item.Nev || "",
            TantargyId: tantargy.Uid || item.TantargyUid || item.TantargyId,
            TantargyNev: tantargy.Nev || item.TantargyNev || item.Nev || "",
            TantargyKategoria: (tantargy.Kategoria && tantargy.Kategoria.Nev) || item.TantargyKategoria || "",
            OsztalyCsoportId: osztaly.Uid || item.OsztalyCsoportUid || item.OsztalyCsoportId,
            OsztalyCsoportNev: osztaly.Nev || item.OsztalyCsoportNev || "",
            TeremNev: item.TeremNeve || item.TeremNev || "",
            HazifeladatSzovege: item.HazifeladatSzovege,
            HazifeladatId: item.HazifeladatId,
            HazifeladatHataridoUtc: item.HazifeladatHataridoUtc,
            OraTulajdonosTanar: item.OraTulajdonosTanar || {
                Id: 300,
                Uid: "300",
                Nev: item.TanarNeve || "Tanár",
            },
            HelyettesitoId: item.HelyettesitoId,
        } as Lesson;
    }

    getErtekelesek(forceRefresh: boolean = false): Observable<Ertekeles[]> {
        return this.getAuthenticated<Ertekeles[]>(
            "/naplo/v3/sajat/Ertekelesek",
            15 * 60,
            forceRefresh
        );
    }

    getHaziFeladatok(forceRefresh: boolean = false): Observable<HaziFeladat[]> {
        return this.getAuthenticated<HaziFeladat[]>(
            "/naplo/v3/sajat/HaziFeladatok",
            15 * 60,
            forceRefresh
        );
    }

    getMulasztasok(forceRefresh: boolean = false): Observable<Mulasztas[]> {
        return this.getAuthenticated<Mulasztas[]>(
            "/naplo/v3/sajat/Mulasztasok",
            15 * 60,
            forceRefresh
        );
    }

    getBejelentettSzamonkeresek(forceRefresh: boolean = false): Observable<Szamonkeres[]> {
        return this.getAuthenticated<Szamonkeres[]>(
            "/naplo/v3/sajat/BejelentettSzamonkeresek",
            15 * 60,
            forceRefresh
        );
    }

    postErtekeles(data: Partial<Ertekeles>): Observable<Ertekeles> {
        return this.data.postUrl<Ertekeles>(
            this.baseUrl + "/naplo/v3/sajat/Ertekelesek",
            data,
            new HttpHeaders().set("Content-Type", "application/json")
        );
    }

    postHaziFeladat(data: Partial<HaziFeladat>): Observable<HaziFeladat> {
        return this.data.postUrl<HaziFeladat>(
            this.baseUrl + "/naplo/v3/sajat/HaziFeladatok",
            data,
            new HttpHeaders().set("Content-Type", "application/json")
        );
    }

    postMulasztas(data: Partial<Mulasztas>): Observable<Mulasztas> {
        return this.data.postUrl<Mulasztas>(
            this.baseUrl + "/naplo/v3/sajat/Mulasztasok",
            data,
            new HttpHeaders().set("Content-Type", "application/json")
        );
    }

    postSzamonkeres(data: Partial<Szamonkeres>): Observable<Szamonkeres> {
        return this.data.postUrl<Szamonkeres>(
            this.baseUrl + "/naplo/v3/sajat/BejelentettSzamonkeresek",
            data,
            new HttpHeaders().set("Content-Type", "application/json")
        );
    }

    getNaploEnum(engedelyezettEnumName: string = "MulasztasTipusEnum"): Promise<KretaEnum[]> {
        // Id values match the old official API conventions so the existing UI keeps working
        const mocks: { [key: string]: KretaEnum[] } = {
            MulasztasTipusEnum: [
                { Id: 1, Uid: "1", Nev: "Hiányzás", Leiras: "Hiányzás" },
                { Id: 2, Uid: "2", Nev: "Késés", Leiras: "Késés" },
            ],
            ErtekelesTipusEnum: [
                { Id: 1, Uid: "1", Nev: "Évközi jegy/értékelés", Leiras: "Évközi jegy/értékelés" },
                { Id: 2, Uid: "2", Nev: "Írásbeli", Leiras: "Írásbeli felelet" },
                { Id: 3, Uid: "3", Nev: "Szóbeli", Leiras: "Szóbeli felelet" },
            ],
            ErtekelesModEnum: [
                { Id: 1, Uid: "1", Nev: "Jegy", Leiras: "Számjegy" },
                { Id: 2, Uid: "2", Nev: "Százalék", Leiras: "Százalék" },
                { Id: 3, Uid: "3", Nev: "Szöveges", Leiras: "Szöveges" },
            ],
            OsztalyzatTipusEnum: [
                // old UI does: markCodes.find(x => x.Id == this.mark + 1500)
                { Id: 1501, Uid: "1", Nev: "1", Leiras: "Elégtelen" },
                { Id: 1502, Uid: "2", Nev: "2", Leiras: "Elégséges" },
                { Id: 1503, Uid: "3", Nev: "3", Leiras: "Közepes" },
                { Id: 1504, Uid: "4", Nev: "4", Leiras: "Jó" },
                { Id: 1505, Uid: "5", Nev: "5", Leiras: "Jeles" },
            ],
            EsemenyTipusEnum: [],
        };
        return Promise.resolve(mocks[engedelyezettEnumName] || []);
    }

    getOsztalyTanuloi(osztalyCsoportId: any): Observable<OsztalyTanuloi> {
        return this.getTanulok().pipe(
            map(tanulok => {
                const filtered = (tanulok || []).filter(
                    t =>
                        !osztalyCsoportId ||
                    (t.OsztalyCsoport && t.OsztalyCsoport.Uid === String(osztalyCsoportId)) ||
(t.OsztalyCsoport && t.OsztalyCsoport.Uid && t.OsztalyCsoport.Uid.indexOf(String(osztalyCsoportId)) !== -1)
                );
                return {
                    Tanulok: filtered.map(t => ({
                        Id: t.Uid,
                        Nev: t.Nev,
                        ...t,
                    })),
                } as any;
            })
        );
    }

    getJavasoltJelenletTemplate(
        lessonState: "Nem_naplozott" | "Naplozott"
    ): Observable<JavasoltJelenletTemplate[]> {
        return of([]);
    }

    getJavasoltJelenlet(lesson: Lesson): Observable<OraJavasoltJelenlet> {
        return of({} as any);
    }

    getMulasztas(tanoraid: number): Observable<Mulasztas[]> {
        return this.getMulasztasok();
    }

    getFeljegyzes(tanoraid: number): Observable<Feljegyzes[]> {
        return of([]);
    }

    getTanmenet(lesson: Lesson, forceRefresh?: boolean): Observable<Tanmenet> {
        return of({ Items: [] } as any);
    }

    postLesson(data: object): Observable<any> {
        console.warn("postLesson is not supported by ujkreta mock API");
        return of({ success: false, message: "Not supported" });
    }

    /**
     * Compatibility wrapper: the old UI sends a v2-style array payload.
     * We transform each student grade into a separate POST to the ujkreta API.
     */
    postEvaluation(data: any): Observable<any> {
        // data is expected to be an array like:
        // [{ DatumUtc, Mod, Tipus, Tema, OsztalycsoportId, TantargyId, TanuloLista: [...] }]
        const items = Array.isArray(data) ? data : [data];
        const requests: Observable<any>[] = [];

        for (const group of items) {
            const tanuloLista = group.TanuloLista || [];
            for (const tanulo of tanuloLista) {
                const ertekeles = tanulo.Ertekeles || {};
                let szamErtek: number | undefined;
                let szovegesErtek: string | undefined;

                if (ertekeles.OsztalyzatTipus) {
                    // OsztalyzatTipus.Id is 1501..1505 → mark 1..5
                    let id = ertekeles.OsztalyzatTipus.Id != null ? ertekeles.OsztalyzatTipus.Id : ertekeles.OsztalyzatTipus.Uid;
                    id = typeof id === "number" ? id : parseInt(String(id), 10);
                    szamErtek = id >= 1500 ? id - 1500 : id;
                    szovegesErtek = ertekeles.OsztalyzatTipus.Nev || String(szamErtek);
                } else if (ertekeles.Szazalek != null) {
                    szamErtek = ertekeles.Szazalek;
                    szovegesErtek = ertekeles.Szazalek + "%";
                } else if (ertekeles.Szoveg) {
                    szovegesErtek = ertekeles.Szoveg;
                }

                const body: any = {
                    TantargyUid: String(group.TantargyId || ""),
                    Tema: group.Tema || "",
                    SzamErtek: szamErtek,
                    SzovegesErtek: szovegesErtek,
                    SulySzazalekErteke: 100,
                    Tipus: group.Tipus || group.Mod || { Uid: "1", Nev: "Évközi jegy/értékelés" },
                    OsztalyCsoportUid: String(group.OsztalycsoportId || group.OsztalyCsoportId || ""),
                    TanuloUid: String(tanulo.TanuloId || tanulo.Uid || ""),
                };

                Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
                requests.push(this.postErtekeles(body));
            }
        }

        if (requests.length === 0) {
            return of([]);
        }

        // forkJoin is already imported via rxjs at the top of the file
        return forkJoin(requests);
    }

    removeDayFromCache(day: Date): Promise<any> {
        return this.data.removeItem(this.baseUrl + "/naplo/v3/sajat/OrarendElemek");
    }

    removeMulasztasFromCache(tanoraid: number): Promise<any> {
        return this.data.removeItem(this.baseUrl + "/naplo/v3/sajat/Mulasztasok");
    }

    removeFeljegyzesFromCache(tanoraid: number): Promise<any> {
        return Promise.resolve();
    }
}
