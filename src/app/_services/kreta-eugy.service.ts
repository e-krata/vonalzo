import { Injectable } from "@angular/core";
import { HttpHeaders } from "@angular/common/http";
import { Observable, of, from } from "rxjs";
import { map, switchMap } from "rxjs/operators";
import { Institute, TokenResponse, Jwt } from "../_models";
import { DataService } from "./data.service";
import { KretaService } from "./kreta.service";
import { FirebaseService } from "./firebase.service";

/**
 * Új API e-ügyintézés
 * Base: {kreta.baseUrl}/integration-kretamobile-api/v1/kommunikacio
 * Auth: ugyanaz a Bearer, mint a napló (kreta.getValidAccessToken)
 */
@Injectable({
    providedIn: "root",
})
export class KretaEUgyService {
    private get base(): string {
        return (
            (this.kreta.baseUrl || "https://ujkreta.onrender.com") +
            "/integration-kretamobile-api/v1/kommunikacio"
        );
    }

    public host = "https://ujkreta.onrender.com/integration-kretamobile-api/v1/";

    public get currentUser(): Jwt {
        return this.kreta.currentUser;
    }

    private _currentEugyUser: Jwt;
    public get currentEugyUser(): Jwt {
        return this._currentEugyUser || this.kreta.currentUser;
    }

    constructor(
        private data: DataService,
        private kreta: KretaService,
        private firebase: FirebaseService
    ) {}

    /** Új API: ugyanaz a token, mint a napló */
    public async getValidAccessToken(forceRefresh: boolean = false): Promise<string> {
        const token = await this.kreta.getValidAccessToken(forceRefresh);
        this._currentEugyUser = this.kreta.currentUser;
        return token;
    }

    /**
     * Régi külön eügy login – új API-n nem kell.
     * Meghívható, de csak a meglévő kreta tokent használja.
     */
    public async getToken(
        username: string,
        password: string,
        institute: Institute
    ): Promise<TokenResponse> {
        // Már be vagyunk jelentkezve a kreta.loginWithUsername-mel
        const access = await this.kreta.getValidAccessToken();
        this._currentEugyUser = this.kreta.currentUser;
        return {
            access_token: access,
            refresh_token: "",
            expires_in: 43200,
            token_type: "Bearer",
        } as TokenResponse;
    }

    public async renewToken(refresh_token: string, institute: Institute): Promise<string> {
        return this.getValidAccessToken(true);
    }

    public async logout(): Promise<any> {
        this._currentEugyUser = null;
        return Promise.resolve();
    }

    public async isAuthenticated(): Promise<boolean> {
        return this.kreta.isAuthenticated();
    }

    public async isMessagingEnabled(): Promise<boolean> {
        return true;
    }

    public async getInstituteDetails(): Promise<any> {
        return this.kreta.institute;
    }

    private authHeaders(token: string): HttpHeaders {
        return new HttpHeaders()
            .set("Authorization", "Bearer " + token)
            .set("Content-Type", "application/json");
    }

    /**
     * Üzenetlista – GET /postaladaelemek/sajat
     * A UI inbox/outbox/deleted típusokat várhat; a mock egy listát ad.
     */
    public getMessageList(
        type?: "inbox" | "outbox" | "deleted" | string,
        forceRefresh: boolean = false
    ): Observable<any[]> {
        const url = this.base + "/postaladaelemek/sajat";
        return from(this.getValidAccessToken()).pipe(
            switchMap(token =>
                this.data.getUrlWithCache<any[]>(
                    url,
                    null,
                    this.authHeaders(token),
                    5 * 60,
                    forceRefresh
                )
            ),
            map(list => {
                if (!Array.isArray(list)) {
                    return [];
                }
                // Minimális normalizálás a régi Message modellhez
                return list.map(function (item) {
                    return {
                        azonosito: item.azonosito || item.Uid || item.id || item.Id,
                        uzenetAzonosito: item.uzenetAzonosito || item.azonosito || item.Uid,
                        targy: item.targy || item.Targy || item.subject || "(nincs tárgy)",
                        szoveg: item.szoveg || item.Szoveg || item.preview || "",
                        feladoNev: item.feladoNev || item.FeladoNev || item.from || "",
                        cimzettNev: item.cimzettNev || item.CimzettNev || "",
                        isOlvasott:
                            item.isOlvasott != null
                                ? item.isOlvasott
                                : item.IsOlvasott != null
                                ? item.IsOlvasott
                                : false,
                        datum: item.datum || item.Datum || item.date,
                        raw: item,
                    };
                });
            })
        );
    }

