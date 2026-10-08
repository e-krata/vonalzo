import { Injectable } from "@angular/core";
import { HttpHeaders } from "@angular/common/http";
import { Observable, of, from } from "rxjs";
import { map, switchMap } from "rxjs/operators";
import { File, FileEntry } from "@ionic-native/file/ngx";
import { FileTransfer, FileTransferObject } from "@ionic-native/file-transfer/ngx";
import { Institute, TokenResponse, Jwt } from "../_models";
import { DataService } from "./data.service";
import { KretaService } from "./kreta.service";
import { FirebaseService } from "./firebase.service";

@Injectable({
    providedIn: "root",
})
export class KretaEUgyService {
    public host =
        "https://ujkreta.onrender.com/integration-kretamobile-api/v1/";

    private get base(): string {
        return (
            (this.kreta.baseUrl || "https://ujkreta.onrender.com") +
            "/integration-kretamobile-api/v1/kommunikacio"
        );
    }

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
        private file: File,
        private fileTransfer: FileTransfer,
        private firebase: FirebaseService
    ) {}

    public async getValidAccessToken(forceRefresh: boolean = false): Promise<string> {
        const token = await this.kreta.getValidAccessToken(forceRefresh);
        this._currentEugyUser = this.kreta.currentUser;
        return token;
    }

    public async getToken(
        username: string,
        password: string,
        institute: Institute
    ): Promise<TokenResponse> {
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

    private normalizeListItem(item: any): any {
        if (!item) {
            return item;
        }
        const id = item.azonosito || item.uzenetAzonosito || item.Uid || item.id || item.Id;
        return Object.assign({}, item, {
            azonosito: id,
            uzenetAzonosito: item.uzenetAzonosito || id,
            uzenetTargy: item.uzenetTargy || item.targy || item.Targy || "(nincs tárgy)",
            targy: item.targy || item.Targy || item.uzenetTargy || "",
            szoveg: item.szoveg || item.Szoveg || item.preview || "",
            uzenetKuldesDatum: item.uzenetKuldesDatum
                ? new Date(item.uzenetKuldesDatum)
                : item.datum
                ? new Date(item.datum)
                : item.Datum
                ? new Date(item.Datum)
                : new Date(),
            isOlvasott:
                item.isOlvasott != null
                    ? item.isOlvasott
                    : item.IsOlvasott != null
                    ? item.IsOlvasott
                    : false,
            feladoNev: item.feladoNev || item.FeladoNev || "",
            cimzettNev: item.cimzettNev || item.CimzettNev || "",
        });
    }

    /** GET /postaladaelemek/sajat */
    public getMessageList(
        state: "inbox" | "outbox" | "deleted",
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
                return list.map(item => this.normalizeListItem(item));
            })
        );
    }

    /** GET /postaladaelemek/{id} */
    public getMessage(messageId: number, forceRefresh: boolean = false): Observable<any> {
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
                const n = this.normalizeListItem(item);
                // Régi UI: message.uzenet.szoveg stb.
                if (n && !n.uzenet) {
                    n.uzenet = {
                        targy: n.targy,
                        szoveg: n.szoveg,
                        felado: { nev: n.feladoNev },
                        cimzettLista: n.cimzettNev ? [{ nev: n.cimzettNev }] : [],
                    };
                }
                return n;
            })
        );
    }

    public binMessages(action: "put" | "remove", messageIdList: number[]): Observable<any> {
        console.warn("[EUGY] binMessages nincs az új API-n");
        return of({ success: false });
    }

    public deleteMessages(messageIdList: number[]): Observable<any> {
        console.warn("[EUGY] deleteMessages nincs az új API-n");
        return of({ success: false });
    }

    /** POST /uzenetek/olvasott – UI: "read" | "unread" */
    public changeMessageState(
        newState: "read" | "unread",
        messageIdList: number[]
    ): Observable<any> {
        const url = this.base + "/uzenetek/olvasott";
        const body = {
            isOlvasott: newState === "read",
            uzenetAzonositoLista: messageIdList,
        };
        return from(this.getValidAccessToken()).pipe(
            switchMap(token => this.data.postUrl(url, body, this.authHeaders(token)))
        );
    }

    public getAddresseeGroups(
        addresseeType: "tutelaries" | "students",
        groupType: "classes" | "groups"
    ): Observable<any[]> {
        return of([]);
    }

    /** UI: replyToMessage(id, targy, szoveg, attachments) → Promise */
    public replyToMessage(
        messageId: number,
        targy: string,
        szoveg: string,
        attachmentList: any[]
    ): Promise<any> {
        return this.sendNewMessage(
            [{ azonosito: null, nev: "", tipus: "" } as any],
            targy,
            szoveg,
            attachmentList
        );
    }

    /** UI: sendNewMessage(addresseeList, targy, szoveg, attachments) → Promise */
    public sendNewMessage(
        addresseeList: any[],
        targy: string,
        szoveg: string,
        attachmentList: any[]
    ): Promise<any> {
        const first =
            addresseeList && addresseeList.length > 0 ? addresseeList[0] : {};
        const body = {
            targy: targy || "",
            szoveg: szoveg || "",
            cimzettUid: first.azonosito || first.Uid || first.uid || "",
            cimzettNev: first.nev || first.Nev || first.name || "",
        };
        const url = this.base + "/uzenetek";
        return this.getValidAccessToken().then(token =>
            this.data.postUrl(url, body, this.authHeaders(token)).toPromise()
        );
    }

    public getAddresseeTypeList(): Observable<any[]> {
        return of([]);
    }

    public getAddresseListByCategory(
        category: "teachers" | "headTeachers" | "directorate" | "admins"
    ): Observable<any[]> {
        return of([]);
    }

    public getStudentsOrParents(
        category: "students" | "tutelaries",
        by: "byGroups" | "byClasses",
        groupId?: any
    ): Observable<any[]> {
        return of([]);
    }

    public async addAttachment(
        filePath: string,
        onProgressCallback?: (event: ProgressEvent) => any
    ): Promise<any> {
        console.warn("[EUGY] addAttachment nincs az új API-n");
        return null;
    }

    public removeAttachment(attachmentId: string): Promise<any> {
        return Promise.resolve();
    }

    public async getAttachment(
        fileId: string,
        fileNameWithExt: string,
        onProgressCallback?: (event: ProgressEvent) => any
    ): Promise<FileEntry> {
        console.warn("[EUGY] getAttachment nincs az új API-n");
        return null;
    }

    public clearAttachmentCache(): Promise<void> {
        return Promise.resolve();
    }
}