    /** Teljes üzenet – GET /postaladaelemek/{id} */
    public getMessage(messageId: number | string, forceRefresh: boolean = false): Observable<any> {
        const url = this.base + "/postaladaelemek/" + encodeURIComponent(String(messageId));
        return from(this.getValidAccessToken()).pipe(
            switchMap(token =>
                this.data.getUrlWithCache<any>(
                    url,
                    null,
                    this.authHeaders(token),
                    5 * 60,
                    forceRefresh
                )
            ),
            map(item => {
                if (!item) {
                    return item;
                }
                return {
                    azonosito: item.azonosito || item.Uid || messageId,
                    uzenetAzonosito: item.uzenetAzonosito || item.azonosito || messageId,
                    targy: item.targy || item.Targy || "",
                    szoveg: item.szoveg || item.Szoveg || item.tartalom || "",
                    feladoNev: item.feladoNev || item.FeladoNev || "",
                    cimzettNev: item.cimzettNev || item.CimzettNev || "",
                    isOlvasott: item.isOlvasott != null ? item.isOlvasott : false,
                    datum: item.datum || item.Datum,
                    raw: item,
                };
            })
        );
    }

    /** Olvasottnak jelölés – POST /uzenetek/olvasott */
    public changeMessageState(
        isOlvasott: boolean,
        messageIdList: number[]
    ): Observable<any> {
        const url = this.base + "/uzenetek/olvasott";
        const body = {
            isOlvasott: isOlvasott,
            uzenetAzonositoLista: messageIdList,
        };
        return from(this.getValidAccessToken()).pipe(
            switchMap(token =>
                this.data.postUrl(url, body, this.authHeaders(token))
            )
        );
    }

    /** Új üzenet – POST /uzenetek */
    public sendNewMessage(data: {
        targy: string;
        szoveg: string;
        cimzettUid?: string;
        cimzettNev?: string;
    }): Observable<any> {
        const url = this.base + "/uzenetek";
        const body = {
            targy: data.targy || "",
            szoveg: data.szoveg || "",
            cimzettUid: data.cimzettUid || "",
            cimzettNev: data.cimzettNev || "",
        };
        return from(this.getValidAccessToken()).pipe(
            switchMap(token =>
                this.data.postUrl(url, body, this.authHeaders(token))
            )
        );
    }

    /** Válasz – mock: ugyanaz, mint az új üzenet */
    public replyToMessage(
        originalId: number | string,
        data: { targy?: string; szoveg: string; cimzettUid?: string; cimzettNev?: string }
    ): Observable<any> {
        return this.sendNewMessage({
            targy: data.targy || "Re:",
            szoveg: data.szoveg,
            cimzettUid: data.cimzettUid,
            cimzettNev: data.cimzettNev,
        });
    }

    // --- Régi API metódusok: no-op / üres, hogy ne törjön a UI ---

    public binMessages(action: "put" | "remove", messageIdList: number[]): Observable<any> {
        console.warn("[EUGY] binMessages nincs az új API-n");
        return of({ success: false });
    }

    public deleteMessages(messageIdList: number[]): Observable<any> {
        console.warn("[EUGY] deleteMessages nincs az új API-n");
        return of({ success: false });
    }

    public getAddresseeTypeList(): Observable<any[]> {
        return of([]);
    }

    public getAddresseListByCategory(category?: string): Observable<any[]> {
        return of([]);
    }

    public getAddresseeGroups(): Observable<any[]> {
        return of([]);
    }

    public getStudentsOrParents(): Observable<any[]> {
        return of([]);
    }

    public async addAttachment(): Promise<any> {
        console.warn("[EUGY] csatolmány nincs az új API-n");
        return null;
    }

    public removeAttachment(attachmentId: string): Promise<any> {
        return Promise.resolve();
    }

    public async getAttachment(): Promise<any> {
        return null;
    }

    public clearAttachmentCache(): Promise<void> {
        return Promise.resolve();
    }
}
